import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Agent, Message, Mode, Specialist } from '../api/types'
import { AGENTS, SPECIALISTS, stillToAnswer } from '../lib/agents'
import { formatTime } from '../lib/time'
import { followUpPending, NO_VULNERABILITIES_NOTICE } from '../lib/review'
import { useAgents } from '../store/agents'
import { useSecurity } from '../store/security'
import { useTests } from '../store/tests'
import { useUi } from '../store/ui'
import { useWorkspace } from '../store/workspace'
import { ApprovalCard } from './Approvals'
import { CodeBlock } from './CodeBlock'
import { EditedFileCard } from './EditedFileCard'
import { Codicon } from './Icons'
import { Markdown } from './Markdown'

const DOING: Record<Agent, string> = {
  planner: 'planning the steps',
  threat_modeller: 'looking for threats',
  reviewer: 'reviewing your code',
  verifier: 'running the unit tests',
  assistant: 'answering',
}

function Avatar({ agent }: { agent: string }) {
  return (
    <span className="avatar" style={{ background: AGENTS[agent].color }}>
      <Codicon name={AGENTS[agent].icon} />
    </span>
  )
}

// Team mode: where the work is, from the four agents' point of view.
function TeamProgress({ messages, working }: { messages: Message[]; working: Agent | 'routing' | null }) {
  const answered = new Set(messages.filter((m) => m.role === 'agent').map((m) => m.data.agent))
  const queued = new Set(stillToAnswer(messages))
  const jobs = messages.filter(followUpPending)
  const approvals = useAgents((s) => s.approvals)
  const pending = approvals.filter((a) => a.status === 'pending').length
  const hint = jobs.length
    ? `${jobs.length} follow-up${jobs.length === 1 ? '' : 's'} in progress`
    : working === 'routing' ? 'Routing your message...'
    : working ? `${AGENTS[working].name}: ${DOING[working]}...`
    : pending ? `${pending} proposal${pending === 1 ? '' : 's'} awaiting your decision`
    : ''

  function state(agent: Specialist) {
    if (working === agent || jobs.some((m) => m.data.agent === agent && m.data.status === 'running')) return 'working'
    if (jobs.some((m) => m.data.agent === agent)) return 'queued'
    if (queued.has(agent)) return 'queued'
    return answered.has(agent) ? 'done' : 'idle'
  }

  return (
    <div className="team-progress">
      <div className="team-steps">
        {SPECIALISTS.map((agent) => (
          <span key={agent} className="team-step-wrap">
            <span className={`team-step ${state(agent)}`} style={{ '--agent-color': AGENTS[agent].color } as CSSProperties}>
              <Codicon
                name={state(agent) === 'working' ? 'loading' : AGENTS[agent].icon}
                className={state(agent) === 'working' ? 'codicon-modifier-spin' : ''}
              />
              {AGENTS[agent].name}
            </span>
          </span>
        ))}
      </div>
      {hint && <div className="team-hint" role="status">{hint}</div>}
    </div>
  )
}

function HumanMessage({ message }: { message: Message }) {
  const { route, reason, snapshot } = message.data
  return (
    <div className="msg user">
      <div className="msg-head">
        <span className="avatar user">
          <Codicon name="account" />
        </span>
        <span className="msg-author">You</span>
        <span className="msg-time">{formatTime(message.ts)}</span>
      </div>
      <div className="msg-body">
        {snapshot && (
          <div className="msg-note">
            <Codicon name="checklist" /> Code submitted for review.
          </div>
        )}
        <div className="user-text">{message.content}</div>
        {route && !snapshot && (
          <div className="route-note">
            <Codicon name="arrow-right" /> {route.map((agent) => AGENTS[agent].name).join(', then ')}
            {reason && <span className="route-reason"> · Facilitator: {reason}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function AgentMessage({ message }: { message: Message }) {
  const showRightTab = useUi((s) => s.showRightTab)
  const all = useAgents((s) => s.approvals)
  const agent = message.data.agent ?? 'assistant'
  // Suggested risks went straight into the security state, so they aren't for the human to approve or reject.
  const ids = message.data.approval_ids ?? []
  const proposals = all.filter((a) => ids.includes(a.id))
  const risks = proposals.filter((a) => a.status === 'suggested')
  const approvals = proposals.filter((a) => a.status !== 'suggested')
  const threatExample = message.data.threat_example

  return (
    <div className="msg agent">
      <div className="msg-head">
        <Avatar agent={agent} />
        <span className="msg-author">{AGENTS[agent].name}</span>
        <span className="msg-time">{formatTime(message.ts)}</span>
      </div>
      <div className="msg-body">
        {message.content ? <Markdown text={message.content} /> : <div className="thinking"><span /><span /><span /></div>}
        {threatExample && (
          <section className="card threat-example-card" aria-label="Illustrative risk example">
            <div className="card-head">
              <Codicon name="shield" />
              <div className="card-title">
                <div className="card-title-main">Illustrative risk example</div>
                <div className="card-sub">{threatExample.path}</div>
              </div>
            </div>
            <CodeBlock code={threatExample.code} language={threatExample.language} path={threatExample.path} />
            <div className="card-note"><Codicon name="warning" /> Potentially unsafe pattern to recognise — not code to use as a solution.</div>
          </section>
        )}
        {approvals.map((approval) => approval.action_type === 'write_fix' ? (
          <EditedFileCard key={approval.id} approval={approval} />
        ) : (
          <ApprovalCard key={approval.id} approval={approval} showFixChoice={message.thread === 'team'} />
        ))}
        {risks.length > 0 && (
          <button className="state-card" onClick={() => showRightTab('approvals')}>
            <Codicon name="shield" />
            <span>
              {risks.length} suggested risk{risks.length > 1 ? 's' : ''}, added to the security state
            </span>
            {risks.map((risk) => (
              <span key={risk.id} className="state-ref">
                #{risk.id}
              </span>
            ))}
          </button>
        )}
      </div>
    </div>
  )
}

function Waiting({ text, working }: { text: string | null; working: Agent | 'routing' }) {
  const agent = working === 'routing' ? 'facilitator' : working
  return (
    <>
      {text && (
        <div className="msg user pending">
          <div className="msg-head">
            <span className="avatar user">
              <Codicon name="account" />
            </span>
            <span className="msg-author">You</span>
          </div>
          <div className="msg-body">
            <div className="user-text">{text}</div>
          </div>
        </div>
      )}
      <div className="msg agent">
        <div className="msg-head">
          <Avatar agent={agent} />
          <span className="msg-author">{AGENTS[agent].name}</span>
        </div>
        <div className="msg-body">
          <div className="thinking">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </>
  )
}

function FollowUpMessage({ message }: { message: Message }) {
  const agent = message.data.agent ?? 'reviewer'
  const failed = message.data.status === 'failed'
  const guidance = message.data.fix_choice === 'developer'
  const fix = agent === 'reviewer' && !guidance
  const failure = guidance ? 'Fix guidance could not be prepared.' : fix ? 'The fix could not be written.' : 'Security tests could not be prepared.'
  const progress = guidance ? 'Preparing a suggested fix for you to write...' : fix ? 'Writing the fix. The editor is locked until it is done...' : 'Preparing security tests...'
  return (
    <div className="msg agent follow-up" role="status">
      <div className="msg-head">
        <Avatar agent={agent} />
        <span className="msg-author">{AGENTS[agent].name}</span>
        <span className="state-ref">{message.data.vulnerability_id}</span>
      </div>
      <div className="msg-body follow-up-status">
        <Codicon name={failed ? 'warning' : 'loading'} className={failed ? '' : 'codicon-modifier-spin'} />
        <span>{failed ? (message.data.error || failure) : progress}</span>
        {failed && (
          <button className="btn small secondary" onClick={() => useAgents.getState().retryFollowUp(message.id)}>
            <Codicon name="refresh" /> Retry
          </button>
        )}
      </div>
      {failed && message.data.reviewer_reply && (
        <div className="msg-body">
          <div className="msg-note">Code Reviewer response — no edit was applied:</div>
          <Markdown text={message.data.reviewer_reply} />
        </div>
      )}
    </div>
  )
}

function Composer({ mode, busy }: { mode: Mode; busy: boolean }) {
  const [text, setText] = useState('')
  const messages = useAgents((s) => s.messages)
  const approvals = useAgents((s) => s.approvals)
  const mitigations = useSecurity((s) => s.state?.mitigations)
  const files = useWorkspace((s) => s.files)
  const running = useTests((s) => s.running)
  const pending = approvals.filter((a) => a.status === 'pending')
  const awaitingFixChoice = mode === 'team' ? approvals.find((a) => a.action_type === 'propose_vulnerability'
    && a.status === 'approved' && !a.result?.fix_choice
    && !mitigations?.some((m) => m.vulnerability_id === a.result?.item_id)) : undefined
  const reviewed = messages.some((m) => m.data.snapshot)
  const jobs = messages.filter(followUpPending)
  const preparing = jobs.length > 0
  const fixWorking = jobs.some((m) => m.data.agent === 'reviewer' && m.data.fix_choice !== 'developer')
  const guidanceWorking = jobs.some((m) => m.data.fix_choice === 'developer')
  const testWorking = jobs.some((m) => m.data.agent === 'verifier')
  const progressLabel = fixWorking && testWorking ? 'Writing fixes and preparing tests' : fixWorking ? 'Writing the fix'
    : guidanceWorking ? 'Preparing fix guidance' : 'Preparing security tests'
  const testsAvailable = Object.keys(files).some((p) => p.startsWith('tests/') && p.endsWith('.py'))
  const reviewLabel = reviewed ? 'Review updated code' : 'Ready for review'

  function showProposal() {
    document.getElementById(`approval-${pending[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function showFixChoice() {
    if (awaitingFixChoice) document.getElementById(`approval-${awaitingFixChoice.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function send() {
    const content = text.trim()
    if (!content || busy) return
    setText('')
    if (!(await useAgents.getState().send(mode, content))) setText(content)
  }

  return (
    <div className="composer">
      <div className="review-bar">
        {preparing ? (
          <button className="btn primary" disabled><Codicon name="loading" className="codicon-modifier-spin" /> {progressLabel}</button>
        ) : pending.length > 0 ? (
          <button className="btn primary" disabled={busy} onClick={showProposal}>
            <Codicon name="checklist" /> Review proposals ({pending.length})
          </button>
        ) : awaitingFixChoice ? (
          <button className="btn primary" disabled={busy} onClick={showFixChoice}>
            <Codicon name="edit" /> Choose who writes the fix
          </button>
        ) : (
          <button className="btn primary" disabled={busy} onClick={() => useAgents.getState().review(mode)}>
            <Codicon name="checklist" /> {reviewLabel}
          </button>
        )}
        {pending.length > 0 && !preparing && (
          <button className="icon-btn" title={reviewLabel} disabled={busy || pending.some((a) => a.action_type === 'propose_vulnerability')} onClick={() => useAgents.getState().review(mode)}>
            <Codicon name="code-review" />
          </button>
        )}
        {reviewed && testsAvailable && !preparing && !pending.some((a) => a.action_type === 'propose_test') && (
          <button className="btn secondary" disabled={busy || running} onClick={() => useTests.getState().run(mode)}>
            <Codicon name={running ? 'loading' : 'beaker'} className={running ? 'codicon-modifier-spin' : ''} />
            {running ? 'Running tests...' : 'Run tests'}
          </button>
        )}
      </div>
      <div className="composer-box">
        <textarea
          rows={3}
          value={text}
          placeholder={mode === 'team' ? 'Message the agent team…' : 'Ask the assistant…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <div className="composer-footer">
          <span className="composer-hint">Enter to send · Shift+Enter for a new line</span>
          <button className="send-btn" title="Send" disabled={!text.trim() || busy} onClick={() => void send()}>
            <Codicon name="send" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function ChatView({ mode, showChatPrompt = false }: { mode: Mode; showChatPrompt?: boolean }) {
  const messages = useAgents((s) => s.messages)
  const approvals = useAgents((s) => s.approvals)
  const sending = useAgents((s) => s.sending)
  // A few lightweight test stores predate streaming; the live store always provides this array.
  const streaming = useAgents((s) => s.streaming ?? [])
  const working = useAgents((s) => s.working)
  const undoing = useAgents((s) => s.undoing)
  const turnError = useAgents((s) => s.turnError)
  const vulnerabilities = useSecurity((s) => s.state?.vulnerabilities)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const followingUp = messages.some(followUpPending)
  const unanswered = mode === 'team' && !working && !followingUp ? stillToAnswer(messages)[0] : undefined
  // A failed turn can save proposals before saving its reply. Keep those decisions reachable after a reload.
  const attached = new Set(messages.flatMap((m) => m.data.approval_ids ?? []))
  const unattached = approvals.filter((a) => !attached.has(a.id) && (a.status === 'pending'
    || (mode === 'team' && a.action_type === 'propose_vulnerability' && a.status === 'approved' && !a.result?.fix_choice)))
  const hasApprovedVulnerability = Boolean(vulnerabilities?.length) || approvals.some(
    (a) => a.action_type === 'propose_vulnerability' && a.status === 'approved',
  )
  const visible = messages.filter((m) =>
    !m.data.hidden && !(m.role === 'system' && m.content === NO_VULNERABILITIES_NOTICE && hasApprovedVulnerability),
  )

  useEffect(() => {
    if (nearBottom.current || sending) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, streaming, approvals, sending, working])

  return (
    <>
      {mode === 'team' && <TeamProgress messages={messages} working={working} />}

      <div className="chat-scroll" ref={scrollRef} onScroll={(event) => {
        const element = event.currentTarget
        nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
      }}>
        {messages.length === 0 && streaming.length === 0 && !sending && (
          <div className="chat-empty">
            What are you working on?
          </div>
        )}
        {visible.map((m) =>
          m.role === 'human' ? (
            <HumanMessage key={m.id} message={m} />
          ) : m.role === 'agent' ? (
            <AgentMessage key={m.id} message={m} />
          ) : m.data.kind === 'vulnerability_follow_up' ? (
            <FollowUpMessage key={m.id} message={m} />
          ) : (
            <div key={m.id} className="msg system">
              <Codicon name="info" />
              <span>{m.content}</span>
            </div>
          ),
        )}
        {streaming.map((message) => <AgentMessage key={message.id} message={message} />)}
        {unattached.length > 0 && (
          <div className="chat-proposals">
            {unattached.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} showFixChoice={mode === 'team'} />
            ))}
          </div>
        )}
        {working && streaming.length === 0 && <Waiting text={sending} working={working} />}
        {!working && (unanswered || turnError) && (
          <div className={`msg system continue-bar${turnError ? ' chat-error' : ''}`} role={turnError ? 'alert' : 'status'}>
            <Codicon name={turnError ? 'warning' : 'info'} />
            <span>
              {unanswered && <strong>{AGENTS[unanswered].name}'s reply is incomplete. </strong>}
              {turnError}
            </span>
            {unanswered && (
              <button className="btn small secondary" aria-label={`Retry ${AGENTS[unanswered].name}`} onClick={() => useAgents.getState().carryOn(mode)}>
                <Codicon name="refresh" /> Retry
              </button>
            )}
          </div>
        )}
      </div>

      {showChatPrompt && (
        <div className="task-guide-chat" role="status">
          <span className="task-guide-chat-step">Start with chat</span>
          <h2>Ask about your task</h2>
          <p>Ask {mode === 'team' ? 'the agent team' : 'the assistant'} about the task, the files, or where to begin. You can send a question whenever you're ready.</p>
          <span className="task-guide-chat-arrow"><Codicon name="arrow-down" /> Write a message below</span>
        </div>
      )}
      <Composer mode={mode} busy={Boolean(working) || followingUp || undoing} />
    </>
  )
}
