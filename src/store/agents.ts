import { create } from 'zustand'
import { api } from '../api/client'
import type { Agent, Approval, Decision, Message, Mode, Specialist, TurnResult } from '../api/types'
import { REVIEW_MESSAGE } from '../lib/review'
import { THREAD, stillToAnswer } from '../lib/agents'
import { useSecurity } from './security'
import { showError, useUi } from './ui'
import { useWorkspace } from './workspace'

// The conversation of the current part and the proposals waiting for the human's decision.
// In team mode each developer message has a route (e.g. Planner, then Threat Modeller); their replies stream in
// that order in one request, while follow-up jobs continue to use their own requests.
interface AgentStore {
  messages: Message[]
  streaming: Message[] // transient agent messages receiving real model deltas
  sending: string | null // the developer's message until the backend has saved it
  working: Agent | 'routing' | null // who is answering right now
  turnError: string | null
  approvals: Approval[]
  load: (mode: Mode) => Promise<void>
  reset: () => void
  send: (mode: Mode, content: string) => Promise<boolean>
  review: (mode: Mode) => Promise<void>
  carryOn: (mode: Mode) => Promise<void>
  retryFollowUp: (id: number) => void
  decide: (id: number, decision: Decision) => Promise<string | null>
}

export const useAgents = create<AgentStore>((set, get) => {
  let epoch = 0
  let activeMode: Mode | null = null
  let poll: ReturnType<typeof setTimeout> | undefined
  const inFlight = new Set<number>()
  const failed = new Set<number>()
  let streamId = -1

  function merge<T extends { id: number }>(old: T[], incoming: T[]): T[] {
    return [...new Map([...old, ...incoming].map((item) => [item.id, item])).values()].sort((a, b) => a.id - b.id)
  }

  function mergeMessages(incoming: Message[]) {
    const complete = new Map(get().messages.filter((m) => m.data.status === 'complete').map((m) => [m.id, m]))
    return merge(get().messages, incoming.map((m) => complete.get(m.id) ?? m))
  }

  function mergeApprovals(incoming: Approval[]) {
    const decided = new Map(get().approvals.filter((a) => a.status !== 'pending').map((a) => [a.id, a]))
    return merge(get().approvals, incoming.map((a) => decided.get(a.id) ?? a))
  }

  function add(result: TurnResult) {
    const knownApprovals = new Set(get().approvals.map((a) => a.id))
    set({
      messages: mergeMessages(result.messages),
      approvals: mergeApprovals(result.approvals),
    })
    const waiting = result.approvals.filter((a) => a.status === 'pending' && !knownApprovals.has(a.id)).length
    if (waiting > 0) useUi.getState().toast(`${waiting} new proposal(s) waiting for your approval.`)
    // Suggested risks are already in the security state.
    if (result.approvals.some((a) => a.status === 'suggested')) void useSecurity.getState().load()
  }

  function appendDelta(agent: Agent, content: string) {
    const streaming = [...get().streaming]
    for (let index = streaming.length - 1; index >= 0; index--) {
      if (streaming[index].data.agent === agent) {
        streaming[index] = { ...streaming[index], content: streaming[index].content + content }
        set({ streaming })
        return
      }
    }
  }

  async function refresh(mode: Mode, version: number) {
    const threads = await api.threads()
    // Replies can become complete while polling. Fetch approvals afterwards so their cards cannot be missed.
    const approvals = await api.approvals()
    if (version !== epoch) return
    const messages = (threads[THREAD[mode]] ?? []).map((m) =>
      failed.has(m.id) && m.data.status !== 'complete' ? { ...m, data: { ...m.data, status: 'failed' as const } } : m,
    )
    set({ messages: mergeMessages(messages), approvals: mergeApprovals(approvals) })
  }

  function schedule() {
    clearTimeout(poll)
    if (activeMode !== 'team') return
    const pending = get().messages.some((m) => ['queued', 'running'].includes(m.data.status ?? ''))
    if (!pending && inFlight.size === 0) return
    const version = epoch
    poll = setTimeout(async () => {
      if (version !== epoch) return
      try {
        await refresh('team', version)
      } catch {
        // Keep running requests intact while the connection recovers.
      }
      if (version === epoch) pump()
    }, 2000)
  }

  async function runFollowUp(id: number) {
    if (inFlight.has(id)) return
    inFlight.add(id)
    const version = epoch
    set({ messages: get().messages.map((m) => m.id === id ? { ...m, data: { ...m.data, status: 'running', started_at: Date.now() / 1000 } } : m) })
    schedule()
    try {
      const result = await api.followUp(id)
      if (version === epoch) add(result)
    } catch (error) {
      if (version === epoch) {
        failed.add(id)
        set({ messages: get().messages.map((m) => m.id === id ? { ...m, data: { ...m.data, status: 'failed' } } : m) })
        showError(error)
      }
    } finally {
      if (version === epoch) {
        inFlight.delete(id)
        schedule()
      }
    }
  }

  function pump() {
    if (activeMode !== 'team') return
    const actors = new Set(get().messages.filter((m) => inFlight.has(m.id)).map((m) => m.data.agent))
    for (const message of get().messages) {
      const expired = message.data.status === 'running' && (message.data.started_at ?? Infinity) < Date.now() / 1000 - 600
      if (message.data.kind !== 'vulnerability_follow_up' || failed.has(message.id)) continue
      if (message.data.status !== 'queued' && !expired) continue
      if (get().working || actors.has(message.data.agent)) continue
      actors.add(message.data.agent)
      void runFollowUp(message.id) // separate requests/sessions: fixes and tests start together
    }
    schedule()
  }

  async function follow(next: Specialist | null, version: number) {
    while (next && version === epoch) {
      set({ working: next })
      const result = await api.next()
      if (version !== epoch) return
      add(result)
      next = result.next
    }
  }

  async function recover(error: unknown, mode: Mode, version: number) {
    if (version !== epoch) return
    set({ streaming: [], turnError: error instanceof Error ? error.message : String(error) })
    showError(error)
    await get().load(mode) // shows whatever was saved, e.g. a message whose answer failed
  }

  return {
    messages: [],
    streaming: [],
    sending: null,
    working: null,
    turnError: null,
    approvals: [],

    load: async (mode) => {
      activeMode = mode
      const version = epoch
      try {
        await refresh(mode, version)
        if (version === epoch) pump()
      } catch (error) {
        showError(error)
      }
    },

    reset: () => {
      epoch++
      activeMode = null
      clearTimeout(poll)
      inFlight.clear()
      failed.clear()
      set({ messages: [], streaming: [], sending: null, working: null, turnError: null, approvals: [] })
    },

    retryFollowUp: (id) => {
      failed.delete(id)
      void runFollowUp(id)
    },

    send: async (mode, content) => {
      const version = epoch
      const first = !get().messages.some((m) => m.role === 'human')
      set({ sending: content, turnError: null, working: mode === 'single' ? 'assistant' : first ? 'planner' : 'routing' })
      let saved = false
      let next: Specialist | null = null
      try {
        await api.sendStream(THREAD[mode], content, (event) => {
          if (version !== epoch) return
          switch (event.type) {
            case 'message':
              saved = true
              set({ messages: mergeMessages([event.message]), sending: null })
              break
            case 'agent_start':
              set({
                working: event.agent,
                streaming: [
                  ...get().streaming,
                  {
                    id: streamId--,
                    thread: THREAD[mode],
                    role: 'agent',
                    content: '',
                    data: { agent: event.agent },
                    ts: new Date().toISOString(),
                  },
                ],
              })
              break
            case 'delta':
              appendDelta(event.agent, event.content)
              break
            case 'agent_complete':
              set({ streaming: get().streaming.filter((message) => message.data.agent !== event.agent) })
              add({ messages: [event.message], approvals: event.approvals, next: null })
              break
            case 'done':
              next = event.next
              break
          }
        })
        if (version !== epoch) return false
        await follow(next, version)
        return true
      } catch (error) {
        await recover(error, mode, version)
        if (version !== epoch) return false
        return saved || get().messages.at(-1)?.content === content // saved, even if no answer came back
      } finally {
        if (version === epoch) {
          set({ sending: null, streaming: [], working: null })
          pump()
        }
      }
    },

    review: async (mode) => {
      const version = epoch
      set({ sending: REVIEW_MESSAGE, turnError: null, working: mode === 'team' ? 'reviewer' : 'assistant' })
      useUi.getState().showRightTab('chat')
      try {
        await useWorkspace.getState().saveAll() // the review reads the saved files
        if (version !== epoch) return
        const result = await api.review()
        if (version !== epoch) return
        add(result)
        set({ sending: null })
        await follow(result.next, version)
      } catch (error) {
        await recover(error, mode, version)
      } finally {
        if (version === epoch) {
          set({ sending: null, working: null })
          pump()
        }
      }
    },

    carryOn: async (mode) => {
      const version = epoch
      set({ turnError: null })
      try {
        await follow(stillToAnswer(get().messages)[0] ?? null, version)
      } catch (error) {
        await recover(error, mode, version)
      } finally {
        if (version === epoch) {
          set({ working: null })
          pump()
        }
      }
    },

    decide: async (id, decision) => {
      try {
        const proposal = get().approvals.find((a) => a.id === id)
        if (decision === 'approve' && proposal?.action_type === 'propose_test') {
          const path = String(proposal.proposal.path)
          await useWorkspace.getState().save(path)
          if (useWorkspace.getState().dirty.includes(path)) throw new Error(`Save ${path} before approving its replacement.`)
        }
        const decided = await api.decide(id, decision)
        set({ approvals: get().approvals.map((a) => (a.id === id ? decided : a)) })
        if (decided.status !== 'rejected') {
          if (decided.action_type === 'propose_test') await useWorkspace.getState().load()
          // Team mode: everything approved changes the state (an approved fix becomes a mitigation).
          if (useSecurity.getState().state) await useSecurity.getState().load()
          // An approved finding queues the Code Reviewer's fix; an approved fix queues the Test/Verifier's test.
          const queuesFollowUp = ['propose_vulnerability', 'suggest_fix'].includes(decided.action_type)
          if (activeMode === 'team' && queuesFollowUp) await get().load('team')
        }
        return null
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
  }
})
