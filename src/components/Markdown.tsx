import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Children, isValidElement, type ReactNode } from 'react'
import { CodeBlock } from './CodeBlock'

function CodeFence({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children)[0]
  if (!isValidElement<{ children?: ReactNode; className?: string }>(child)) return <pre>{children}</pre>
  const code = String(child.props.children ?? '').replace(/\n$/, '')
  const language = /language-([^\s]+)/.exec(child.props.className ?? '')?.[1] ?? 'python'
  return <CodeBlock code={code} language={language} />
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeFence }}>{text}</ReactMarkdown>
    </div>
  )
}
