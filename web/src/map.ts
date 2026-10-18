import { drawArk } from './ark'
import { themeVar } from './icons'
import type { Model } from './model'
import { fmt } from './table'
import { drawSystems, hasStation, iconsFromPx, indexSystems, namesFromPx, systemTooltip, type SystemIndex } from './systems'

// Colours of wormhole links by kind; plain wormholes use the neutral icon colour.
const linkColours: Record<string, string> = { strangeWormhole: '#b07cf0', shroudTunnel: '#b07cf0', starlitWormhole: '#e6c35a' }

const wayLineWidth = 5
const relayWidth = 2.5
const capitalRadius = 7 // CSS pixels
const labelScale = 3 // world units of font size per square root of systems
const minLabelPx = 9 // smaller labels are hidden until zoomed in
const layerMargin = 0.25 // share of the screen cached beyond each edge of the territory layer
const zoomIdleMs = 150 // the stretched territory layer is redrawn once the wheel rests this long
const hoverRadius = 10 // CSS pixels from a star that still count as pointing at it
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
const themeColour = themeVar

// Lightness bounds that keep flag colours such as black or pale yellow visible on each background.
const lightness = { dark: { min: 0.45, max: 1 }, light: { min: 0, max: 0.6 } }

// Fill opacity: normal, selected, dimmed.
const fillAlpha = { dark: [0.35, 0.55, 0.12], light: [0.22, 0.4, 0.07] }
// Share of that opacity in the middle of a territory; the edge glow adds edgeShare more at the border, fading over edgeDepth map units.
const innerShare = 0.4
const edgeShare = 0.94
const edgeDepth = 16
const bandPx = 3 // one band per this many screen pixels of depth, so steps stay invisible when zoomed in
const maxBands = 12 // each band is a clipped stroke of every border, and Firefox's GPU canvas stalls on more

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
  // Comma syntax, because SVG attributes in icon images do not accept the space-separated form everywhere.
  return `hsl(${((h * 60 + 360) % 360).toFixed(1)}, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%)`
}

export class MapView {
  private ctx: CanvasRenderingContext2D
  private model: Model | null = null
  private fills: Path2D[] = []
  private borders: Path2D[] = []
  private lanes = new Path2D()
  private relays = new Path2D()
  private wayLines = new Map<number, Path2D>() // by owner empire index, -1 for unpainted owners
  private wormholes = new Map<string, Path2D>() // links by kind
  private gateways: number[] = [] // systems with a gateway
  private hovered = -1 // system under the pointer
  private index: SystemIndex = { fleets: new Map(), arks: new Map(), stars: () => 1 }
  private arkHits: { x: number; y: number; owner: number }[] = [] // screen positions from the last draw
  private layer = { canvas: document.createElement('canvas'), key: '', scale: 1, tx: 0, ty: 0 }
  private modelVersion = 0
  private zooming = false
  private zoomTimer = 0
  private frame = 0
  private scale = 1
  private tx = 0
  private ty = 0
  selected: number | null = null
  spoilers = false

  constructor(
    private canvas: HTMLCanvasElement,
    private tooltip: HTMLElement,
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
    this.modelVersion++
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
    this.wormholes = new Map()
    for (const w of model.wormholeLinks ?? []) {
      let p = this.wormholes.get(w.kind)
      if (!p) this.wormholes.set(w.kind, (p = new Path2D()))
      line(p, w.a, w.b)
    }
    this.index = indexSystems(model)
    this.gateways = model.systems.flatMap((s, i) => (s.passages?.includes('gateway') ? [i] : []))
    this.hovered = -1
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

    // The territory layer is the slow part, so it is cached: panning moves it, zooming stretches it until the wheel rests.
    // ponytail: zooming out leaves blank edges for zoomIdleMs; render a wider margin if that bothers.
    const key = `${this.modelVersion}|${theme}|${sel}|${w}x${h}`
    const L = this.layer
    // A margin of a quarter screen on each side keeps short pans from uncovering empty edges.
    const mw = Math.round(w * layerMargin), mh = Math.round(h * layerMargin)
    const panned = Math.abs(this.tx - L.tx) * dpr >= mw || Math.abs(this.ty - L.ty) * dpr >= mh
    if (L.key !== key || (!this.zooming && (L.scale !== this.scale || panned))) {
      L.canvas.width = w + 2 * mw
      L.canvas.height = h + 2 * mh
      const lc = L.canvas.getContext('2d')
      if (lc) {
        lc.setTransform(k, 0, 0, k, dpr * this.tx + mw, dpr * this.ty + mh)
        // Butt caps leave notches at every border vertex, which show as light wedges.
        lc.lineCap = 'round'
        lc.lineJoin = 'round'
        // Like in the game, the fill is faint inside and brightens towards the border: bands of
        // the border path stroked inside the territory stack up near the edge.
        // ponytail: band count grows with zoom up to maxBands; a distance-field shader if it is ever too slow.
        const bands = Math.min(maxBands, Math.max(6, Math.round((edgeDepth * this.scale) / bandPx)))
        empires.forEach((_, i) => {
          const a = sel === null ? normal : sel === i ? chosen : dimmed
          lc.globalAlpha = a * innerShare
          lc.fillStyle = fill[i]
          lc.fill(this.fills[i])
          lc.save()
          lc.clip(this.fills[i])
          lc.strokeStyle = fill[i]
          lc.globalAlpha = (a * edgeShare) / bands
          for (let b = bands; b >= 1; b--) {
            lc.lineWidth = (2 * edgeDepth * b) / bands
            lc.stroke(this.borders[i])
          }
          lc.restore()
        })
      }
      Object.assign(L, { key, scale: this.scale, tx: this.tx, ty: this.ty })
    }
    const f = this.scale / L.scale
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(
      L.canvas,
      dpr * (this.tx - L.tx * f) - mw * f,
      dpr * (this.ty - L.ty * f) - mh * f,
      L.canvas.width * f,
      L.canvas.height * f,
    )
    ctx.setTransform(k, 0, 0, k, dpr * this.tx, dpr * this.ty)

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

    // Nomads own few systems but keep stations in many: ring those stars in the selected empire's colour.
    if (sel !== null) {
      ctx.globalAlpha = 1
      ctx.strokeStyle = border[sel]
      ctx.lineWidth = 2 * px
      for (const s of m.systems) {
        if (s.owner !== sel && hasStation(s, sel)) {
          ctx.beginPath()
          ctx.arc(s.x, s.y, 6 * px, 0, 2 * Math.PI)
          ctx.stroke()
        }
      }
    }

    // Wormhole links help on the whole-galaxy view; closer in they only show for the system under the pointer,
    // together with its gateway's links to every other gateway.
    const detailed = m.spacing * this.scale >= namesFromPx
    ctx.globalAlpha = 1
    ctx.lineWidth = 1.5 * px
    ctx.setLineDash([4 * px, 3 * px])
    const neutralLink = themeColour('--neutral-icon')
    if (!this.spoilers) {
      // Where passages lead counts as a spoiler, so links stay hidden unless asked for.
    } else if (!detailed) {
      for (const [kind, p] of this.wormholes) {
        ctx.strokeStyle = linkColours[kind] ?? neutralLink
        ctx.stroke(p)
      }
    } else if (this.hovered >= 0) {
      const h = m.systems[this.hovered]
      const link = (to: number, colour: string) => {
        ctx.strokeStyle = colour
        ctx.beginPath()
        ctx.moveTo(h.x, h.y)
        ctx.lineTo(m.systems[to].x, m.systems[to].y)
        ctx.stroke()
      }
      for (const w of m.wormholeLinks ?? []) {
        if (w.a === this.hovered) link(w.b, linkColours[w.kind] ?? neutralLink)
        if (w.b === this.hovered) link(w.a, linkColours[w.kind] ?? neutralLink)
      }
      if (h.passages?.includes('gateway')) {
        // Gateways all link to each other, so their many lines stay faint.
        ctx.globalAlpha = 0.45
        for (const g of this.gateways) if (g !== this.hovered) link(g, neutralLink)
        ctx.globalAlpha = 1
      }
    }
    ctx.setLineDash([])

    const bg = themeColour('--bg')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // The selected empire's name and then bigger names are placed first; a name that overlaps one already placed moves up or down, then shrinks, then hides.
    ctx.font = `600 100px system-ui, sans-serif`
    const wanted = empires
      .map((e, i) => {
        const l = e.label
        if (!l) return null
        const perUnit = ctx.measureText(e.name).width / 100
        // The name grows with the group's size but never spills far past the group's width.
        const size = Math.min(labelScale * Math.sqrt(l.systems) + 4, Math.max(1.4 * l.width, 40) / perUnit)
        return { e, i, l, size, perUnit }
      })
      .filter((w) => w !== null)
      .sort((a, b) => Number(b.i === sel) - Number(a.i === sel) || b.size - a.size)
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
    const textColour = themeColour('--text')
    // Close in, where system icons show, empire names would only cover them.
    const closeIn = m.spacing * this.scale >= iconsFromPx
    for (const { e, i, l, size: full, perUnit } of closeIn ? [] : wanted) {
      let spot: { size: number; y: number } | null = null
      search: for (const shrink of [1, 0.8, 0.65]) {
        const size = full * shrink
        if (size * this.scale < minLabelPx) break
        for (const dy of [0, -1.1, 1.1, -2.2, 2.2]) {
          const w = (size * perUnit) / 2, h = size * 0.6, y = l.y + dy * size
          const box = { x0: l.x - w, y0: y - h, x1: l.x + w, y1: y + h }
          if (!placed.some((p) => box.x0 < p.x1 && p.x0 < box.x1 && box.y0 < p.y1 && p.y0 < box.y1)) {
            placed.push(box)
            spot = { size, y }
            break search
          }
        }
      }
      if (!spot) continue
      ctx.font = `600 ${spot.size}px system-ui, sans-serif`
      // Empire names step back once system names show, so they do not cover them.
      ctx.globalAlpha = (sel === null || sel === i ? 1 : 0.35) * (detailed ? 0.4 : 1)
      ctx.strokeStyle = bg
      ctx.lineWidth = spot.size * 0.2
      ctx.strokeText(e.name, l.x, spot.y)
      ctx.fillStyle = textColour
      ctx.fillText(e.name, l.x, spot.y)
    }

    // System names, icons and capital arks keep a fixed screen size, so they are drawn in CSS pixels.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
    drawSystems({
      ctx,
      m,
      index: this.index,
      sel,
      border,
      unowned,
      scale: this.scale,
      toScreen: (s) => [s.x * this.scale + this.tx, s.y * this.scale + this.ty],
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      onLoad: () => this.requestDraw(),
    })
    this.arkHits = []
    for (const a of m.arks ?? []) {
      if (!a.capital) continue
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

  // requestDraw coalesces bursts of wheel and pointer events into one redraw per frame.
  private requestDraw() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.draw()
    })
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
      this.zooming = true
      clearTimeout(this.zoomTimer)
      this.zoomTimer = setTimeout(() => {
        this.zooming = false
        this.requestDraw()
      }, zoomIdleMs)
      this.requestDraw()
    }, { passive: false })

    c.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: false }
      c.setPointerCapture(e.pointerId)
    })
    c.addEventListener('pointerleave', () => {
      this.tooltip.hidden = true
      if (this.hovered >= 0) {
        this.hovered = -1
        this.requestDraw()
      }
    })
    c.addEventListener('pointermove', (e) => {
      if (!drag) {
        this.hover(e.offsetX, e.offsetY)
        return
      }
      this.tooltip.hidden = true
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 4) return
      drag.moved = true
      this.tx += dx
      this.ty += dy
      drag.x = e.clientX
      drag.y = e.clientY
      this.requestDraw()
    })
    c.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) this.onPick(this.pick(e.offsetX, e.offsetY))
      drag = null
    })
  }

  // hover shows the system nearest to the pointer, or else the empire under it.
  private hover(sx: number, sy: number) {
    const m = this.model
    if (!m) return
    const empires = m.empires ?? []
    let best = hoverRadius, sys = -1
    m.systems.forEach((s, i) => {
      const d = Math.hypot(s.x * this.scale + this.tx - sx, s.y * this.scale + this.ty - sy)
      if (d < best) {
        best = d
        sys = i
      }
    })
    if (sys !== this.hovered) {
      this.hovered = sys
      this.requestDraw()
    }
    const lines: string[] = []
    if (sys >= 0) {
      const s = m.systems[sys]
      lines.push(s.name, s.owner >= 0 ? empires[s.owner].name : 'Unclaimed')
      const capitalOf = empires.find((e) => e.capitalSystem === sys)
      if (capitalOf) lines.push(`Capital of ${capitalOf.name}`)
      lines.push(...systemTooltip(s, sys, m, this.index))
    } else {
      const i = this.pick(sx, sy)
      if (i === null) {
        this.tooltip.hidden = true
        return
      }
      const e = empires[i]
      lines.push(e.name, `${fmt.format(e.systems)} systems`)
    }
    const t = this.tooltip
    t.replaceChildren()
    const title = document.createElement('b')
    title.textContent = lines[0]
    t.append(title, lines.slice(1).join('\n'))
    t.hidden = false
    // Keep the tooltip inside the map, flipping it to the left or above near the edges.
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    const x = sx + 14 + t.offsetWidth > w ? sx - 14 - t.offsetWidth : sx + 14
    const y = sy + 14 + t.offsetHeight > h ? sy - 14 - t.offsetHeight : sy + 14
    t.style.left = `${x}px`
    t.style.top = `${y}px`
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
