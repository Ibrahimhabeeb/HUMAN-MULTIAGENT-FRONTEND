import { useState, type FormEvent } from 'react'
import type { Proposal } from '../api/types'
import { SEVERITIES, toPayload, toValues, type Field } from '../lib/fields'

interface FieldFormProps {
  fields: Field[]
  initial?: Proposal
  submitLabel: string
  onSubmit: (payload: Proposal) => Promise<string | null> // returns an error message, or null when it worked
  onCancel: () => void
}

export function FieldForm({ fields, initial, submitLabel, onSubmit, onCancel }: FieldFormProps) {
  const [values, setValues] = useState(() => toValues(fields, initial))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(await onSubmit(toPayload(fields, values)))
    setBusy(false)
  }

  function input(field: Field) {
    const value = values[field.key] ?? ''
    const change = (next: string) => setValues({ ...values, [field.key]: next })
    switch (field.kind) {
      case 'severity':
        return (
          <select value={value} onChange={(e) => change(e.target.value)}>
            {SEVERITIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )
      case 'textarea':
        return <textarea rows={3} value={value} onChange={(e) => change(e.target.value)} />
      case 'code':
        return <textarea className="code-input" rows={10} spellCheck={false} value={value} onChange={(e) => change(e.target.value)} />
      case 'number':
        return <input type="number" min={1} value={value} onChange={(e) => change(e.target.value)} />
      default:
        return <input value={value} onChange={(e) => change(e.target.value)} />
    }
  }

  return (
    <form className="add-item-form field-form" onSubmit={submit}>
      {fields.map((field) => (
        <label key={field.key} className="field">
          <span className="field-label">{field.label}</span>
          {input(field)}
        </label>
      ))}
      {error && <div className="field-error">{error}</div>}
      <div className="add-item-row">
        <button className="btn small primary" type="submit" disabled={busy}>
          {submitLabel}
        </button>
        <button className="btn small secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
