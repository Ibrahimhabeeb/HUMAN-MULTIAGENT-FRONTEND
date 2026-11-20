// The shapes the backend sends and receives.

export type Mode = 'team' | 'single'
export type TaskId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
export type Screen = 'start' | 'information' | 'consent' | 'ide' | 'part_complete' | 'questionnaire' | 'thank_you'

export interface PartInfo {
  part: number
  mode: Mode
  task_id: string
  task_label: string
  done: boolean
}

export interface StudyState {
  screen: Screen
  mode: Mode
  participant: string | null
  pilot: boolean | null
  part: number | null
  task: { id: string; label: string } | null
  needs_next_task: boolean
  parts: PartInfo[]
  available_tasks: Array<{ id: TaskId; label: string; cwe: string }>
}

export interface InformationContent {
  version: string
  markdown: string
}

export interface ConsentContent extends InformationContent {
  statements: string[]
}

export type FsNode = { type: 'folder' } | { type: 'file'; content: string }
export type FileMap = Record<string, FsNode>

export interface CompletionResult {
  items: Array<{ name: string; type: string; description: string }>
}

export type Specialist = 'planner' | 'threat_modeller' | 'reviewer' | 'verifier'
export type Agent = Specialist | 'assistant'
export type Thread = 'team' | 'assistant'

export interface Message {
  id: number
  thread: Thread
  role: 'human' | 'agent' | 'system'
  content: string
  data: {
    agent?: Agent // who wrote it; team specialists or the single assistant
    reply_to?: number
    route?: Specialist[] // the agents that answer a developer message, in order
    reason?: string // why the Facilitator routed it to that agent
    approval_ids?: number[]
    snapshot?: string // set on a review request
    kind?: 'vulnerability_follow_up'
    status?: 'queued' | 'running' | 'failed' | 'complete'
    error?: string | null
    vulnerability_id?: string
    fix_choice?: 'reviewer' | 'developer'
    hidden?: boolean // a Test/Verifier follow-up that proposed no test: kept for the researcher, not shown
    run?: RunResult // the Test/Verifier's run, shown in Test Results
    started_at?: number
    threat_example?: {
      path: string
      code: string
      language: string
    }
  }
  ts: string
}

export type ActionType =
  | 'propose_assumption'
  | 'propose_risk'
  | 'propose_vulnerability'
  | 'mark_resolved'
  | 'propose_test'
  | 'suggest_fix'
  | 'write_fix'

// No decision for these two: suggested is a risk, written is a fix the Code Reviewer put in the code.
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suggested' | 'written' | 'undone'
export type Decision = 'approve' | 'reject'
export type FixChoice = 'reviewer' | 'developer'
export type Proposal = Record<string, unknown>

export interface Approval {
  id: number
  actor: Agent
  action_type: ActionType
  proposal: Proposal
  final_proposal: Proposal | null
  status: ApprovalStatus
  requested_at: string
  decided_at: string | null
  result: Record<string, unknown> | null
}

export interface TurnResult {
  messages: Message[]
  approvals: Approval[]
  next: Specialist | null // team mode: who answers next (api.next)
}

export type ChatStreamEvent =
  | { type: 'message'; message: Message }
  | { type: 'agent_start'; agent: Agent }
  | { type: 'delta'; agent: Agent; content: string }
  | { type: 'agent_complete'; agent: Agent; message: Message; approvals: Approval[] }
  | { type: 'done'; next: Specialist | null }
  | { type: 'error'; status: number; detail: string }

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical'
export type HumanCategory = 'assumptions' | 'risks' | 'vulnerabilities' | 'mitigations'
export type HumanAddCategory = 'vulnerabilities' | 'mitigations'

interface StateItem {
  id: string
  source: string
  approval_id: number | null
  timestamp: string
}

export interface Assumption extends StateItem {
  text: string
}

export interface Risk extends StateItem {
  description: string
  severity: Severity
  cwe: string | null
  owasp: string | null
  stride: string | null
}

// Found by the Code Reviewer in the developer's code.
export interface Vulnerability extends StateItem {
  description: string
  severity: Severity
  file: string | null
  line: number | null
  cwe: string | null
  status: 'accepted' | 'rejected' // the developer's decision; a rejected one stays listed
}

// A fix for a vulnerability: the Code Reviewer's, written into the code, or one the human added.
export interface Mitigation extends StateItem {
  vulnerability_id: string | null
  description: string
  file: string | null
  location: string | null
  code: string | null
  status: 'planned' | 'implemented'
}

// One test function from the task's tests/ folder, with the outcome of the most recent run (open: not run yet).
export interface UnitTest extends StateItem {
  file: string
  name: string
  status: 'open' | 'passed' | 'failed'
  message: string | null // why it failed in the most recent run
}

export interface SecurityState {
  assumptions: Assumption[]
  risks: Risk[]
  vulnerabilities: Vulnerability[]
  mitigations: Mitigation[]
  tests: UnitTest[]
}

export type Outcome = 'passed' | 'failed' | 'error' | 'skipped'

export interface CaseResult {
  file: string
  name: string
  outcome: Outcome
  message: string | null
  details: string | null
}

export interface RunResult {
  status: 'passed' | 'failed' | 'no_tests' | 'timed_out' | 'error'
  message: string
  counts: Record<Outcome, number>
  tests: CaseResult[]
  output: string
}

export interface Question {
  number: number
  key: string
  type: 'scale' | 'number' | 'choice' | 'text'
  text: string
  scale: RatingScale | null
  allow_not_applicable: boolean
  options: string[]
}

export interface RatingScale {
  min: number
  max: number
  min_label: string
  max_label: string
}

export interface QuestionnaireSection {
  title: string
  show_title: boolean
  intro: string | null
  asked_for: 'each_mode' | 'team' | 'once'
  questions: Question[]
}

export interface QuestionnaireForm {
  version: string
  sections: QuestionnaireSection[]
  modes: { mode: Mode; label: string }[]
  text_hint: string
}

export type Condition = Mode | 'none'

export interface Answer {
  condition: Condition
  item: string
  value: number | string | null
}
