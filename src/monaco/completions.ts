import * as monaco from 'monaco-editor'
import { api } from '../api/client'

const empty = { suggestions: [] }
const kinds: Record<string, monaco.languages.CompletionItemKind> = {
  class: monaco.languages.CompletionItemKind.Class,
  function: monaco.languages.CompletionItemKind.Function,
  instance: monaco.languages.CompletionItemKind.Variable,
  keyword: monaco.languages.CompletionItemKind.Keyword,
  module: monaco.languages.CompletionItemKind.Module,
  param: monaco.languages.CompletionItemKind.Variable,
  property: monaco.languages.CompletionItemKind.Property,
  statement: monaco.languages.CompletionItemKind.Variable,
}

monaco.languages.registerCompletionItemProvider('python', {
  triggerCharacters: ['.'],
  async provideCompletionItems(model, position, _context, cancellation) {
    const path = model.uri.path.replace(/^\/+/, '')
    const content = model.getValue()
    if (!path.endsWith('.py') || content.length > 100_000) return empty

    const controller = new AbortController()
    const listener = cancellation.onCancellationRequested(() => controller.abort())
    try {
      const result = await api.completions(path, content, position.lineNumber, position.column, controller.signal)
      if (cancellation.isCancellationRequested || model.isDisposed()) return empty
      const word = model.getWordAtPosition(position)
      const range = new monaco.Range(position.lineNumber, word?.startColumn ?? position.column,
        position.lineNumber, word?.endColumn ?? position.column)
      return {
        suggestions: result.items.map((item) => ({
          label: item.name,
          kind: kinds[item.type] ?? monaco.languages.CompletionItemKind.Text,
          insertText: item.name,
          range,
          detail: item.description,
        })),
      }
    } catch {
      return empty
    } finally {
      listener.dispose()
    }
  },
})
