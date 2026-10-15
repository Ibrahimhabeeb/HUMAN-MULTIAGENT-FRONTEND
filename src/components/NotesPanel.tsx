import { useNotes } from '../store/notes'

// Single mode: a plain notes box instead of the shared security state.
export function NotesPanel() {
  const text = useNotes((s) => s.text)
  const saved = useNotes((s) => s.saved)

  return (
    <div className="sidebar-view">
      <div className="sidebar-title">
        <span>Notes</span>
        <span className="notes-status">{saved ? 'Saved' : 'Saving…'}</span>
      </div>
      <p className="notes-hint">Write down anything you want to keep track of, for example risks or assumptions.</p>
      <textarea
        className="notes-box"
        value={text}
        placeholder="Your notes"
        onChange={(e) => useNotes.getState().edit(e.target.value)}
        onBlur={() => void useNotes.getState().save()}
      />
    </div>
  )
}
