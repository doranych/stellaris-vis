import { iconSvg, otherFleets, ownFleets, themeVar, type IconName } from './icons'
import type { Ark, Fleets, Model, System } from './model'
import { fmt } from './table'

// hasStation tells whether the empire has any starbase in the system, such as a nomad's waystation.
export const hasStation = (s: System, e: number) => s.owner === e || (s.stationOwners ?? []).includes(e)

// Detail appears by on-screen star spacing, so it behaves the same on any galaxy and at any zoom.
export const namesFromPx = 40
export const iconsFromPx = 60
const iconPx = 18
const iconGap = 3
const groupGap = 6 // between the owner's icons and the neutral passages
const rowPad = 3

const stationIcons: Record<string, IconName> = {
  outpost: 'outpost',
  starport: 'starport',
  starhold: 'starhold',
  starfortress: 'starfortress',
  citadel: 'citadel',
}
const stationRank: Record<string, number> = { outpost: 1, starport: 2, starhold: 3, starfortress: 4, citadel: 5 }

type Box = { x0: number; y0: number; x1: number; y1: number }
const overlaps = (b: Box, placed: Box[]) => placed.some((p) => b.x0 < p.x1 && p.x0 < b.x1 && b.y0 < p.y1 && p.y0 < b.y1)

// One drawn icon; icons drawn on top of each other share a slot.
type Slot = { layers: { name: IconName; level?: number }[]; colour: string; neutral: boolean; count?: number; stars?: number }

// Fleet power stars sit to the right of the icon in rows of three, filled from the bottom, like in the game.
const starPx = 5
const starsPerRow = 3

function drawStars(ctx: CanvasRenderingContext2D, n: number, x: number, bottom: number, colour: string) {
  ctx.fillStyle = colour
  for (let k = 0; k < n; k++) {
    const row = Math.floor(k / starsPerRow)
    const inRow = Math.min(starsPerRow, n - row * starsPerRow)
    const col = k % starsPerRow
    // Short rows are centred over the full ones.
    const cx = x + (col + (starsPerRow - inRow) / 2) * starPx + starPx / 2
    const cy = bottom - row * starPx - starPx / 2
    ctx.beginPath()
    for (let p = 0; p < 10; p++) {
      const a = -Math.PI / 2 + (p * Math.PI) / 5
      const r = p % 2 === 0 ? starPx / 2 + 0.4 : starPx / 5
      ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
    }
    ctx.fill()
  }
}

// Icons are rasterised once into small canvases: drawing an SVG image directly re-renders it on every frame,
// which Firefox does slowly.
const images = new Map<string, HTMLCanvasElement | null>()

const widths = new Map<string, number>()

// textWidth caches measureText by the context's current font, since names are measured on every frame.
function textWidth(ctx: CanvasRenderingContext2D, s: string): number {
  const key = `${ctx.font}|${s}`
  let w = widths.get(key)
  if (w === undefined) {
    w = ctx.measureText(s).width
    widths.set(key, w)
  }
  return w
}

// image returns the icon as a bitmap, starting the load on first use; onLoad redraws once it is ready.
function image(name: IconName, colour: string, level: number | undefined, onLoad: () => void): HTMLCanvasElement | null {
  const dpr = window.devicePixelRatio || 1
  const key = `${document.documentElement.dataset.theme}|${name}|${colour}|${level}|${dpr}`
  if (images.has(key)) return images.get(key) ?? null
  images.set(key, null)
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = c.height = Math.ceil(iconPx * dpr)
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
    images.set(key, c)
    onLoad()
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(iconSvg(name, colour, iconPx * 2, level))
  return null
}

export const maxStars = 7

// stars maps military power to 1–7 stars.
export type StarScale = (power: number) => number

export type SystemIndex = { fleets: Map<number, Fleets[]>; arks: Map<number, Ark[]>; stars: StarScale }

export function indexSystems(m: Model): SystemIndex {
  const fleets = new Map<number, Fleets[]>()
  for (const f of m.fleets ?? []) fleets.set(f.system, [...(fleets.get(f.system) ?? []), f])
  const arks = new Map<number, Ark[]>()
  for (const a of m.arks ?? []) arks.set(a.system, [...(arks.get(a.system) ?? []), a])
  return { fleets, arks, stars: starScale(m) }
}

// starScale splits the save's own range of per-system military power, weakest to strongest, into equal steps on a
// log scale, so the stars adapt to early and late game alike.
function starScale(m: Model): StarScale {
  const powers = (m.fleets ?? []).filter((f) => f.military && f.power > 0).map((f) => Math.log(f.power))
  if (powers.length === 0) return () => 1
  const lo = Math.min(...powers), hi = Math.max(...powers)
  return (power) => {
    if (power <= 0 || hi === lo) return 1
    return Math.max(1, Math.min(maxStars, 1 + Math.floor((maxStars * (Math.log(power) - lo)) / (hi - lo))))
  }
}

type DrawArgs = {
  ctx: CanvasRenderingContext2D // in CSS pixel space
  m: Model
  index: SystemIndex
  sel: number | null
  border: string[] // readable border colours per empire
  unowned: string
  scale: number // CSS pixels per map unit
  toScreen: (s: System) => [number, number]
  width: number
  height: number
  onLoad: () => void
}

// drawSystems draws system names and, closer in, the icon row above each star.
// Without a selection a system shows its main station and colonies; the selected empire's systems show everything,
// and its arks and fleets show wherever they are.
export function drawSystems({ ctx, m, index, sel, border, unowned, scale, toScreen, width, height, onLoad }: DrawArgs) {
  const empires = m.empires ?? []
  const spacingPx = m.spacing * scale
  if (spacingPx < namesFromPx) return
  const withIcons = spacingPx >= iconsFromPx
  const text = themeVar('--text')
  const bg = themeVar('--bg')
  const panel = themeVar('--panel')
  const line = themeVar('--line')
  const capitals = new Set(empires.map((e) => e.capitalSystem))

  const visible = m.systems
    .map((s, i) => ({ s, i, at: toScreen(s) }))
    .filter(({ at: [x, y] }) => x > -100 && x < width + 100 && y > -100 && y < height + 100)
  const priority = (s: System, i: number) =>
    (sel !== null && hasStation(s, sel) ? 100 : 0) + (capitals.has(i) ? 10 : 0) + (stationRank[s.station ?? ''] ?? 0)
  visible.sort((a, b) => priority(b.s, b.i) - priority(a.s, a.i))

  const placed: Box[] = []
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const { s, i, at } of visible) {
    const [x, y] = at
    const mine = sel !== null && hasStation(s, sel)
    const dim = sel !== null && !mine

    ctx.font = `${mine ? 600 : 400} 11px system-ui, sans-serif`
    const nameW = textWidth(ctx, s.name)
    const nameBox = { x0: x - nameW / 2 - 2, y0: y + 5, x1: x + nameW / 2 + 2, y1: y + 19 }
    if (overlaps(nameBox, placed)) continue
    placed.push(nameBox)
    ctx.globalAlpha = dim ? 0.45 : 1
    ctx.strokeStyle = bg
    ctx.lineWidth = 3
    ctx.strokeText(s.name, x, y + 12)
    ctx.fillStyle = text
    ctx.fillText(s.name, x, y + 12)
    ctx.globalAlpha = 1
    if (!withIcons) continue

    const slots = systemSlots(s, i, sel, index, empires, border, unowned)
    if (slots.length === 0) continue
    ctx.font = '700 10px system-ui, sans-serif'
    // Each slot's left offset in the row; neutral icons start after a small gap.
    const offsets: number[] = []
    let rowW = 0
    slots.forEach((sl, k) => {
      if (k > 0) rowW += iconGap
      if (k > 0 && sl.neutral && !slots[k - 1].neutral) rowW += groupGap
      offsets.push(rowW)
      rowW += iconPx + (sl.count !== undefined ? textWidth(ctx, String(sl.count)) + 1 : 0)
      if (sl.stars) rowW += Math.min(sl.stars, starsPerRow) * starPx + 1
    })
    // The capital ark's large icon already sits right above the star, so the row goes above it.
    const lift = index.arks.get(i)?.some((a) => a.capital) ? 30 : 0
    const top = y - 8 - iconPx - lift
    const rowBox = { x0: x - rowW / 2 - rowPad, y0: top - rowPad, x1: x + rowW / 2 + rowPad, y1: top + iconPx + rowPad }
    if (overlaps(rowBox, placed)) continue
    placed.push(rowBox)

    // One backing for the whole row keeps icons readable over territory and lanes.
    ctx.globalAlpha = dim ? 0.6 : 0.85
    ctx.fillStyle = panel
    ctx.beginPath()
    ctx.roundRect(rowBox.x0, rowBox.y0, rowBox.x1 - rowBox.x0, rowBox.y1 - rowBox.y0, 5)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = line
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.textAlign = 'left'
    for (const [k, sl] of slots.entries()) {
      let cx = x - rowW / 2 + offsets[k]
      for (const layer of sl.layers) {
        const img = image(layer.name, sl.colour, layer.level, onLoad)
        if (img) ctx.drawImage(img, cx, top, iconPx, iconPx)
      }
      cx += iconPx
      if (sl.count !== undefined) {
        ctx.fillStyle = text
        ctx.fillText(String(sl.count), cx + 1, top + iconPx - 3)
      }
      if (sl.stars) drawStars(ctx, sl.stars, cx + 1, top + iconPx, sl.colour)
    }
    ctx.textAlign = 'center'
  }
}

function systemSlots(
  s: System,
  i: number,
  sel: number | null,
  index: SystemIndex,
  empires: NonNullable<Model['empires']>,
  border: string[],
  unowned: string,
): Slot[] {
  const colour = s.owner >= 0 ? border[s.owner] : unowned
  const owned = (layers: Slot['layers'], count?: number): Slot => ({ layers, colour, neutral: false, count })
  const station = s.station && stationIcons[s.station]
  const colonies = s.colonies ?? 0
  const isCapital = s.owner >= 0 && empires[s.owner].capitalSystem === i
  const colony = (): Slot | null => {
    if (!colonies && !isCapital) return null
    const layers: Slot['layers'] = [{ name: s.orbitalRing ? 'orbitalRing' : 'colony' }]
    if (isCapital) layers.push({ name: 'capital' })
    return owned(layers, colonies > 1 ? colonies : undefined)
  }

  const enclave: Slot | null = s.enclave ? { layers: [{ name: 'enclave' }], colour: '', neutral: true } : null
  if (sel === null) {
    return [station ? owned([{ name: station }]) : null, colony(), enclave].filter((sl) => sl !== null)
  }

  const slots: (Slot | null)[] = []
  const selColour = border[sel]
  if (s.owner === sel) {
    slots.push(station ? owned([{ name: station }]) : null)
    if (s.deepSpaceCitadel) slots.push(owned([{ name: 'deepSpaceCitadel' }]))
    if (s.waystation) slots.push(owned([{ name: 'waystation', level: s.waystation }]))
    slots.push(colony())
    if (s.megastructures?.length) slots.push(owned([{ name: 'megastructure' }]))
  } else if (hasStation(s, sel)) {
    // Stations in someone else's system, such as a nomad's waystation, in the selected empire's colour.
    if (s.waystation) slots.push({ layers: [{ name: 'waystation', level: s.waystation }], colour: selColour, neutral: false })
    if (s.deepSpaceCitadel) slots.push({ layers: [{ name: 'deepSpaceCitadel' }], colour: selColour, neutral: false })
  }
  // The selected empire's arks and ships show in any system, in its colour.
  for (const a of index.arks.get(i) ?? []) {
    if (a.owner === sel && !a.capital) slots.push({ layers: [{ name: 'ark' }], colour: selColour, neutral: false })
  }
  // Fleets by side: the selected empire's in green; others in orange, added up, where the selected empire is present.
  // Military fleets show their summed power as stars; civilian ones count fleets, since a transport fleet carries dozens of armies.
  const here = index.fleets.get(i) ?? []
  const own = here.filter((f) => f.owner === sel)
  const present = hasStation(s, sel) || own.length > 0
  const others = present ? here.filter((f) => f.owner !== sel) : []
  for (const [list, colour] of [
    [own, ownFleets],
    [others, otherFleets],
  ] as const) {
    const military = list.filter((f) => f.military)
    const power = military.reduce((n, f) => n + f.power, 0)
    const civilian = list.filter((f) => !f.military).reduce((n, f) => n + f.fleets, 0)
    if (military.length) slots.push({ layers: [{ name: 'militaryFleet' }], colour, neutral: false, stars: index.stars(power) })
    if (civilian) slots.push({ layers: [{ name: 'civilianShips' }], colour, neutral: false, count: civilian })
  }
  if (hasStation(s, sel)) {
    for (const p of s.passages ?? []) slots.push({ layers: [{ name: p as IconName }], colour: '', neutral: true })
  }
  slots.push(enclave)
  return slots.filter((sl) => sl !== null)
}

// systemTooltip lists what a system holds, for the hover tooltip. Civilian ships are left out on purpose.
export function systemTooltip(s: System, i: number, m: Model, index: SystemIndex): string[] {
  const empires = m.empires ?? []
  const lines: string[] = []
  const station = s.station && stationIcons[s.station] ? s.station.replace('starfortress', 'star fortress') : ''
  const extras = [station, s.deepSpaceCitadel && 'deep space citadel', s.orbitalRing && 'orbital ring', s.waystation && `waystation ${s.waystation}`]
    .filter(Boolean)
    .join(', ')
  if (extras) lines.push(extras[0].toUpperCase() + extras.slice(1))
  if (s.colonies) lines.push(`${s.colonies} ${s.colonies === 1 ? 'colony' : 'colonies'}`)
  if (s.enclave) lines.push('Enclave')
  if (s.megastructures?.length) lines.push(s.megastructures.join(', '))
  const passageNames: Record<string, string> = {
    gateway: 'Gateway',
    hyperRelay: 'Hyper relay',
    lGate: 'L-gate',
    wormhole: 'Wormhole',
    strangeWormhole: 'Strange wormhole',
    starlitWormhole: 'Starlit wormhole',
    shroudTunnel: 'Shroud tunnel',
  }
  if (s.passages?.length) lines.push(s.passages.map((p) => passageNames[p] ?? p).join(', '))
  for (const a of index.arks.get(i) ?? []) {
    if (a.owner >= 0) lines.push(`${a.capital ? 'Capital ark' : 'Ark'} of ${empires[a.owner].name}`)
  }
  for (const f of index.fleets.get(i) ?? []) {
    if (!f.military) continue
    lines.push(`${empires[f.owner].name}: power ${fmt.format(f.power)}`)
    for (const one of f.list ?? []) lines.push(`· ${one.name}: ${fmt.format(one.power)}`)
  }
  return lines
}
