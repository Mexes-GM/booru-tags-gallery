import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Shapes, X } from 'lucide-react'
import { cn } from '../utils/cn'
import {
  PromptFilter,
  TaxonomyGroup,
  promptGroupHue,
  promptGroupLabel,
  promptSubLabel
} from '../utils/promptTaxonomy'

interface PromptFilterMenuProps {
  taxonomy: TaxonomyGroup[]
  value: PromptFilter | null
  onChange: (value: PromptFilter | null) => void
  /** Prompt categories only exist on General tags. */
  disabled?: boolean
}

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/**
 * "Prompt" filter: narrows General tags to one of Booru Prompt Gallery's
 * prompt categories (Clothing) or subcategories (Clothing › Headwear).
 * The menu is folded away; only the active choice stays on screen.
 */
const PromptFilterMenu: React.FC<PromptFilterMenuProps> = ({ taxonomy, value, onChange, disabled }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  if (taxonomy.length === 0) return null

  const select = (next: PromptFilter | null) => {
    onChange(next)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const isActive = (group: string, sub?: string) => value?.group === group && value?.sub === sub

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={disabled ? t('search.promptFilterUnavailable') : t('search.promptFilterTitle')}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background pl-3 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
          value ? 'pr-9' : 'pr-2.5'
        )}
      >
        {value ? (
          <>
            <span className={cn('cat-dot', promptGroupHue(value.group))} aria-hidden="true" />
            <span className="max-w-[14rem] truncate">
              <span className={value.sub ? 'text-muted-foreground' : 'font-medium'}>{promptGroupLabel(value.group)}</span>
              {value.sub && (
                <>
                  <span aria-hidden="true" className="mx-1 text-muted-foreground/60">›</span>
                  <span className="font-medium">{promptSubLabel(value.sub)}</span>
                </>
              )}
            </span>
          </>
        ) : (
          <>
            <Shapes className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>{t('search.promptFilter')}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
          </>
        )}
      </button>

      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={t('search.clearPromptFilter')}
          title={t('search.clearPromptFilter')}
          className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          role="menu"
          aria-label={t('search.promptFilter')}
          className="absolute left-0 top-[calc(100%+6px)] z-50 sm:left-auto sm:right-0 max-h-[min(28rem,70vh)] w-72 overflow-y-auto rounded-[10px] border border-border bg-popover py-1 text-popover-foreground shadow-md"
        >
          {taxonomy.map((group, gi) => (
            <div key={group.group} role="group" aria-label={promptGroupLabel(group.group)}>
              {gi > 0 && <div className="mx-3 my-1 h-px bg-border" aria-hidden="true" />}
              <MenuItem
                active={isActive(group.group)}
                onSelect={() => select({ group: group.group })}
                count={group.count}
              >
                <span className={cn('cat-dot', promptGroupHue(group.group))} aria-hidden="true" />
                <span className="font-medium">{promptGroupLabel(group.group)}</span>
              </MenuItem>
              {group.subs.map((sub) => (
                <MenuItem
                  key={sub.sub}
                  active={isActive(group.group, sub.sub)}
                  onSelect={() => select({ group: group.group, sub: sub.sub })}
                  count={sub.count}
                  indent
                >
                  {promptSubLabel(sub.sub)}
                </MenuItem>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const MenuItem: React.FC<{
  active: boolean
  onSelect: () => void
  count: number
  indent?: boolean
  children: React.ReactNode
}> = ({ active, onSelect, count, indent, children }) => (
  <button
    type="button"
    role="menuitemradio"
    aria-checked={active}
    onClick={onSelect}
    className={cn(
      'flex w-full items-center gap-2 py-1.5 pr-3 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
      indent ? 'pl-8 text-foreground/85' : 'pl-3'
    )}
  >
    <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</span>
    <span className="font-mono text-xs tabular-nums text-muted-foreground">{compactNumber.format(count)}</span>
    <Check className={cn('h-3.5 w-3.5 shrink-0 text-primary-text', !active && 'invisible')} aria-hidden="true" />
  </button>
)

export default PromptFilterMenu
