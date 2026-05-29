import { useEffect, useRef } from 'react'

export const TileSectionHeader = ({ title }: { title: string }) => (
  <div className="mb-2 flex items-center gap-2">
    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
    <div className="h-px flex-1 bg-border" />
  </div>
)

export const InlineEditableText = ({
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  multiline,
  autoFocus,
  className,
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder: string
  disabled?: boolean
  multiline?: boolean
  autoFocus?: boolean
  className?: string
}) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    if (document.activeElement === ref.current) return
    const nextValue = multiline ? value : value.replace(/\s+/g, ' ').trim()
    const currentValue = multiline ? (ref.current.innerText ?? '') : (ref.current.textContent ?? '')
    if (currentValue !== nextValue) {
      ref.current.textContent = nextValue
    }
  }, [multiline, value])

  // When requested, focus the field and select its contents on mount so a freshly
  // created dashboard lets the user type a name immediately. Runs after the
  // value-sync effect above, so the contents are populated before selection.
  useEffect(() => {
    if (!autoFocus || !ref.current) return
    const element = ref.current
    element.focus()
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [autoFocus])

  return (
    <div className="relative">
      {!value.trim() ? (
        <div className="pointer-events-none absolute inset-0 text-muted-foreground/60">{placeholder}</div>
      ) : null}
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={event => onChange(multiline ? event.currentTarget.innerText : (event.currentTarget.textContent ?? ''))}
        onBlur={onBlur}
        onKeyDown={event => {
          if (!multiline && event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        onPaste={event => {
          event.preventDefault()
          const text = multiline
            ? event.clipboardData.getData('text/plain')
            : event.clipboardData.getData('text/plain').replace(/\s+/g, ' ')
          document.execCommand('insertText', false, text)
        }}
        className={className}
      />
    </div>
  )
}
