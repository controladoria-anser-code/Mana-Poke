import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTH_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function parseISODate(value: string) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function toISODate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function DateField({
  onChange,
  placeholder = 'dd/mm/aaaa',
  value,
}: {
  onChange: (value: string) => void
  placeholder?: string
  value: string
}) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => parseISODate(value) ?? new Date())
  const containerRef = useRef<HTMLDivElement>(null)

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

  function openCalendar() {
    setViewDate(parseISODate(value) ?? new Date())
    setOpen((current) => !current)
  }

  const selected = parseISODate(value)
  const today = new Date()
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells: { date: Date; outside: boolean }[] = []
  for (let index = 0; index < firstWeekday; index++) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - firstWeekday + index + 1), outside: true })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(year, month, day), outside: false })
  }
  let trailingDay = 1
  while (cells.length % 7 !== 0) {
    cells.push({ date: new Date(year, month + 1, trailingDay), outside: true })
    trailingDay += 1
  }

  return (
    <div className="date-field" ref={containerRef}>
      <button className={`date-field-trigger ${open ? 'open' : ''}`} onClick={openCalendar} type="button">
        <Calendar size={14} />
        <span className={value ? '' : 'placeholder'}>{selected ? selected.toLocaleDateString('pt-BR') : placeholder}</span>
      </button>
      {open && (
        <div className="date-field-popover" role="dialog">
          <div className="date-field-header">
            <button onClick={() => setViewDate(new Date(year, month - 1, 1))} title="Mês anterior" type="button">
              <ChevronLeft size={15} />
            </button>
            <span>
              {MONTH_LABELS[month]} {year}
            </span>
            <button onClick={() => setViewDate(new Date(year, month + 1, 1))} title="Próximo mês" type="button">
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="date-field-weekdays">
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={index}>{label}</span>
            ))}
          </div>
          <div className="date-field-grid">
            {cells.map(({ date, outside }) => (
              <button
                className={[
                  outside ? 'outside' : '',
                  selected && isSameDay(date, selected) ? 'selected' : '',
                  isSameDay(date, today) ? 'today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={date.toISOString()}
                onClick={() => {
                  onChange(toISODate(date))
                  setOpen(false)
                }}
                type="button"
              >
                {date.getDate()}
              </button>
            ))}
          </div>
          <div className="date-field-actions">
            <button
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              type="button"
            >
              Limpar
            </button>
            <button
              onClick={() => {
                onChange(toISODate(today))
                setViewDate(today)
                setOpen(false)
              }}
              type="button"
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
