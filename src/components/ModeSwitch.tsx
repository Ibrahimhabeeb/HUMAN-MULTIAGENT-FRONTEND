import { api } from '../api/client'
import type { Mode } from '../api/types'
import { saveEverything } from '../store/part'
import { useStudy } from '../store/study'
import { Codicon } from './Icons'

const OPTIONS: Array<[Mode, string, string]> = [
  ['team', 'Team', 'organization'],
  ['single', 'Single', 'sparkle'],
]

// The Team / Single switch. Before consent it sets the next participant's starting mode.
export function ModeSwitch() {
  const mode = useStudy((s) => s.state?.mode)
  const busy = useStudy((s) => s.busy)

  async function choose(next: Mode) {
    if (next === mode) return
    await saveEverything()
    await useStudy.getState().run(() => api.setMode(next))
  }

  return (
    <div className="mode-switch" role="group" aria-label="Team or single mode">
      {OPTIONS.map(([value, label, icon]) => (
        <button key={value} className={value === mode ? 'on' : ''} aria-pressed={value === mode} disabled={busy} onClick={() => choose(value)}>
          <Codicon name={icon} /> {label}
        </button>
      ))}
    </div>
  )
}
