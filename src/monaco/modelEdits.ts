import { editor, Range, Selection } from 'monaco-editor'
import { mapOffset, textEdits } from '../lib/textEdits'

export function applyModelText(model: editor.ITextModel, content: string) {
  model.pushStackElement()
  model.pushEOL(editor.EndOfLineSequence.LF)
  const edits = textEdits(model.getValue(), content.replace(/\r\n?/g, '\n'))
  if (!edits.length) {
    model.pushStackElement()
    return
  }
  const views = editor.getEditors().filter(view => view.getModel() === model).map(view => ({
    view, selections: view.getSelections() ?? [],
  }))
  const mapped = views.map(({ view, selections }) => ({
    view, selections: selections.map(selection => {
      const start = model.getOffsetAt(selection.getStartPosition())
      const end = model.getOffsetAt(selection.getEndPosition())
      const backwards = model.getOffsetAt(selection.getSelectionStart()) > model.getOffsetAt(selection.getPosition())
      const touched = start !== end && edits.some(edit => edit.start < end && edit.end > start
        || edit.start === edit.end && edit.start > start && edit.start < end)
      if (touched) {
        // The highlighted code changed remotely; leave a caret rather than a stale replacement range.
        const offset = mapOffset(model.getOffsetAt(selection.getPosition()), edits, true)
        return { start: offset, end: offset }
      }
      const mappedStart = mapOffset(start, edits, true)
      const mappedEnd = mapOffset(end, edits, start === end)
      return backwards ? { start: mappedEnd, end: mappedStart } : { start: mappedStart, end: mappedEnd }
    }),
  }))
  const selections = (index: number) => mapped[index]?.selections.map(range => {
    const start = model.getPositionAt(range.start)
    const end = model.getPositionAt(range.end)
    return new Selection(start.lineNumber, start.column, end.lineNumber, end.column)
  }) ?? []
  model.pushEditOperations(views[0]?.selections ?? [], edits.map(edit => ({
    range: Range.fromPositions(model.getPositionAt(edit.start), model.getPositionAt(edit.end)), text: edit.text,
  })), () => selections(0))
  mapped.forEach(({ view }, index) => view.setSelections(selections(index)))
  model.pushStackElement()
}
