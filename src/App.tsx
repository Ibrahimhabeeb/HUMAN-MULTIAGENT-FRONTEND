import { useState } from 'react'
import { ActivityBar } from './components/ActivityBar'
import { Explorer } from './components/Explorer'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { SAMPLE_FILES } from './data/sampleFiles'

export default function App() {
  // State: which file is selected. It starts as null (nothing selected).
  // When setSelectedPath is called, React re-draws App with the new value.
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  return (
    <div className="workbench">
      <TitleBar />

      {/* Everything between the title bar and the status bar, side by side */}
      <div className="workbench-main">
        <ActivityBar />

        {/* Sidebar: fixed width for now (drag-to-resize comes later) */}
        <div className="sidebar" style={{ width: 270 }}>
          <Explorer files={SAMPLE_FILES} selectedPath={selectedPath} onSelect={setSelectedPath} />
        </div>

        {/* Editor area: shows which file is selected (the real editor comes next sprint) */}
        <div className="editor-area" style={{ flex: 1 }}>
          <div className="watermark">{selectedPath ? `Selected: ${selectedPath}` : 'Open a file to start editing'}</div>
        </div>

        {/* Chat column on the right */}
        <div className="chat-panel" style={{ width: 390 }}>
          <div className="agent-chat">
            <div className="sidebar-title">
              <span>Agent Room</span>
            </div>
          </div>
        </div>
      </div>

      <StatusBar />
    </div>
  )
}
