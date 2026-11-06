import type {
  Answer,
  Approval,
  ChatStreamEvent,
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

export const SESSION_STORAGE_KEY = 'secure-coding-room.session'
const SESSION_HEADER = 'X-Session-Token'
let openingSession: Promise<string> | null = null

function storedToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY)
  } catch {
    throw new ApiError(0, 'Session storage is unavailable. Enable browser storage to take part.')
  }
}

async function sessionToken(): Promise<string> {
  const existing = storedToken()
  if (existing) return existing
  if (!openingSession) {
    openingSession = (async () => {
      let response: Response
      try {
        response = await fetch('/api/study/session', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'team' }),
        })
      } catch {
        throw new ApiError(0, 'Cannot reach the backend. Is it running on port 8000?')
      }
      if (!response.ok) throw new ApiError(response.status, await errorMessage(response))
      const { token } = await response.json()
      if (typeof token !== 'string' || token.length !== 43) throw new ApiError(502, 'The backend returned an invalid session.')
      sessionStorage.setItem(SESSION_STORAGE_KEY, token)
      return token
    })().finally(() => { openingSession = null })
  }
  return openingSession
}

export async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = await sessionToken()
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      cache: 'no-store',
      headers: { [SESSION_HEADER]: token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the backend. Is it running on port 8000?')
  }
  if (!response.ok) {
    if (response.status === 401 && storedToken() === token) sessionStorage.removeItem(SESSION_STORAGE_KEY)
    throw new ApiError(response.status, await errorMessage(response))
  }
  const data = response.status === 204 ? undefined : await response.json()
  if (storedToken() !== token) throw new ApiError(409, 'This request belonged to an ended session.')
  const replacement = response.headers.get(SESSION_HEADER)
  if (replacement) sessionStorage.setItem(SESSION_STORAGE_KEY, replacement)
  return data as T
}

async function requestStream(path: string, body: unknown, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  const token = await sessionToken()
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { [SESSION_HEADER]: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the backend. Is it running on port 8000?')
  }
  if (!response.ok) {
    if (response.status === 401 && storedToken() === token) sessionStorage.removeItem(SESSION_STORAGE_KEY)
    throw new ApiError(response.status, await errorMessage(response))
  }
  if (!response.body) throw new ApiError(502, 'The backend did not start a response stream.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  async function emit(line: string) {
    if (!line.trim()) return
    let event: ChatStreamEvent
    try {
      event = JSON.parse(line) as ChatStreamEvent
    } catch {
      throw new ApiError(502, 'The backend sent an invalid chat response.')
    }
    if (event.type === 'error') throw new ApiError(event.status, event.detail)
    onEvent(event)
  }

  for (;;) {
    const { done, value } = await reader.read()
    pending += decoder.decode(value, { stream: !done })
    let newline = pending.indexOf('\n')
    while (newline >= 0) {
      await emit(pending.slice(0, newline))
      pending = pending.slice(newline + 1)
      newline = pending.indexOf('\n')
    }
    if (done) break
  }
  await emit(pending)
  if (storedToken() !== token) throw new ApiError(409, 'This request belonged to an ended session.')
  const replacement = response.headers.get(SESSION_HEADER)
  if (replacement) sessionStorage.setItem(SESSION_STORAGE_KEY, replacement)
}

const filePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export const api = {
  state: async (): Promise<StudyState> => {
    try {
      return await request<StudyState>('GET', '/study/state')
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      return request<StudyState>('GET', '/study/state')
    }
  },
  start: (pilot: boolean, taskId: TaskId = 'A') => request<StudyState>('POST', '/study/start', { pilot, task_id: taskId }),
  continueToConsent: () => request<StudyState>('POST', '/study/continue'),
  decline: () => request<StudyState>('POST', '/study/decline'),
  consent: (version: string) => request<StudyState>('POST', '/study/consent', { consent_version: version }),
  setMode: (mode: Mode) => request<StudyState>('POST', '/study/mode', { mode }),
  startPartTwo: (taskId: TaskId) => request<StudyState>('POST', '/study/part-two', { task_id: taskId }),
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
  sendStream: (thread: Thread, content: string, onEvent: (event: ChatStreamEvent) => void) =>
    requestStream(`/chat/${thread}/stream`, { content }, onEvent),
  next: () => request<TurnResult>('POST', '/chat/next'),
  review: () => request<TurnResult>('POST', '/chat/review'),
  followUp: (id: number) => request<TurnResult>('POST', `/chat/follow-ups/${id}`),

  approvals: () => request<Approval[]>('GET', '/approvals'),
  decide: (id: number, decision: Decision) => request<Approval>('POST', `/approvals/${id}/decide`, { decision }),
}
