import type {
  Answer,
  Approval,
  ConsentContent,
  Decision,
  FileMap,
  FsNode,
  HumanCategory,
  InformationContent,
  Message,
  Mode,
  Proposal,
  QuestionnaireForm,
  RunResult,
  SecurityState,
  StudyState,
  TaskId,
  Thread,
  TurnResult,
} from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const { detail } = await response.json()
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((d) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg}`).join('; ')
  } catch {
    // not JSON: usually the Vite proxy saying the backend is down
  }
  if (response.status >= 500) return 'The backend did not respond. Is it running on port 8000?'
  return `${response.status} ${response.statusText}`
}

export async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the backend. Is it running on port 8000?')
  }
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response))
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

const filePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export const api = {
  state: () => request<StudyState>('GET', '/study/state'),
  start: (pilot: boolean, taskId: TaskId = 'A') => request<StudyState>('POST', '/study/start', { pilot, task_id: taskId }),
  continueToConsent: () => request<StudyState>('POST', '/study/continue'),
  decline: () => request<StudyState>('POST', '/study/decline'),
  consent: (version: string) => request<StudyState>('POST', '/study/consent', { consent_version: version }),
  setMode: (mode: Mode) => request<StudyState>('POST', '/study/mode', { mode }),
  done: () => request<StudyState>('POST', '/study/done'),
  finish: () => request<StudyState>('POST', '/study/finish'),
  restart: () => request<StudyState>('POST', '/study/restart'),
  information: () => request<InformationContent>('GET', '/study/content/information'),
  consentForm: () => request<ConsentContent>('GET', '/study/content/consent'),
  questionnaire: () => request<QuestionnaireForm>('GET', '/study/questionnaire'),
  submitQuestionnaire: (answers: Answer[]) => request<StudyState>('POST', '/study/questionnaire', { answers }),

  files: () => request<FileMap>('GET', '/workspace/files'),
  writeFile: (path: string, content: string) => request<FsNode>('PUT', `/workspace/files/${filePath(path)}`, { content }),
  deletePath: (path: string) => request<void>('DELETE', `/workspace/files/${filePath(path)}`),
  createFolder: (path: string) => request<FsNode>('POST', '/workspace/folders', { path }),
  rename: (from: string, to: string) => request<void>('POST', '/workspace/files/rename', { from_path: from, to_path: to }),
  notes: () => request<{ text: string }>('GET', '/workspace/notes'),
  saveNotes: (text: string) => request<{ text: string }>('PUT', '/workspace/notes', { text }),
  runTests: () => request<RunResult>('POST', '/workspace/tests/run'),

  securityState: () => request<SecurityState>('GET', '/workspace/state'),
  addItem: (category: HumanCategory, body: Proposal) => request<unknown>('POST', `/workspace/state/${category}`, body),
  editItem: (category: HumanCategory, id: string, changes: Proposal) =>
    request<unknown>('PATCH', `/workspace/state/${category}/${id}`, changes),
  deleteItem: (category: HumanCategory, id: string) => request<void>('DELETE', `/workspace/state/${category}/${id}`),

  threads: () => request<Record<string, Message[]>>('GET', '/chat'),
  send: (thread: Thread, content: string) => request<TurnResult>('POST', `/chat/${thread}`, { content }),
  next: () => request<TurnResult>('POST', '/chat/next'),
  review: () => request<TurnResult>('POST', '/chat/review'),
  followUp: (id: number) => request<TurnResult>('POST', `/chat/follow-ups/${id}`),

  approvals: () => request<Approval[]>('GET', '/approvals'),
  decide: (id: number, decision: Decision) => request<Approval>('POST', `/approvals/${id}/decide`, { decision }),
}
