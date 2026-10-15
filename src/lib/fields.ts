import type { HumanCategory, Proposal } from '../api/types'

// The fields of each security-state item, for the human's own forms in the security state panel.

export type FieldKind = 'text' | 'textarea' | 'code' | 'severity' | 'number' | 'list'

export interface Field {
  key: string
  label: string
  kind: FieldKind
  required?: boolean
}

export type FormValues = Record<string, string>

export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical']

const description: Field = { key: 'description', label: 'Description', kind: 'textarea', required: true }
const severity: Field = { key: 'severity', label: 'Severity', kind: 'severity', required: true }
const cwe: Field = { key: 'cwe', label: 'CWE, e.g. CWE-89', kind: 'text' }

export const CATEGORY_FIELDS: Record<HumanCategory, Field[]> = {
  assumptions: [{ key: 'text', label: 'Assumption', kind: 'textarea', required: true }],
  risks: [
    description,
    severity,
    cwe,
    { key: 'owasp', label: 'OWASP Top 10 category', kind: 'text' },
    { key: 'stride', label: 'STRIDE category', kind: 'text' },
  ],
  vulnerabilities: [
    description,
    severity,
    { key: 'file', label: 'File', kind: 'text' },
    { key: 'line', label: 'Line', kind: 'number' },
    cwe,
  ],
  mitigations: [
    { key: 'vulnerability_id', label: 'Vulnerability it fixes, e.g. V1', kind: 'text', required: true },
    description,
    { key: 'file', label: 'File', kind: 'text' },
    { key: 'location', label: 'Where the code goes', kind: 'text' },
    { key: 'code', label: 'Code', kind: 'code' },
  ],
}

export const RATIONALE: Field = { key: 'rationale', label: 'Why the risk is accepted (optional)', kind: 'textarea' }

export function toValues(fields: Field[], source: Proposal = {}): FormValues {
  return Object.fromEntries(
    fields.map((field) => {
      const value = source[field.key]
      if (Array.isArray(value)) return [field.key, value.join(', ')]
      if (value === null || value === undefined) return [field.key, field.kind === 'severity' ? 'Medium' : '']
      return [field.key, String(value)]
    }),
  )
}

export function toPayload(fields: Field[], values: FormValues): Proposal {
  return Object.fromEntries(
    fields.map((field) => {
      const raw = values[field.key] ?? ''
      if (field.kind === 'list') return [field.key, raw.split(',').map((s) => s.trim()).filter(Boolean)]
      if (field.kind === 'code') return [field.key, raw]
      const text = raw.trim()
      if (field.kind === 'number') return [field.key, text === '' ? null : Number(text)]
      return [field.key, text === '' && !field.required ? null : text]
    }),
  )
}
