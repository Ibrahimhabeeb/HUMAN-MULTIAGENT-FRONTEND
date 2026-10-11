import { request } from './client'

export interface Diagnostic {
  code: string
  message: string
  severity: 'error' | 'warning'
  location: { row: number; column: number }
  end_location: { row: number; column: number }
}

export interface LintResult {
  path: string
  diagnostics: Diagnostic[]
}

export const lintFile = (path: string, content: string, signal: AbortSignal) =>
  request<LintResult>('POST', '/workspace/lint', { path, content }, signal)
