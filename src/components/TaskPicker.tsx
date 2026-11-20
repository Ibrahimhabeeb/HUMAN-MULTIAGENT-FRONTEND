import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { StudyState, TaskId } from '../api/types'
import { Codicon } from './Icons'

const TASK_ICONS: Record<TaskId, string> = {
  A: 'lock', B: 'folder-opened', C: 'comment-discussion', D: 'settings-gear',
  E: 'mail', F: 'file', G: 'list-unordered',
}

interface TaskPickerProps {
  id: string
  tasks: StudyState['available_tasks']
  value: TaskId | ''
  onChange: (value: TaskId) => void
  disabled?: boolean
}

export function TaskPicker({ id, tasks, value, onChange, disabled = false }: TaskPickerProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef({ text: '', time: 0 })
  const selected = tasks.find((task) => task.id === value)
  const expanded = open && !disabled && tasks.length > 0
  const listId = `${id}-options`

  useEffect(() => {
    if (!expanded) return
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [expanded])

  useEffect(() => {
    if (expanded) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [expanded, activeIndex, id])

  function showMenu(last = false) {
    const selectedIndex = tasks.findIndex((task) => task.id === value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : last ? tasks.length - 1 : 0)
    search.current = { text: '', time: 0 }
    setOpen(true)
  }

  function choose(index: number) {
    if (!tasks[index] || disabled) return
    onChange(tasks[index].id)
    setOpen(false)
    trigger.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || !tasks.length) return
    if (event.key === 'Tab' || event.key === 'Escape') {
      if (expanded && event.key === 'Escape') event.preventDefault()
      setOpen(false)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!expanded) showMenu(event.key === 'ArrowUp')
      else setActiveIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + tasks.length) % tasks.length)
    } else if (expanded && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault()
      setActiveIndex(event.key === 'Home' ? 0 : tasks.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (expanded) choose(activeIndex)
      else showMenu()
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      const now = Date.now()
      const letter = event.key.toLowerCase()
      const previous = now - search.current.time < 650 ? search.current.text : ''
      const text = previous === letter ? letter : previous + letter
      search.current = { text, time: now }
      const start = expanded ? activeIndex + (text.length === 1 ? 1 : 0) : 0
      const index = Array.from({ length: tasks.length }, (_, offset) => (start + offset) % tasks.length)
        .find((index) => tasks[index].label.toLowerCase().startsWith(text))
      if (index !== undefined) {
        setActiveIndex(index)
        setOpen(true)
      }
    }
  }

  return (
    <div ref={root} className={`task-picker${expanded ? ' open' : ''}${disabled ? ' disabled' : ''}`}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
      <button ref={trigger} type="button" id={id} role="combobox" className={`task-select${selected ? '' : ' placeholder'}`}
        aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-expanded={expanded} aria-controls={listId}
        aria-activedescendant={expanded ? `${id}-option-${activeIndex}` : undefined}
        disabled={disabled || !tasks.length} onClick={() => expanded ? setOpen(false) : showMenu()} onKeyDown={onKeyDown}>
        <span className={`task-picker-icon${selected ? ` task-${selected.id.toLowerCase()}` : ''}`}>
          <Codicon name={selected ? TASK_ICONS[selected.id] : 'list-selection'} />
        </span>
        <span className="task-picker-value">{selected?.label ?? 'Select a task'}</span>
        {selected && <span className="task-cwe">{selected.cwe}</span>}
        <Codicon name="chevron-down" className="task-picker-arrow" />
      </button>
      {expanded && (
        <div className="task-picker-menu">
          <div className="task-picker-caption">Choose a coding task <span>{tasks.length} available</span></div>
          <ul id={listId} className="task-picker-options" role="listbox" aria-labelledby={`${id}-label`}>
            {tasks.map((task, index) => (
              <li key={task.id} id={`${id}-option-${index}`} role="option" aria-selected={task.id === value}
                aria-label={`${task.label} (${task.cwe})`} data-task-id={task.id} data-active={index === activeIndex}
                onPointerEnter={() => setActiveIndex(index)} onPointerDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
                <span className={`task-picker-icon task-${task.id.toLowerCase()}`}><Codicon name={TASK_ICONS[task.id]} /></span>
                <span className="task-picker-value">{task.label}</span>
                <span className="task-cwe">{task.cwe}</span>
                <Codicon name="check" className="task-picker-check" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
