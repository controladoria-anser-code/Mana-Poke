import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export function Select<T extends string>({
  compact,
  disabled,
  icon: Icon,
  onChange,
  options,
  value,
}: {
  compact?: boolean
  disabled?: boolean
  icon?: ComponentType<{ size?: number }>
  onChange: (value: T) => void
  options: readonly { value: T; label: string }[]
  value: T
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div className={`filter-select${compact ? ' compact' : ''}`} ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`filter-select-trigger ${open ? 'open' : ''}`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {Icon && <Icon size={14} />}
        <span>{selected?.label}</span>
        <ChevronDown className="chevron" size={16} />
      </button>
      {open && (
        <div className="filter-select-menu" role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={option.value === value ? 'active' : ''}
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              role="option"
              type="button"
            >
              {option.label}
              {option.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
