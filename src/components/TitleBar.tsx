import { api } from '../api/client'
import type { StudyState } from '../api/types'
import { MODE_NAMES } from '../lib/agents'
import { ask } from '../store/dialog'
import { saveEverything } from '../store/part'
import { useStudy } from '../store/study'
import { useTests } from '../store/tests'
import { useUi } from '../store/ui'
import { Codicon } from './Icons'
import { RestartButton } from './RestartButton'

export function TitleBar({ state }: { state: StudyState }) {
  const sidebarVisible = useUi((s) => s.sidebarVisible)
  const panelVisible = useUi((s) => s.panelVisible)
  const chatVisible = useUi((s) => s.chatVisible)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const togglePanel = useUi((s) => s.togglePanel)
  const toggleChat = useUi((s) => s.toggleChat)
  const running = useTests((s) => s.running)
  const busy = useStudy((s) => s.busy)

  async function done() {
    const ok = await ask('Finish this part?', 'Your code is saved and this part ends. You cannot change it afterwards.', 'Finish part')
    if (!ok) return
    await saveEverything()
    await useStudy.getState().run(api.done)
  }

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <Codicon name="shield" className="app-mark" />
        <span className="app-name">Secure Coding Room</span>
      </div>

      <div className="titlebar-center">
        <div className="command-center">
          Part {state.part} of 2 · {MODE_NAMES[state.mode]}
          {state.task && ` · ${state.task.label}`}
        </div>
      </div>

      <div className="titlebar-right">
        <button className="run-btn" disabled={running} onClick={() => useTests.getState().run(state.mode)}>
          <Codicon name={running ? 'loading' : 'beaker'} className={running ? 'codicon-modifier-spin' : ''} />
          {running ? 'Running…' : 'Run tests'}
        </button>
        <button className="run-btn done" disabled={busy} onClick={done}>
          <Codicon name="check" /> Finish part
        </button>

        <span className="titlebar-sep" />

        {/* Layout toggles, like the three icons in the top-right of VS Code.
            The icon switches between the "on" and "-off" version. */}
        <button className="icon-btn layout" title="Toggle Primary Side Bar (Ctrl+B)" onClick={() => toggleSidebar()}>
          <Codicon name={sidebarVisible ? 'layout-sidebar-left' : 'layout-sidebar-left-off'} />
        </button>
        <button className="icon-btn layout" title="Toggle Panel (Ctrl+J)" onClick={() => togglePanel()}>
          <Codicon name={panelVisible ? 'layout-panel' : 'layout-panel-off'} />
        </button>
        <button className="icon-btn layout" title="Toggle Agent Room (Ctrl+Shift+A)" onClick={() => toggleChat()}>
          <Codicon name={chatVisible ? 'layout-sidebar-right' : 'layout-sidebar-right-off'} />
        </button>
        <RestartButton />
      </div>
    </header>
  )
}
