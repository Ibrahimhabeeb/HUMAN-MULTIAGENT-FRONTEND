import { useState } from 'react'
import type { ActionType, Approval, Decision, Proposal } from '../api/types'
import { ACTION_LABELS, AGENTS } from '../lib/agents'
import { useAgents } from '../store/agents'
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
          <div className="proposal-meta">Mark {text('item_id')} as resolved</div>
          <p className="proposal-text">{text('reason')}</p>
        </>
      )
    case 'propose_test': {
      const tested = Array.isArray(p.vulnerability_ids) ? p.vulnerability_ids.join(', ') : ''
      return (
        <>
          <div className="proposal-meta">
            <Codicon name="file" /> {text('path')}
            {tested && ` · tests ${tested}`}
          </div>
          <CodeBlock code={text('content')} path={text('path')} language="python" />
        </>
      )
    }
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
  }
}

// Every proposal is approved or rejected as it is. To change something afterwards, the human edits it
// in the security state (or types the code themselves, for a fix). A suggested risk needs no decision.
export function ApprovalCard({ approval }: { approval: Approval }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const agent = AGENTS[approval.actor]
  const type = approval.action_type
  const pending = approval.status === 'pending'
  const decided = approval.status === 'approved' || approval.status === 'rejected'

  async function decide(decision: Decision) {
    setBusy(true)
    setError(null)
    setError(await useAgents.getState().decide(approval.id, decision))
    setBusy(false)
  }

  return (
    <div id={`approval-${approval.id}`} className={`card approval-card ${approval.status}`}>
      <div className="card-head">
        <span className="avatar" style={{ background: agent?.color }}>
          <Codicon name={agent?.icon ?? 'hubot'} />
        </span>
        <div className="card-title">
          <div className="card-title-main">{type === 'propose_test' && approval.proposal.base_content != null ? 'Update test file' : ACTION_LABELS[type]}</div>
          <div className="card-sub">
            {agent?.name ?? approval.actor} · proposal #{approval.id}
          </div>
        </div>
        {decided && <span className={`status-pill ${approval.status}`}>{approval.status}</span>}
      </div>

      <div className="card-body">
        <ProposalView type={type} proposal={approval.proposal} />
      </div>

      {pending && (
        <div className="card-actions">
          <button className="mini-btn approve" disabled={busy} onClick={() => decide('approve')}>
            <Codicon name="check" /> Approve
          </button>
          <button className="mini-btn reject" disabled={busy} onClick={() => decide('reject')}>
            <Codicon name="close" /> Reject
          </button>
        </div>
      )}
      {type === 'suggest_fix' && approval.status === 'approved' && (
        <div className="card-note ok">
          Approved{approval.result?.item_id ? ` and added to the mitigations as ${String(approval.result.item_id)}` : ''}: type
          this fix into the editor yourself.
        </div>
      )}
      {approval.status === 'suggested' && approval.result?.item_id ? (
        <div className="card-note ok">In the security state as {String(approval.result.item_id)}.</div>
      ) : null}
      {error && <div className="card-note">{error}</div>}
    </div>
  )
}

// Suggested risks and decision history. Pending proposals are shown with the agent's chat reply.
export function ApprovalsView() {
  const approvals = useAgents((s) => s.approvals)
  const suggested = approvals.filter((a) => a.status === 'suggested').reverse()
  const decided = approvals.filter((a) => a.status === 'approved' || a.status === 'rejected').reverse()

  return (
    <div className="chat-scroll approvals">
      {suggested.length === 0 && decided.length === 0 && (
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
