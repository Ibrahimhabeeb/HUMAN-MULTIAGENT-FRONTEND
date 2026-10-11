import { memo, useEffect, useRef, useState } from 'react'
import hljs from 'highlight.js/lib/core'
import python from 'highlight.js/lib/languages/python'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import { Codicon } from './Icons'
import '../styles/code-block.css'

for (const [name, grammar] of Object.entries({ python, javascript, typescript, json, bash, sql, xml, css })) {
  hljs.registerLanguage(name, grammar)
}

interface CodeBlockProps {
  code: string
  language?: string
  path?: string
  location?: string
}

export const CodeBlock = memo(function CodeBlock({ code, language = 'python', path, location }: CodeBlockProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const known = hljs.getLanguage(language)
  const html = known ? hljs.highlight(code, { language, ignoreIllegals: true }).value : null
  const label = known?.name ?? language
  const copyLabel = copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed. Try again.' : 'Copy code'

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopyState('idle'), 2200)
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <div className="code-block-heading">
          <span className="code-block-path"><Codicon name={path ? 'file-code' : 'code'} /> {path || label}</span>
          {path && <span className="code-block-language">{label}</span>}
        </div>
        <button type="button" className="icon-btn code-copy" title={copyLabel} aria-label={copyLabel} onClick={() => void copy()}>
          <Codicon name={copyState === 'copied' ? 'check' : copyState === 'failed' ? 'warning' : 'copy'} />
        </button>
        <span className="sr-only" role="status" aria-live="polite">{copyState !== 'idle' ? copyLabel : ''}</span>
      </div>
      {location && <div className="code-block-location"><b>Location:</b> {location}</div>}
      <pre className="code-block-content" tabIndex={0}>
        {html === null ? <code>{code}</code> : <code dangerouslySetInnerHTML={{ __html: html }} />}
      </pre>
    </div>
  )
})
