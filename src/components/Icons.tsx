// Shows a VS Code icon. The icon styles come from the @vscode/codicons package,
// whose CSS is imported once in main.tsx.
export function Codicon({ name }: { name: string }) {
  return <i className={`codicon codicon-${name}`} />
}
