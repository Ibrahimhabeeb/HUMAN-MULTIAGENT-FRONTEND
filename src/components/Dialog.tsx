import { useDialog } from '../store/dialog'
import { Codicon } from './Icons'

export function Dialog() {
  const request = useDialog((s) => s.request)
  if (!request) return null

  function answer(ok: boolean) {
    useDialog.setState({ request: null })
    request!.resolve(ok)
  }

  return (
    <div className="modal-backdrop" onClick={() => answer(false)}>
      <div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="modal-body">
          <Codicon name={request.danger ? 'warning' : 'question'} className={request.danger ? 'modal-icon danger' : 'modal-icon'} />
          <div>
            <div className="modal-title">{request.title}</div>
            <div className="modal-message">{request.message}</div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn secondary" onClick={() => answer(false)}>
            Cancel
          </button>
          <button className={request.danger ? 'btn danger' : 'btn primary'} autoFocus onClick={() => answer(true)}>
            {request.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
