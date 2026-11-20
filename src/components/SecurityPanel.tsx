import { useState, type ReactNode } from 'react'
import type {
  Assumption,
  HumanAddCategory,
  HumanCategory,
  Mitigation,
  Proposal,
  Risk,
  SecurityState,
  Thread,
  UnitTest,
  Vulnerability,
} from '../api/types'
import { AGENTS } from '../lib/agents'
import { CATEGORY_FIELDS } from '../lib/fields'
import { useAgents } from '../store/agents'
import { ask } from '../store/dialog'
import { useSecurity } from '../store/security'
import { useUi } from '../store/ui'
import { FieldForm } from './FieldForm'
import { Codicon } from './Icons'

type Item = Assumption | Risk | Vulnerability | Mitigation

const STATUS_CLASS: Record<string, string> = {
  accepted: 'st-identified',
  rejected: 'st-rejected',
  planned: 'st-mitigated',
  implemented: 'st-verified',
}

const TEST_ICONS: Record<UnitTest['status'], { icon: string; className: string; label: string }> = {
  open: { icon: 'circle-large-outline', className: '', label: 'Not run yet' },
  passed: { icon: 'pass', className: 'ok', label: 'Passed' },
  failed: { icon: 'error', className: 'fail', label: 'Failed' },
}

function sourceLabel(source: string): string {
  if (source === 'human') return 'You'
  return AGENTS[source as Thread]?.name ?? source
}

interface SectionProps {
  title: string
  from: string // the agent whose work this section holds
  icon: string
  count: number
  category?: HumanAddCategory
  empty?: string
  children: ReactNode
}

function Section({ title, from, icon, count, category, empty = 'None yet.', children }: SectionProps) {
  const [open, setOpen] = useState(true)
  const [adding, setAdding] = useState(false)

  return (
    <div className="state-section">
      <div className="pane-header" onClick={() => setOpen(!open)}>
        <Codicon name={open ? 'chevron-down' : 'chevron-right'} />
        <Codicon name={icon} className="section-icon" />
        <span className="pane-header-title">
          {title}
          <span className="section-from">{from}</span>
        </span>
        <span className="badge subtle">{count}</span>
        {category && (
          <div className="pane-actions visible">
            <button
              className="icon-btn small"
              title={`Add to ${title.toLowerCase()}`}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(true)
                setAdding(true)
              }}
            >
              <Codicon name="add" />
            </button>
          </div>
        )}
      </div>
      {open && (
        <div className="state-items">
          {adding && category && (
            <FieldForm
              fields={CATEGORY_FIELDS[category]}
              submitLabel="Add"
              onSubmit={async (payload) => {
                const problem = await useSecurity.getState().add(category, payload)
                if (!problem) setAdding(false)
                return problem
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          {count === 0 && !adding && <div className="state-empty">{empty}</div>}
          {children}
        </div>
      )}
    </div>
  )
}

interface ItemCardProps {
  category: HumanCategory
  item: Item
  text: string
  severity?: string
  meta?: ReactNode
  statuses?: string[]
}

function ItemCard({ category, item, text, severity, meta, statuses }: ItemCardProps) {
  const [editing, setEditing] = useState(false)
  const status = 'status' in item ? item.status : undefined
  const source = sourceLabel(item.source) + (item.approval_id ? ` · proposal #${item.approval_id}` : '')
  const { edit, remove } = useSecurity.getState()

  async function changeStatus(next: string) {
    const problem = await edit(category, item.id, { status: next })
    if (problem) useUi.getState().toast(problem, 'error')
  }

  async function del() {
    if (await ask(`Delete ${item.id}?`, 'It will be removed from the shared security state.', 'Delete', true)) {
      await remove(category, item.id)
    }
  }

  if (editing) {
    return (
      <FieldForm
        fields={CATEGORY_FIELDS[category]}
        initial={item as unknown as Proposal}
        submitLabel="Save"
        onSubmit={async (payload) => {
          const problem = await edit(category, item.id, payload)
          if (!problem) setEditing(false)
          return problem
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="state-item">
      <div className="state-item-head">
        <span className="state-id">{item.id}</span>
        {severity && <span className={`sev-tag sev-${severity.toLowerCase()}`}>{severity}</span>}
        <span className="state-text">{text}</span>
      </div>
      {meta && <div className="state-meta">{meta}</div>}
      <div className="state-footer">
        <span className="state-source" title={source}>
          <Codicon name={item.source === 'human' ? 'account' : 'hubot'} /> {source}
        </span>
        {statuses && status && (
          <select
            className={`status-select ${STATUS_CLASS[status] ?? ''}`}
            value={status}
            onChange={(e) => void changeStatus(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
        <button className="icon-btn small" title="Edit" onClick={() => setEditing(true)}>
          <Codicon name="edit" />
        </button>
        <button className="icon-btn small" title="Delete" onClick={del}>
          <Codicon name="trash" />
        </button>
      </div>
    </div>
  )
}

function riskMeta(risk: Risk): ReactNode {
  const tags = [risk.cwe, risk.owasp, risk.stride].filter(Boolean)
  return tags.length > 0 ? <div className="risk-tags">{tags.join(' · ')}</div> : null
}

function vulnerabilityMeta(vulnerability: Vulnerability, state: SecurityState): ReactNode {
  const { id, file, line, cwe } = vulnerability
  const tags = [file && (line ? `${file}:${line}` : file), cwe].filter(Boolean)
  const mitigations = state.mitigations.filter((m) => m.vulnerability_id === id).map((m) => `${m.id} (${m.status})`)
  return (
    <>
      {tags.length > 0 && <div>{tags.join(' · ')}</div>}
      {mitigations.length > 0 && <div>Mitigations: {mitigations.join(', ')}</div>}
    </>
  )
}

/** A vulnerability still to fix: accepted, and no fix for it implemented yet. */
function toFix(vulnerability: Vulnerability, state: SecurityState): boolean {
  const fixed = state.mitigations.some((m) => m.vulnerability_id === vulnerability.id && m.status === 'implemented')
  return vulnerability.status === 'accepted' && !fixed
}

function mitigationMeta(mitigation: Mitigation): ReactNode {
  const where = [mitigation.vulnerability_id && `For ${mitigation.vulnerability_id}`, mitigation.file, mitigation.location]
  return (
    <>
      {where.some(Boolean) && <div>{where.filter(Boolean).join(' · ')}</div>}
      {mitigation.code && (
        <details className="state-code">
          <summary>Code</summary>
          <pre className="proposal-code">
            <code>{mitigation.code}</code>
          </pre>
        </details>
      )}
    </>
  )
}

// Risks and assumptions come from the Threat Modeller; developers can add findings and mitigations directly.
// Each unit test's latest result comes from the Test/Verifier.
export function SecurityPanel() {
  const state = useSecurity((s) => s.state)
  const waiting = useAgents((s) => s.approvals.filter((a) => a.status === 'pending').length)
  const showRightTab = useUi((s) => s.showRightTab)

  if (!state) {
    return (
      <div className="sidebar-view">
        <div className="sidebar-title">
          <span>Shared Security State</span>
        </div>
        <div className="state-empty" style={{ padding: '12px 20px' }}>
          Loading…
        </div>
      </div>
    )
  }

  const vulnerabilitiesToFix = state.vulnerabilities.filter((v) => toFix(v, state)).length
  const failingTests = state.tests.filter((t) => t.status === 'failed').length

  return (
    <div className="sidebar-view">
      <div className="sidebar-title">
        <span>Shared Security State</span>
        <div className="pane-actions visible">
          <button className="icon-btn" title="Refresh" onClick={() => void useSecurity.getState().load()}>
            <Codicon name="refresh" />
          </button>
        </div>
      </div>

      <div className="security-summary">
        <div className="summary-chips">
          <span className="chip">{state.risks.length} risks</span>
          <span className={vulnerabilitiesToFix > 0 ? 'chip chip-warn' : 'chip'}>
            {vulnerabilitiesToFix} vulnerabilities to fix
          </span>
          <span className={failingTests > 0 ? 'chip chip-warn' : 'chip'}>{failingTests} failing tests</span>
          <button className={waiting > 0 ? 'chip chip-pending chip-button' : 'chip chip-button'} onClick={() => showRightTab('chat')}>
            {waiting} waiting for approval
          </button>
        </div>
      </div>

      <div className="security-scroll">
        <Section title="Risks" from={AGENTS.threat_modeller.name} icon="warning" count={state.risks.length}>
          {state.risks.map((risk) => (
            <ItemCard
              key={risk.id}
              category="risks"
              item={risk}
              text={risk.description}
              severity={risk.severity}
              meta={riskMeta(risk)}
            />
          ))}
        </Section>

        <Section
          title="Assumptions"
          from={AGENTS.threat_modeller.name}
          icon="info"
          count={state.assumptions.length}
        >
          {state.assumptions.map((a) => (
            <ItemCard key={a.id} category="assumptions" item={a} text={a.text} />
          ))}
        </Section>

        <Section
          title="Vulnerabilities"
          from={AGENTS.reviewer.name}
          icon="bug"
          count={state.vulnerabilities.length}
          category="vulnerabilities"
        >
          {state.vulnerabilities.map((v) => (
            <ItemCard
              key={v.id}
              category="vulnerabilities"
              item={v}
              text={v.description}
              severity={v.severity}
              meta={vulnerabilityMeta(v, state)}
              statuses={['accepted', 'rejected']}
            />
          ))}
        </Section>

        <Section
          title="Mitigations"
          from={AGENTS.reviewer.name}
          icon="shield"
          count={state.mitigations.length}
          category="mitigations"
          empty="None yet. The Code Reviewer's fixes appear here once you approve them."
        >
          {state.mitigations.map((m) => (
            <ItemCard
              key={m.id}
              category="mitigations"
              item={m}
              text={m.description}
              meta={mitigationMeta(m)}
              statuses={['planned', 'implemented']}
            />
          ))}
        </Section>

        <Section
          title="Unit tests"
          from={AGENTS.verifier.name}
          icon="beaker"
          count={state.tests.length}
          empty="No unit tests in this task."
        >
          {state.tests.map((t) => {
            const result = TEST_ICONS[t.status]
            return (
              <div key={t.id} className="state-item">
                <div className="state-item-head">
                  <span className="state-id">{t.id}</span>
                  <Codicon name={result.icon} className={result.className} title={result.label} />
                  <span className="state-text">{t.name}</span>
                </div>
                <div className="state-meta">
                  <div>
                    {t.file} · {result.label}
                  </div>
                  {t.status === 'failed' && t.message && <div className="fail">{t.message}</div>}
                </div>
              </div>
            )
          })}
        </Section>
      </div>
    </div>
  )
}
