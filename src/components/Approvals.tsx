import { useState } from 'react'
import type { ActionType, Approval, Decision, FixChoice, Proposal } from '../api/types'
import { ACTION_LABELS, AGENTS } from '../lib/agents'
import { useAgents } from '../store/agents'
import { useSecurity } from '../store/security'
import { Codicon } from './Icons'
import { CodeBlock } from './CodeBlock'
import { languageOf } from '../lib/files'

function ProposalView({ type, proposal: p }: { type: ActionType; proposal: Proposal }) {
  const text = (key: string) => String(p[key] ?? '')
  const tags = (values: unknown[]) => values.filter(Boolean).join(' · ')

  switch (type) {
    case 'propose_assumption':
      return <p className="proposal-text">{text('text')}</p>
    case 'propose_risk':
      return (
        <>
          <p className="proposal-text">
            <span className={`sev-tag sev-${text('severity').toLowerCase()}`}>{text('severity')}</span> {text('description')}
          </p>
          <div className="proposal-meta">{tags([p.cwe, p.owasp, p.stride])}</div>
        </>
      )
    case 'propose_vulnerability':
      return (
        <>
          <p className="proposal-text">
            <span className={`sev-tag sev-${text('severity').toLowerCase()}`}>{text('severity')}</span> {text('description')}
          </p>
          <div className="proposal-meta">
            {tags([p.file && (p.line ? `${text('file')}:${text('line')}` : text('file')), p.cwe])}
          </div>
        </>
      )
    case 'mark_resolved':
      return (
        <>
          <div className="proposal-meta">Mark {text('item_id')} as implemented</div>
          <p className="proposal-text">{text('reason')}</p>
        </>
      )
    case 'propose_test':
      return (
        <>
          <div className="proposal-meta">
            <Codicon name="file" /> {text('path')}
          </div>
          <CodeBlock code={text('content')} path={text('path')} language="python" />
        </>
      )
    case 'suggest_fix':
      return (
        <>
          <div className="proposal-meta">
            For {text('vulnerability')} · {text('file')} · {text('location')}
          </div>
          <CodeBlock code={text('code')} path={text('file')} location={text('location')} language={languageOf(text('file')).id} />
          <p className="proposal-text">
            <b>Why:</b> {text('why')}
          </p>
        </>
      )
    case 'write_fix':
      return (
        <>
          <div className="proposal-meta">
            For {text('vulnerability')} · {text('file')}
          </div>
          <div className="proposal-meta">Replaced</div>
          <CodeBlock code={text('find')} path={text('file')} language={languageOf(text('file')).id} />
          <div className="proposal-meta">With</div>
          <CodeBlock code={text('replace')} path={text('file')} language={languageOf(text('file')).id} />
          <p className="proposal-text">
            <b>Why:</b> {text('why')}
          </p>
        </>
      )
  }
}

// Every proposal is approved or rejected as it is. To change something afterwards, the human edits it in the
// security state or the editor. A suggested risk and a fix the Code Reviewer wrote need no decision.
export function ApprovalCard({ approval, showFixChoice = false }: { approval: Approval; showFixChoice?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const agent = AGENTS[approval.actor]
  const type = approval.action_type
  const pending = approval.status === 'pending'
  const singleFix = approval.actor === 'assistant' && type === 'suggest_fix'
  const decided = approval.status === 'approved' || approval.status === 'rejected'
  const vulnerabilityId = String(approval.result?.item_id ?? '')
  const hasMitigation = useSecurity((s) => Boolean(s.state?.mitigations?.some((m) => m.vulnerability_id === vulnerabilityId)))
  const fixChoice = approval.result?.fix_choice
  const askFixChoice = showFixChoice && type === 'propose_vulnerability' && approval.status === 'approved'
    && !fixChoice && !hasMitigation

  async function decide(decision: Decision) {
    setBusy(true)
    setError(null)
    setError(await useAgents.getState().decide(approval.id, decision))
    setBusy(false)
  }

  async function chooseFix(choice: FixChoice) {
    setBusy(true)
    setError(null)
    setError(await useAgents.getState().chooseFix(approval.id, choice))
    setBusy(false)
  }

  return (
    <div id={`approval-${approval.id}`} className={`card approval-card ${approval.status}`}>
      <div className="card-head">
        <span className="avatar" style={{ background: agent?.color }}>
          <Codicon name={agent?.icon ?? 'hubot'} />
        </span>
        <div className="card-title">
          <div className="card-title-main">{approval.status === 'undone' ? 'Fix undone' : type === 'propose_test' && approval.proposal.base_content != null ? 'Update test file' : ACTION_LABELS[type]}</div>
          <div className="card-sub">
            {agent?.name ?? approval.actor} · proposal #{approval.id}
          </div>
        </div>
        {(decided || approval.status === 'undone') && <span className={`status-pill ${approval.status}`}>{approval.status}</span>}
      </div>

      <div className="card-body">
        <ProposalView type={type} proposal={approval.proposal} />
      </div>

      {pending && singleFix && <div className="card-note">Would you like to use this suggested fix?</div>}
      {pending && (
        <div className="card-actions" role="group" aria-label={singleFix ? 'Use this suggested fix' : 'Proposal decision'}>
          <button className="mini-btn approve" disabled={busy} onClick={() => decide('approve')}>
            <Codicon name="check" /> {singleFix ? 'Yes, use this fix' : 'Approve'}
          </button>
          <button className="mini-btn reject" disabled={busy} onClick={() => decide('reject')}>
            <Codicon name="close" /> {singleFix ? 'No, skip it' : 'Reject'}
          </button>
        </div>
      )}
      {askFixChoice && (
        <>
          <div className="card-note fix-choice-question">Who should write the fix for {vulnerabilityId}?</div>
          <div className="card-actions" role="group" aria-label={`Who writes the fix for ${vulnerabilityId}`}>
            <button className="mini-btn approve" disabled={busy} onClick={() => chooseFix('reviewer')}>
              <Codicon name="tools" /> Let Code Reviewer implement
            </button>
            <button className="mini-btn write-self" disabled={busy} onClick={() => chooseFix('developer')}>
              <Codicon name="edit" /> I'll write the fix
            </button>
          </div>
        </>
      )}
      {showFixChoice && type === 'propose_vulnerability' && fixChoice === 'reviewer' && (
        <div className="card-note ok">You chose the Code Reviewer to implement this fix.</div>
      )}
      {showFixChoice && type === 'propose_vulnerability' && fixChoice === 'developer' && (
        <div className="card-note ok">You chose to write this fix. The Code Reviewer will show the suggested change in chat.</div>
      )}
      {type === 'suggest_fix' && approval.status === 'approved' && (
        <div className="card-note ok">Approved: type this fix into the editor yourself.</div>
      )}
      {approval.status === 'written' && (
        <div className="card-note ok">
          Written into {String(approval.proposal.file)} at line {String(approval.result?.line)}, and added to the
          mitigations as {String(approval.result?.item_id)}. Review or undo this edit from its chat card.
        </div>
      )}
      {approval.status === 'undone' && (
        <div className="card-note">The previous code was restored and mitigation {String(approval.result?.item_id)} was removed.</div>
      )}
      {approval.status === 'suggested' && approval.result?.item_id ? (
        <div className="card-note ok">In the security state as {String(approval.result.item_id)}.</div>
      ) : null}
      {error && <div className="card-note">{error}</div>}
    </div>
  )
}

// Suggested risks, fixes written and decision history. Pending proposals are shown with the agent's chat reply.
export function ApprovalsView() {
  const approvals = useAgents((s) => s.approvals)
  const suggested = approvals.filter((a) => a.status === 'suggested').reverse()
  const written = approvals.filter((a) => a.status === 'written' || a.status === 'undone').reverse()
  const decided = approvals.filter((a) => a.status === 'approved' || a.status === 'rejected').reverse()

  return (
    <div className="chat-scroll approvals">
      {suggested.length === 0 && written.length === 0 && decided.length === 0 && (
        <div className="approvals-empty">No suggested risks or decisions yet.</div>
      )}
      {suggested.length > 0 && (
        <>
          <div className="approvals-heading">Suggested risks</div>
          {suggested.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </>
      )}
      {written.length > 0 && (
        <>
          <div className="approvals-heading">Code edits</div>
          {written.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </>
      )}
      {decided.length > 0 && (
        <>
          <div className="approvals-heading">Decided</div>
          {decided.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </>
      )}
    </div>
  )
}
