import Editor from '@monaco-editor/react'
import { useEffect, useRef } from 'react'
import { Uri, type editor } from 'monaco-editor'
import { fileName, languageOf } from '../lib/files'
import { useWorkspace } from '../store/workspace'
import { Codicon, FileIcon } from './Icons'
import { useDiagnostics } from '../store/diagnostics'
import { watchDiagnostics } from '../monaco/diagnostics'
import { watchVulnerabilities } from '../monaco/vulnerabilities'

function revealTarget(instance: editor.IStandaloneCodeEditor) {
  const target = useDiagnostics.getState().target
  if (!target || instance.getModel()?.uri.toString() !== Uri.parse(target.path).toString()) return
  const position = { lineNumber: target.row, column: target.column }
  instance.setPosition(position)
  instance.revealPositionInCenter(position)
  instance.focus()
}

// Tabs and the Monaco editor. Typing goes into the workspace store, which saves it to the backend.
export function EditorArea() {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const target = useDiagnostics((s) => s.target)
  useEffect(watchDiagnostics, [])
  useEffect(watchVulnerabilities, [])
  useEffect(() => {
    if (editorRef.current && target) revealTarget(editorRef.current)
  }, [target])
  const files = useWorkspace((s) => s.files)
  const openPaths = useWorkspace((s) => s.openPaths)
  const selectedPath = useWorkspace((s) => s.selectedPath)
  const dirty = useWorkspace((s) => s.dirty)
  const { open, close, edit } = useWorkspace.getState()
  const selected = selectedPath ? files[selectedPath] : undefined

  return (
    <div className="editor-area">
      {openPaths.length > 0 && (
        <div className="tab-bar">
          <div className="tabs-scroll">
            {openPaths.map((path) => (
              <div
                key={path}
                className={['tab', path === selectedPath ? 'active' : '', dirty.includes(path) ? 'dirty' : ''].join(' ')}
                onClick={() => open(path)}
                title={path}
              >
                <FileIcon path={path} />
                <span className="tab-label">{fileName(path)}</span>
                <button
                  className="tab-close"
                  title="Close"
                  onClick={(event) => {
                    // The × is inside the tab, so without this the click would ALSO
                    // reach the tab's onClick and re-select the tab we're closing.
                    event.stopPropagation()
                    close(path)
                  }}
                >
                  <Codicon name="close" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="editor-body">
        {selectedPath && selected?.type === 'file' ? (
          <Editor
            // `path` gives each file its own Monaco "model", so each tab keeps
            // its own text and undo history when you switch between them.
            path={selectedPath}
            defaultValue={selected.content}
            language={languageOf(selectedPath).id}
            theme="vs-dark"
            onChange={(value) => edit(selectedPath, value ?? '')}
            onMount={(editor, monaco) => {
              editorRef.current = editor
              const subscription = editor.onDidChangeModel(() => revealTarget(editor))
              editor.onDidDispose(() => { subscription.dispose(); editorRef.current = null })
              revealTarget(editor)
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void useWorkspace.getState().saveAll())
            }}
            options={{
              fontSize: 14,
              fontFamily: "Consolas, 'Cascadia Code', 'Courier New', monospace",
              minimap: { enabled: true },
              automaticLayout: true,
              tabSize: 4,
              // Type into a real (hidden) text box, so keyboard extensions such as Vimium know you're typing
              // and leave letter keys alone. Monaco's newer input method is a plain div they don't recognise.
              editContext: false,
            }}
          />
        ) : (
          <div className="watermark">Open a file from the Explorer</div>
        )}
      </div>
    </div>
  )
}
