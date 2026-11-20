import { useEffect, useState, type RefObject } from 'react'
import { Group, Panel, Separator, usePanelRef, type PanelImperativeHandle } from 'react-resizable-panels'
import type { StudyState } from '../api/types'
import { loadPart, resetPart } from '../store/part'
import { useAgents } from '../store/agents'
import { useUi } from '../store/ui'
import { ActivityBar } from './ActivityBar'
import { AgentChat } from './AgentChat'
import { BottomPanel } from './BottomPanel'
import { EditorArea } from './EditorArea'
import { Explorer } from './Explorer'
import { NotesPanel } from './NotesPanel'
import { SecurityPanel } from './SecurityPanel'
import { StatusBar } from './StatusBar'
import { TitleBar } from './TitleBar'

// A "custom hook": a function starting with `use` that uses other hooks.
// It keeps one panel in step with a true/false value from the store.
function useCollapsible(panelRef: RefObject<PanelImperativeHandle | null>, visible: boolean) {
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    if (visible) panel.expand()
    else panel.collapse()
  }, [panelRef, visible])
}

// The other direction: if you DRAG a panel shut, tell the store it's hidden.
function syncVisibility(key: 'sidebarVisible' | 'panelVisible' | 'chatVisible') {
  return (size: { inPixels: number }) => {
    const visible = size.inPixels > 1
    if (useUi.getState()[key] !== visible) useUi.setState({ [key]: visible })
  }
}

// The IDE for one part: the same in both modes except the sidebar view and the chat.
export function Workbench({ state }: { state: StudyState }) {
  const mode = state.mode
  const sidebarView = useUi((s) => s.sidebarView)
  const sidebarVisible = useUi((s) => s.sidebarVisible)
  const panelVisible = useUi((s) => s.panelVisible)
  const chatVisible = useUi((s) => s.chatVisible)
  const [readyPart, setReadyPart] = useState<string | null>(null)
  const partKey = `${state.participant}/${state.part}`
  const hasAsked = useAgents((s) => s.messages.some((message) => message.role === 'human'))
  const showChatPrompt = readyPart === partKey && !hasAsked

  const sidebarRef = usePanelRef()
  const panelRef = usePanelRef()
  const chatRef = usePanelRef()
  useCollapsible(sidebarRef, sidebarVisible)
  useCollapsible(panelRef, panelVisible)
  useCollapsible(chatRef, chatVisible)

  useEffect(() => {
    let mounted = true
    void loadPart(mode).then(() => { if (mounted) setReadyPart(partKey) })
    return () => { mounted = false; resetPart() }
  }, [partKey, mode])

  useEffect(() => {
    if (showChatPrompt) useUi.getState().showRightTab('chat')
  }, [showChatPrompt])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const ui = useUi.getState()

      if (ctrl && !e.shiftKey && key === 'b') ui.toggleSidebar()
      else if (ctrl && !e.shiftKey && key === 'j') ui.togglePanel()
      else if (ctrl && e.shiftKey && key === 'e') ui.showSidebarView('explorer')
      else if (ctrl && e.shiftKey && key === 'y') ui.showSidebarView(mode === 'team' ? 'security' : 'notes')
      else if (ctrl && e.shiftKey && key === 'a') ui.toggleChat()
      else return

      e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode])

  let sidebar = <Explorer title={state.task?.label ?? 'Workspace'} />
  if (sidebarView === 'security' && mode === 'team') sidebar = <SecurityPanel />
  if (sidebarView === 'notes' && mode === 'single') sidebar = <NotesPanel />

  return (
    <div className="workbench">
      <TitleBar state={state} />

      <div className="workbench-main">
        <ActivityBar mode={mode} />

        <Group orientation="horizontal" className="workbench-group">
          <Panel
            id="sidebar"
            panelRef={sidebarRef}
            collapsible
            defaultSize={290}
            minSize={200}
            groupResizeBehavior="preserve-pixel-size"
            onResize={syncVisibility('sidebarVisible')}
            className="sidebar"
          >
            {sidebar}
          </Panel>

          <Separator className="sash vertical" />

          <Panel id="center" minSize={320}>
            <Group orientation="vertical">
              <Panel id="editor" minSize={120}>
                <EditorArea />
              </Panel>

              <Separator className="sash horizontal" />

              <Panel
                id="panel"
                panelRef={panelRef}
                collapsible
                defaultSize={200}
                minSize={100}
                groupResizeBehavior="preserve-pixel-size"
                onResize={syncVisibility('panelVisible')}
              >
                <BottomPanel mode={mode} />
              </Panel>
            </Group>
          </Panel>

          <Separator className="sash vertical" />

          <Panel
            id="chat"
            panelRef={chatRef}
            collapsible
            defaultSize={420}
            minSize={300}
            groupResizeBehavior="preserve-pixel-size"
            onResize={syncVisibility('chatVisible')}
            className="chat-panel"
          >
            <AgentChat mode={mode} showChatPrompt={showChatPrompt} />
          </Panel>
        </Group>
      </div>

      <StatusBar />
    </div>
  )
}
