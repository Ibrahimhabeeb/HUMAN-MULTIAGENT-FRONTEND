import { api } from '../api/client'
import { ask } from '../store/dialog'
import { useStudy } from '../store/study'
import { Codicon } from './Icons'

// Researcher only: ends the session at any point and goes back to Start.
export function RestartButton({ withLabel = false }: { withLabel?: boolean }) {
  async function restart() {
    const ok = await ask(
      'Restart for a new participant?',
      "This ends the current session and goes back to Start. The participant's data is kept, and they are marked as incomplete if they had not finished.",
      'Restart',
      true,
    )
    if (ok) await useStudy.getState().run(api.restart)
  }

  return withLabel ? (
    <button className="btn small secondary" onClick={restart}>
      <Codicon name="debug-restart" /> Restart for new participant
    </button>
  ) : (
    <button className="icon-btn layout" title="Restart for new participant (researcher)" onClick={restart}>
      <Codicon name="debug-restart" />
    </button>
  )
}
