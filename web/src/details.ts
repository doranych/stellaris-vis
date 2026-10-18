import type { Model } from './model'
import { escape, fmt } from './table'

// renderDetails fills the panel about the selected empire, or hides it when nothing is selected.
export function renderDetails(root: HTMLElement, m: Model | null, i: number | null) {
  const e = i === null ? undefined : m?.empires?.[i]
  root.hidden = !e
  if (!m || !e) return

  const list = (xs: string[] | null | undefined) => escape((xs ?? []).join(', ')) || '—'
  const ark = m.arks?.find((a) => a.owner === i)
  const capital =
    e.capitalSystem >= 0
      ? escape(m.systems[e.capitalSystem].name)
      : ark
        ? `ark at ${escape(m.systems[ark.system].name)}`
        : '—'
  const stat = (label: string, value: string) => `<div><span>${label}</span>${value}</div>`
  const row = (label: string, value: string | undefined) => (value ? `<dt>${label}</dt><dd>${value}</dd>` : '')

  root.innerHTML = `
    <h2><span class="swatch" style="background:${e.borderColour}"></span><span class="swatch" style="background:${e.fillColour}"></span>
      ${escape(e.name)}${e.isPlayer ? ' ★' : ''}</h2>
    <div class="sub">${escape([e.authority, e.government].filter(Boolean).join(' · '))}${e.type !== 'default' ? ` · ${escape(e.type)}` : ''}</div>
    <div class="stats">
      ${stat('Victory', `#${e.victoryRank} · ${fmt.format(e.victoryScore)}`)}
      ${stat('Systems', fmt.format(e.systems))}
      ${stat('Colonies', fmt.format(e.colonies))}
      ${stat('Pops', fmt.format(e.pops))}
      ${stat('Empire size', fmt.format(e.empireSize))}
      ${stat('Military', fmt.format(e.militaryPower))}
      ${stat('Economy', fmt.format(e.economyPower))}
      ${stat('Tech', fmt.format(e.techPower))}
      ${stat('Fleet', fmt.format(e.fleetSize))}
    </div>
    <dl>
      ${row('Capital', capital)}
      ${row('Origin', escape(e.origin))}
      ${row('Ethics', list(e.ethics))}
      ${row('Civics', list(e.civics))}
      ${row('Federation', e.federation && escape(e.federation))}
      ${row('Overlord', e.overlord && escape(e.overlord))}
      ${row('Subjects', e.subjects?.length ? list(e.subjects) : undefined)}
      ${row('Ascension perks', list(e.ascensionPerks))}
    </dl>`
}
