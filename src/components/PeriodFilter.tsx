import { useEffect, useRef, useState, type RefObject } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { dateKey, formatRangeLabel, parseDateKey, type PeriodMode } from '../lib/period'

const periodOptions: { value: PeriodMode; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Semanal' },
  { value: '30d', label: 'Mensal' },
  { value: '12m', label: 'Anual' },
  { value: 'custom', label: 'Personalizado' },
]

const weekdayLabels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const calendarMonthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function buildCalendarCells(viewDate: Date) {
  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const gridStart = new Date(firstOfMonth)
  gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay())
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart)
    cellDate.setDate(gridStart.getDate() + i)
    cells.push({ date: cellDate, inMonth: cellDate.getMonth() === viewDate.getMonth() })
  }
  return cells
}

const quickRanges: { label: string; days: number | 'month' }[] = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
  { label: 'Este mês', days: 'month' },
]

function DateRangeCalendar({
  from,
  to,
  onChange,
  onClose,
  triggerRef,
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  const [viewDate, setViewDate] = useState(() => (to ? parseDateKey(to) : new Date()))
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      const target = event.target as Node
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [onClose, triggerRef])

  const picking = Boolean(from) && !to
  const cells = buildCalendarCells(viewDate)

  function handlePick(key: string) {
    if (!picking) {
      onChange(key, '')
      return
    }
    if (key < from) {
      onChange(key, from)
    } else {
      onChange(from, key)
    }
    onClose()
  }

  function applyQuickRange(days: number | 'month') {
    const today = new Date()
    const start = days === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(today)
    if (days !== 'month') start.setDate(start.getDate() - (days - 1))
    onChange(dateKey(start), dateKey(today))
    setViewDate(today)
    onClose()
  }

  const rangeStart = picking && hoverKey ? (hoverKey < from ? hoverKey : from) : from
  const rangeEnd = picking && hoverKey ? (hoverKey < from ? from : hoverKey) : to

  return (
    <div className="period-filter-popover" ref={popoverRef}>
      <div className="date-range-popover-inner">
        <div className="date-range-quick-picks">
          {quickRanges.map((preset) => (
            <button key={preset.label} onClick={() => applyQuickRange(preset.days)} type="button">
              {preset.label}
            </button>
          ))}
        </div>
        <div className="date-range-calendar">
          <div className="date-range-popover-header">
            <button
              aria-label="Mês anterior"
              onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
              type="button"
            >
              <ChevronLeft size={16} />
            </button>
            <strong>{capitalize(calendarMonthFormatter.format(viewDate))}</strong>
            <button
              aria-label="Próximo mês"
              onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
              type="button"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="date-range-weekdays">
            {weekdayLabels.map((weekday, index) => (
              <span key={`${weekday}-${index}`}>{weekday}</span>
            ))}
          </div>
          <div className="date-range-grid" onMouseLeave={() => setHoverKey(null)}>
            {cells.map(({ date, inMonth }, index) => {
              const key = dateKey(date)
              const isStart = key === rangeStart
              const isEnd = key === rangeEnd
              const inRange = Boolean(rangeStart) && Boolean(rangeEnd) && key > rangeStart && key < rangeEnd
              const isToday = key === dateKey(new Date())
              const col = index % 7
              const roundLeft = isStart || (inRange && col === 0)
              const roundRight = isEnd || (inRange && col === 6)
              const classNames = [
                'date-range-day',
                !inMonth && 'outside',
                (isStart || isEnd) && 'selected',
                inRange && 'in-range',
                isToday && 'today',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  className={classNames}
                  key={key}
                  onClick={() => handlePick(key)}
                  onMouseEnter={() => setHoverKey(key)}
                  style={
                    inRange || isStart || isEnd
                      ? {
                          borderTopLeftRadius: roundLeft ? 8 : 0,
                          borderBottomLeftRadius: roundLeft ? 8 : 0,
                          borderTopRightRadius: roundRight ? 8 : 0,
                          borderBottomRightRadius: roundRight ? 8 : 0,
                        }
                      : undefined
                  }
                  type="button"
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PeriodFilterBar({
  customFrom,
  customTo,
  periodMode,
  setCustomFrom,
  setCustomTo,
  setPeriodMode,
}: {
  customFrom: string
  customTo: string
  periodMode: PeriodMode
  setCustomFrom: (value: string) => void
  setCustomTo: (value: string) => void
  setPeriodMode: (mode: PeriodMode) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerTriggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="period-filter-bar">
      <div className="chart-period-filter">
        {periodOptions.map((option) => (
          <button
            className={periodMode === option.value ? 'active' : ''}
            key={option.value}
            onClick={() => {
              setPeriodMode(option.value)
              if (option.value === 'custom') setPickerOpen(true)
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {periodMode === 'custom' && (
        <div className="period-filter-custom">
          <button
            aria-label="Selecionar período"
            className={`date-range-trigger-icon${pickerOpen ? ' open' : ''}`}
            onClick={() => setPickerOpen((value) => !value)}
            ref={pickerTriggerRef}
            type="button"
          >
            <Calendar size={14} />
          </button>
          <span className="period-filter-range-label">{formatRangeLabel(customFrom, customTo)}</span>
          {pickerOpen && (
            <DateRangeCalendar
              from={customFrom}
              onChange={(nextFrom, nextTo) => {
                setCustomFrom(nextFrom)
                setCustomTo(nextTo)
              }}
              onClose={() => setPickerOpen(false)}
              to={customTo}
              triggerRef={pickerTriggerRef}
            />
          )}
        </div>
      )}
    </div>
  )
}
