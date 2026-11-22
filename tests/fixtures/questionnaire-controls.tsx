import { createRoot } from 'react-dom/client'
import form from 'virtual:questionnaire-form'
import { QuestionnairePager } from '../../src/components/QuestionnairePager'
import { ApprovalCard } from '../../src/components/Approvals'
import { StudyPage } from '../../src/screens/StudyPage'
import { useAgents } from '../../src/store/agents'
import { useStudy } from '../../src/store/study'
import type { Approval } from '../../src/api/types'
import '../../src/styles/workbench.css'
import '../../src/styles/study.css'

const fix: Approval = {
  id: 91, actor: 'assistant', action_type: 'suggest_fix', status: 'pending',
  requested_at: '2026-11-22T10:00:00Z', decided_at: null, final_proposal: null, result: null,
  proposal: { vulnerability: 'SQL injection', file: 'app/auth.py', location: 'Replace the query in login()',
    code: 'row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()',
    why: 'Use parameters so a username cannot change the SQL query.' },
}
useAgents.setState({ approvals: [fix] })
useStudy.setState({ state: null, busy: false })

export function Fix() {
  const approval = useAgents(state => state.approvals[0])
  return <div style={{ maxWidth: 680, padding: 24, margin: '40px auto' }}><ApprovalCard approval={approval} /></div>
}
const showFix = new URLSearchParams(location.search).has('fix')
document.body.className = showFix ? '' : 'study-theme'
createRoot(document.getElementById('root')!).render(showFix ? <Fix /> : <StudyPage title="Questionnaire" restart={false}>
  <p className="lead">Reflect on each way of working. Every question is optional.</p>
  <QuestionnairePager form={form} />
</StudyPage>)
