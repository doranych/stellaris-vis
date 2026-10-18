import type { Empire } from './model'

type Column = { title: string; value: (e: Empire) => string | number; cell?: (e: Empire) => string }

const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const columns: Column[] = [
  {
    title: '',
    value: (e) => e.borderColour,
    cell: (e) => `<span class="swatch" style="background:${e.borderColour}"></span><span class="swatch" style="background:${e.fillColour}"></span>`,
  },
  { title: 'Empire', value: (e) => e.name, cell: (e) => escape(e.name) + (e.isPlayer ? ' ★' : '') },
  { title: 'Type', value: (e) => e.type },
  { title: 'Victory', value: (e) => e.victoryScore },
  { title: 'Systems', value: (e) => e.systems },
  { title: 'Military', value: (e) => e.militaryPower },
  { title: 'Economy', value: (e) => e.economyPower },
  { title: 'Tech', value: (e) => e.techPower },
  { title: 'Fleet', value: (e) => e.fleetSize },
]

export class EmpireTable {
  private empires: Empire[] = []
  private sortBy = columns.findIndex((c) => c.title === 'Victory')
  private desc = true
  selected: number | null = null

  constructor(
    private root: HTMLElement,
    private onPick: (empire: number | null) => void,
  ) {
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement
      const th = el.closest('th')
      if (th) {
        const col = Number(th.dataset.col)
        this.desc = col === this.sortBy ? !this.desc : true
        this.sortBy = col
        this.render()
        return
      }
      const tr = el.closest<HTMLElement>('tbody tr')
      if (tr) {
        const i = Number(tr.dataset.empire)
        this.onPick(i === this.selected ? null : i)
      }
    })
  }

  load(empires: Empire[]) {
    this.empires = empires
    this.selected = null
    this.render()
  }

  render() {
    const col = columns[this.sortBy]
    const rows = this.empires.map((e, i) => ({ e, i }))
    rows.sort((a, b) => {
      const x = col.value(a.e), y = col.value(b.e)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return this.desc ? -c : c
    })
    const head = columns
      .map((c, i) => `<th data-col="${i}">${c.title}${i === this.sortBy ? (this.desc ? ' ▼' : ' ▲') : ''}</th>`)
      .join('')
    const body = rows
      .map(({ e, i }) => {
        const cells = columns.map((c) => {
          const v = c.value(e)
          return `<td>${c.cell ? c.cell(e) : typeof v === 'number' ? fmt.format(v) : escape(v)}</td>`
        })
        return `<tr data-empire="${i}"${i === this.selected ? ' class="selected"' : ''}>${cells.join('')}</tr>`
      })
      .join('')
    this.root.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  }
}
