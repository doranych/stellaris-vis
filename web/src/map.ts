import { drawArk } from './ark'
import type { Model } from './model'

const wayLineWidth = 5
const relayWidth = 2.5
const capitalRadius = 7 // CSS pixels
const labelScale = 3 // world units of font size per square root of systems
const minLabelPx = 9 // smaller labels are hidden until zoomed in
const arkSize = 26 // CSS pixels
const arkLift = 16 // above the star, which stays visible

// star is a five-pointed outline, like ✩, around (x, y).
function star(x: number, y: number, r: number): Path2D {
  const p = new Path2D()
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5
    const rr = k % 2 === 0 ? r : r * 0.45
    if (k === 0) p.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a))
    else p.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a))
  }
  p.closePath()
  return p
}

// Map colours that follow the page theme, read from CSS custom properties.
const themeColour = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

// Lightness bounds that keep flag colours such as black or pale yellow visible on each background.
const lightness = { dark: { min: 0.45, max: 1 }, light: { min: 0, max: 0.6 } }

// Fill opacity: normal, selected, dimmed.
const fillAlpha = { dark: [0.35, 0.55, 0.12], light: [0.22, 0.4, 0.07] }

// readable clamps the lightness of a #rrggbb colour for the theme and returns it as hsl().
function readable(hex: string, theme: 'dark' | 'light'): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  l = Math.min(lightness[theme].max, Math.max(lightness[theme].min, l))
  return `hsl(${(h * 60 + 360) % 360} ${s * 100}% ${l * 100}%)`
}

export class MapView {
  private ctx: CanvasRenderingContext2D
  private model: Model | null = null
  private fills: Path2D[] = []
  private borders: Path2D[] = []
  private lanes = new Path2D()
  private relays = new Path2D()
  private wayLines = new Map<number, Path2D>() // by owner empire index, -1 for unpainted owners
  private arkHits: { x: number; y: number; owner: number }[] = [] // screen positions from the last draw
  private scale = 1
  private tx = 0
  private ty = 0
  selected: number | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private onPick: (empire: number | null) => void,
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2D is not supported')
    this.ctx = ctx
    new ResizeObserver(() => this.draw()).observe(canvas)
    this.listen()
  }

  load(model: Model) {
    this.model = model
    this.selected = null
    this.fills = []
    this.borders = []
    for (const e of model.empires ?? []) {
      const fill = new Path2D()
      for (const c of e.cells ?? []) {
        fill.moveTo(c[0], c[1])
        for (let i = 2; i < c.length; i += 2) fill.lineTo(c[i], c[i + 1])
        fill.closePath()
      }
      this.fills.push(fill)
      const border = new Path2D()
      const b = e.borders ?? []
      for (let i = 0; i < b.length; i += 4) {
        border.moveTo(b[i], b[i + 1])
        border.lineTo(b[i + 2], b[i + 3])
      }
      this.borders.push(border)
    }
    const line = (p: Path2D, a: number, b: number) => {
      p.moveTo(model.systems[a].x, model.systems[a].y)
      p.lineTo(model.systems[b].x, model.systems[b].y)
    }
    this.lanes = new Path2D()
    for (const [a, b] of model.lanes ?? []) line(this.lanes, a, b)
    this.relays = new Path2D()
    for (const [a, b] of model.relays ?? []) line(this.relays, a, b)
    this.wayLines = new Map()
    for (const w of model.wayLines ?? []) {
      let p = this.wayLines.get(w.owner)
      if (!p) this.wayLines.set(w.owner, (p = new Path2D()))
      line(p, w.a, w.b)
    }
    this.fit()
  }

  fit() {
    if (!this.model) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const s of this.model.systems) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x)
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y)
    }
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    // Margin leaves room for territory, which reaches past the outermost stars.
    this.scale = 0.85 * Math.min(w / (maxX - minX || 1), h / (maxY - minY || 1))
    this.tx = w / 2 - this.scale * (minX + maxX) / 2
    this.ty = h / 2 - this.scale * (minY + maxY) / 2
    this.draw()
  }

  draw() {
    const { canvas, ctx } = this
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const m = this.model
    if (!m) return

    const k = dpr * this.scale
    ctx.setTransform(k, 0, 0, k, dpr * this.tx, dpr * this.ty)
    const px = 1 / this.scale // one CSS pixel in world units
    const empires = m.empires ?? []
    const sel = this.selected
    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    const fill = empires.map((e) => readable(e.fillColour, theme))
    const border = empires.map((e) => readable(e.borderColour, theme))
    const [normal, chosen, dimmed] = fillAlpha[theme]

    empires.forEach((_, i) => {
      ctx.globalAlpha = sel === null ? normal : sel === i ? chosen : dimmed
      ctx.fillStyle = fill[i]
      ctx.fill(this.fills[i])
    })
    ctx.globalAlpha = 1

    ctx.lineCap = 'round'
    ctx.strokeStyle = themeColour('--lane')
    ctx.lineWidth = px
    ctx.stroke(this.lanes)
    ctx.lineWidth = relayWidth * px
    ctx.stroke(this.relays)

    empires.forEach((_, i) => {
      if (i === sel) return
      ctx.globalAlpha = sel === null ? 1 : 0.35
      ctx.strokeStyle = border[i]
      ctx.lineWidth = 1.5 * px
      ctx.stroke(this.borders[i])
    })
    if (sel !== null) {
      ctx.globalAlpha = 1
      ctx.strokeStyle = border[sel]
      ctx.lineWidth = 3 * px
      ctx.stroke(this.borders[sel])
    }

    for (const [owner, p] of this.wayLines) {
      const colour = owner >= 0 ? border[owner] : themeColour('--lane')
      if (owner === sel) {
        ctx.globalAlpha = 0.45
        ctx.strokeStyle = themeColour('--glow')
        ctx.lineWidth = (wayLineWidth + 6) * px
        ctx.stroke(p)
      }
      ctx.globalAlpha = sel === null || owner === sel ? 1 : 0.35
      ctx.strokeStyle = colour
      ctx.lineWidth = wayLineWidth * px
      ctx.stroke(p)
    }
    ctx.globalAlpha = 1

    const r = 1.5 * px
    const unowned = themeColour('--star')
    for (const s of m.systems) {
      ctx.fillStyle = s.owner >= 0 ? border[s.owner] : unowned
      ctx.fillRect(s.x - r, s.y - r, 2 * r, 2 * r)
    }

    ctx.lineJoin = 'round'
    empires.forEach((e, i) => {
      if (e.capitalSystem < 0) return
      const s = m.systems[e.capitalSystem]
      ctx.globalAlpha = sel === null || sel === i ? 1 : 0.35
      ctx.strokeStyle = border[i]
      ctx.lineWidth = 1.5 * px
      ctx.stroke(star(s.x, s.y, capitalRadius * px))
    })

    const bg = themeColour('--bg')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    empires.forEach((e, i) => {
      const l = e.label
      if (!l) return
      // The name grows with the group's size but never spills far past the group's width.
      ctx.font = `600 100px system-ui, sans-serif`
      const perUnit = ctx.measureText(e.name).width / 100
      const size = Math.min(labelScale * Math.sqrt(l.systems) + 4, Math.max(1.4 * l.width, 40) / perUnit)
      if (size * this.scale < minLabelPx) return
      ctx.font = `600 ${size}px system-ui, sans-serif`
      ctx.globalAlpha = sel === null || sel === i ? 1 : 0.35
      ctx.strokeStyle = bg
      ctx.lineWidth = size * 0.2
      ctx.strokeText(e.name, l.x, l.y)
      ctx.fillStyle = themeColour('--text')
      ctx.fillText(e.name, l.x, l.y)
    })

    // Capital arks keep a fixed screen size, so they are drawn in CSS pixels, above the star of their system.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.arkHits = []
    for (const a of m.arks ?? []) {
      const s = m.systems[a.system]
      const x = s.x * this.scale + this.tx
      const y = s.y * this.scale + this.ty - arkLift
      const colour = a.owner >= 0 ? border[a.owner] : unowned
      ctx.globalAlpha = sel === null || sel === a.owner ? 1 : 0.35
      drawArk(ctx, x, y, arkSize, a.kind, a.tier, colour, bg)
      if (a.owner >= 0) this.arkHits.push({ x, y, owner: a.owner })
    }
    ctx.globalAlpha = 1
    // pick() relies on the world transform.
    ctx.setTransform(k, 0, 0, k, dpr * this.tx, dpr * this.ty)
  }

  private listen() {
    const c = this.canvas
    let drag: { x: number; y: number; moved: boolean } | null = null

    c.addEventListener('wheel', (e) => {
      e.preventDefault()
      const f = Math.exp(-e.deltaY * 0.0015)
      this.tx = e.offsetX - (e.offsetX - this.tx) * f
      this.ty = e.offsetY - (e.offsetY - this.ty) * f
      this.scale *= f
      this.draw()
    }, { passive: false })

    c.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: false }
      c.setPointerCapture(e.pointerId)
    })
    c.addEventListener('pointermove', (e) => {
      if (!drag) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 4) return
      drag.moved = true
      this.tx += dx
      this.ty += dy
      drag.x = e.clientX
      drag.y = e.clientY
      this.draw()
    })
    c.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) this.onPick(this.pick(e.offsetX, e.offsetY))
      drag = null
    })
  }

  // Empire whose way line or territory is under a screen point; relies on draw() leaving the world transform set.
  private pick(sx: number, sy: number): number | null {
    const dpr = window.devicePixelRatio || 1
    const ark = this.arkHits.find((a) => Math.hypot(a.x - sx, a.y - sy) < arkSize / 2)
    if (ark) return ark.owner
    const x = sx * dpr, y = sy * dpr
    this.ctx.lineWidth = (wayLineWidth + 4) / this.scale
    for (const [owner, p] of this.wayLines) {
      if (owner >= 0 && this.ctx.isPointInStroke(p, x, y)) return owner
    }
    const i = this.fills.findIndex((f) => this.ctx.isPointInPath(f, x, y))
    return i >= 0 ? i : null
  }
}
