import { create } from 'zustand'
import { api } from '../api/client'
import type { Agent, Approval, Decision, FixChoice, Message, Mode, Specialist, TurnResult } from '../api/types'
import { REVIEW_MESSAGE } from '../lib/review'
import { THREAD, stillToAnswer } from '../lib/agents'
import { useDiagnostics } from './diagnostics'
import { useSecurity } from './security'
import { useTests } from './tests'
import { showError, useUi } from './ui'
import { useWorkspace } from './workspace'

const STREAM_CHARACTERS_PER_SECOND = 160
const STREAM_CHUNK_SIZE = 8

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
  undoing: boolean
  load: (mode: Mode) => Promise<void>
  reset: () => void
  send: (mode: Mode, content: string) => Promise<boolean>
  review: (mode: Mode) => Promise<void>
  carryOn: (mode: Mode) => Promise<void>
  retryFollowUp: (id: number) => void
  decide: (id: number, decision: Decision) => Promise<string | null>
  chooseFix: (id: number, choice: FixChoice) => Promise<string | null>
  undoFix: (id: number) => Promise<string | null>
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
    return merge(get().approvals, incoming.map((a) => a.status === 'pending' ? decided.get(a.id) ?? a : a))
  }

  function add(result: TurnResult) {
    const knownApprovals = new Set(get().approvals.map((a) => a.id))
    const fixes = newFixes(result.approvals)
    set({
      messages: mergeMessages(result.messages),
      approvals: mergeApprovals(result.approvals),
    })
    const waiting = result.approvals.filter((a) => a.status === 'pending' && !knownApprovals.has(a.id)).length
    if (waiting > 0) useUi.getState().toast(`${waiting} new proposal(s) waiting for your approval.`)
    // Suggested risks are already in the security state.
    if (result.approvals.some((a) => a.status === 'suggested')) void useSecurity.getState().load()
    showTestRun(result.messages)
    void showFixes(fixes)
  }

  function newFixes(incoming: Approval[]) {
    const known = new Set(get().approvals.map((a) => a.id))
    return incoming.filter((a) => a.status === 'written' && !known.has(a.id))
  }

  // A fix the Code Reviewer wrote: the new code goes into the editor, which opens at it, and the state has its
  // mitigation. Findings below it have moved, so the ones still waiting are fetched again.
  async function showFixes(fixes: Approval[]) {
    const fix = fixes.at(-1)
    if (!fix) return
    await Promise.all([useWorkspace.getState().load(), useSecurity.getState().load(), get().load('team')])
    const file = String(fix.proposal.file)
    useWorkspace.getState().open(file)
    useDiagnostics.getState().navigate(file, Number(fix.result?.line), 1, false)
  }

  // A Test/Verifier run opens in Test Results, and each unit test's latest result is in the security state.
  function showTestRun(messages: Message[]) {
    const run = messages.find((m) => m.data.run)?.data.run
    if (!run) return
    useTests.getState().show(run)
    void useSecurity.getState().load()
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

  async function revealDelta(agent: Agent, content: string, version: number) {
    const characters = Array.from(content)
    for (let offset = 0; offset < characters.length; offset += STREAM_CHUNK_SIZE) {
      if (version !== epoch) return
      const chunk = characters.slice(offset, offset + STREAM_CHUNK_SIZE)
      appendDelta(agent, chunk.join(''))
      await new Promise<void>((resolve) => setTimeout(resolve, chunk.length * 1000 / STREAM_CHARACTERS_PER_SECOND))
    }
  }

  async function refresh(mode: Mode, version: number): Promise<Approval[]> {
    const threads = await api.threads()
    // Replies can become complete while polling. Fetch approvals afterwards so their cards cannot be missed.
    const approvals = await api.approvals()
    if (version !== epoch) return []
    const previous = new Map(get().messages.map((m) => [m.id, m]))
    const messages = (threads[THREAD[mode]] ?? []).map((m) => {
      const prior = previous.get(m.id)
      if (inFlight.has(m.id) && prior?.data.status === 'running' && m.data.status === 'queued') return prior
      return failed.has(m.id) && m.data.status !== 'complete' ? {
        ...m, data: { ...m.data, status: 'failed' as const, error: m.data.error ?? prior?.data.error },
      } : m
    })
    const fixes = newFixes(approvals)
    set({ messages: mergeMessages(messages), approvals: mergeApprovals(approvals) })
    return fixes
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
        await showFixes(await refresh('team', version)) // e.g. the page was reloaded while a fix was being written
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
    set({ messages: get().messages.map((m) => m.id === id ? { ...m, data: { ...m.data, status: 'running', error: null, started_at: Date.now() / 1000 } } : m) })
    schedule()
    try {
      const result = await api.followUp(id)
      if (version === epoch) add(result)
    } catch (error) {
      if (version === epoch) {
        failed.add(id)
        set({ messages: get().messages.map((m) => m.id === id ? { ...m, data: { ...m.data, status: 'failed', error: error instanceof Error ? error.message : String(error) } } : m) })
        showError(error)
        try {
          await showFixes(await refresh('team', version)) // Recover the saved explanation or a completed edit.
        } catch {
          // Keep the visible failure and Retry action when the connection is unavailable.
        }
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
    undoing: false,

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
      set({ messages: [], streaming: [], sending: null, working: null, turnError: null, approvals: [], undoing: false })
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
        await useWorkspace.getState().saveAll() // asking for a review in chat reviews the saved files
        if (version !== epoch) return false
        await api.sendStream(THREAD[mode], content, async (event) => {
          if (version !== epoch) return
          switch (event.type) {
            case 'message':
              saved = true
              set({ messages: mergeMessages([event.message]), sending: null })
              showTestRun([event.message])
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
              await revealDelta(event.agent, event.content, version)
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
      set({ sending: REVIEW_MESSAGE, turnError: null, working: mode === 'team' ? 'verifier' : 'assistant' })
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
        // Team mode: everything approved changes the state, and a rejected vulnerability stays listed there as rejected.
        const changesState = decided.status !== 'rejected' || decided.action_type === 'propose_vulnerability'
        if (changesState && useSecurity.getState().state) await useSecurity.getState().load()
        if (decided.status !== 'rejected') {
          if (decided.action_type === 'propose_test') await useWorkspace.getState().load()
        }
        return null
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
    chooseFix: async (id, choice) => {
      const version = epoch
      try {
        await useWorkspace.getState().saveAll() // the reviewer's fix or guidance reads the saved code
        if (version !== epoch) return null
        const chosen = await api.chooseFix(id, choice)
        if (version !== epoch) return null
        set({ approvals: get().approvals.map((a) => a.id === id ? chosen : a) })
        await get().load('team') // starts the selected durable reviewer follow-up
        return null
      } catch (error) {
        if (version !== epoch) return null
        return error instanceof Error ? error.message : String(error)
      }
    },
    undoFix: async (id) => {
      if (get().undoing || get().messages.some((message) => ['queued', 'running'].includes(message.data.status ?? ''))) {
        return 'Wait for the current code edit to finish before undoing this fix.'
      }
      const version = epoch
      const fix = get().approvals.find((approval) => approval.id === id)
      const path = String(fix?.proposal.file ?? '')
      set({ undoing: true })
      try {
        await useWorkspace.getState().save(path)
        if (useWorkspace.getState().dirty.includes(path)) throw new Error(`Save ${path} before undoing this fix.`)
        if (version !== epoch) return null
        const undone = await api.undoFix(id)
        if (version !== epoch) return null
        set({ approvals: get().approvals.map((approval) => approval.id === id ? undone : approval) })
        await Promise.all([useWorkspace.getState().load(), useSecurity.getState().load()])
        if (version !== epoch) return null
        useWorkspace.getState().open(path)
        useDiagnostics.getState().navigate(path, Number(undone.result?.line), 1, false)
        return null
      } catch (error) {
        if (version !== epoch) return null
        return error instanceof Error ? error.message : String(error)
      } finally {
        if (version === epoch) set({ undoing: false })
      }
    },
  }
})
