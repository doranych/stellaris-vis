// Nomad ark icon: a hull pointing up with glowing rings, one per tier, in a 24×24 box centred on (12, 12).

const body = 'M9 11 L15 11 L15.6 17 L13.6 21 L10.4 21 L8.4 17 Z'

// The bow differs by kind, after the in-game models: two prongs, three spikes or a single spire.
const bows: Record<string, string> = {
  science: 'M9.4 11 L9 2.5 L11.2 4.5 L11.4 11 Z M14.6 11 L15 2.5 L12.8 4.5 L12.6 11 Z',
  military: 'M8.8 11 L8 4 L10.2 6 L10.4 11 Z M11 11 L12 1.5 L13 11 Z M15.2 11 L16 4 L13.8 6 L13.6 11 Z',
  civilian: 'M11.1 11 L11.3 1.5 L12.7 1.5 L12.9 11 Z M13.2 11 L14.6 6 L15.2 11 Z',
}

// Ring heights from the bow down; tier n lights the first n.
const ringY = [15.5, 13.2, 17.8]

export const arkPaths = (kind: string) => ({
  hull: new Path2D(`${bows[kind] ?? bows.civilian} ${body}`),
  rings: (tier: number) => {
    const p = new Path2D()
    for (const y of ringY.slice(0, Math.max(1, Math.min(3, tier)))) p.ellipse(12, y, 5.6, 1.5, 0, 0, 2 * Math.PI)
    return p
  },
})

// drawArk draws the icon centred on screen point (x, y), size CSS pixels tall; the context must be in CSS pixels.
export function drawArk(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, kind: string, tier: number, colour: string, bg: string) {
  const k = size / 24
  const { hull, rings } = arkPaths(kind)
  ctx.save()
  ctx.translate(x - 12 * k, y - 12 * k)
  ctx.scale(k, k)
  ctx.lineJoin = 'round'
  ctx.fillStyle = bg
  ctx.strokeStyle = colour
  ctx.lineWidth = 1.2
  ctx.fill(hull)
  ctx.stroke(hull)
  ctx.shadowColor = colour
  ctx.shadowBlur = 6 * k
  ctx.lineWidth = 1.6
  ctx.stroke(rings(tier))
  ctx.restore()
}
