import { useUi } from '../store/ui'
import { Codicon } from './Icons'

export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)

  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-item ${toast.kind}`} role="status" onClick={() => dismiss(toast.id)}>
          <Codicon name={toast.kind === 'error' ? 'error' : 'info'} />
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  )
}
