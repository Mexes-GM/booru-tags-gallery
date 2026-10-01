import i18n from '../i18n'
import { LocalTagData } from '../types'

/**
 * Prompt taxonomy synced from Booru Prompt Gallery (`npm run sync-tags`):
 * a tag's `promptCategory` (group) and `subcategory`. Only General tags carry it.
 */

export interface PromptFilter {
  group: string
  /** When omitted the whole group matches. */
  sub?: string
}

export interface TaxonomyGroup {
  group: string
  count: number
  subs: Array<{ sub: string; count: number }>
}

// Display order, roughly the order a prompt is written in.
const GROUP_ORDER = ['appearance', 'clothing', 'pose', 'equipment', 'scenery', 'creature', 'style']

// Subcategories that arrive without a promptCategory; they read as one group.
const STYLE_SUBS = new Set(['style', 'layout'])

export const getPromptGroup = (tag: Pick<LocalTagData, 'promptCategory' | 'subcategory'>): string | undefined =>
  tag.promptCategory || (tag.subcategory && STYLE_SUBS.has(tag.subcategory) ? 'style' : undefined)

export const matchesPromptFilter = (tag: LocalTagData, filter: PromptFilter | null): boolean => {
  if (!filter) return true
  if (getPromptGroup(tag) !== filter.group) return false
  return !filter.sub || tag.subcategory === filter.sub
}

/** Groups and subcategories present in the data, with tag counts. */
export function buildTaxonomy(tags: LocalTagData[]): TaxonomyGroup[] {
  const groups = new Map<string, Map<string, number>>()
  for (const tag of tags) {
    const group = getPromptGroup(tag)
    if (!group) continue
    const subs = groups.get(group) ?? new Map<string, number>()
    const sub = tag.subcategory ?? ''
    subs.set(sub, (subs.get(sub) ?? 0) + 1)
    groups.set(group, subs)
  }

  const rank = (g: string) => {
    const i = GROUP_ORDER.indexOf(g)
    return i === -1 ? GROUP_ORDER.length : i
  }

  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([group, subs]) => ({
      group,
      count: [...subs.values()].reduce((sum, n) => sum + n, 0),
      subs: [...subs.entries()]
        .filter(([sub]) => sub)
        .sort((a, b) => b[1] - a[1])
        .map(([sub, count]) => ({ sub, count })),
    }))
}

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export const promptGroupLabel = (group: string): string =>
  i18n.t(`promptTaxonomy.groups.${group}`, { defaultValue: titleCase(group) })

export const promptSubLabel = (sub: string): string =>
  i18n.t(`promptTaxonomy.subs.${sub}`, { defaultValue: titleCase(sub) })

/** CSS class that sets the group's hue for `.cat-dot`. */
export const promptGroupHue = (group: string): string =>
  GROUP_ORDER.includes(group) ? `pc-${group}` : 'cat-default'
