// Map icons drawn for this project (not taken from the game), as SVG in a 24×24 box.
// {C} is the icon colour and {B} the background, filled in by iconSvg.

export type IconName = keyof typeof icons

const themeVars = new Map<string, string>()

// themeVar reads a CSS custom property of the current theme; values are cached since the map asks every frame.
export function themeVar(name: string): string {
  const key = `${document.documentElement.dataset.theme}|${name}`
  let v = themeVars.get(key)
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    themeVars.set(key, v)
  }
  return v
}

const hexagon = 'M12 4 L19 8 L19 16 L12 20 L5 16 L5 8Z'
const planet = '<circle cx="12" cy="13" r="5" fill="{C}"/>'
const ring = '<ellipse cx="12" cy="13" rx="9.5" ry="3" fill="none" stroke="{C}" stroke-width="1.5" transform="rotate(-20 12 13)"/>'
const capitalStar =
  '<path d="M19 0.5 L20.2 3.3 L23.2 3.5 L20.9 5.4 L21.6 8.3 L19 6.7 L16.4 8.3 L17.1 5.4 L14.8 3.5 L17.8 3.3Z" fill="{B}" stroke="{C}" stroke-width="1"/>'
const shipHull = 'M12 4 L19 19 L12 15 L5 19Z'

// spiral returns an Archimedean spiral path from the centre outwards; wave adds a ripple along it.
function spiral(wave = 0): string {
  const pts: string[] = []
  for (let t = 0; t <= 3.6 * Math.PI; t += 0.12) {
    const r = 0.75 * t + wave * Math.sin(7 * t)
    pts.push(`${(12 + r * Math.cos(t)).toFixed(2)} ${(12 + r * Math.sin(t)).toFixed(2)}`)
  }
  return `M${pts.join(' L')}`
}

// Fleets are coloured by side rather than by empire: the selected empire's own and everyone else's.
export const ownFleets = '#4cc36a'
export const otherFleets = '#f08c2e'

const purple = '#b07cf0'
const gold = '#e6c35a'

export const icons = {
  outpost: { label: 'Outpost', neutral: false, svg: '<path d="M12 6 L18 12 L12 18 L6 12Z" fill="{B}" stroke="{C}" stroke-width="1.6"/>' },
  starport: { label: 'Starport', neutral: false, svg: `<path d="${hexagon}" fill="{B}" stroke="{C}" stroke-width="1.6"/>` },
  starhold: {
    label: 'Starhold',
    neutral: false,
    svg: `<path d="${hexagon}" fill="{B}" stroke="{C}" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2" fill="{C}"/>`,
  },
  starfortress: {
    label: 'Star fortress',
    neutral: false,
    svg: `<path d="${hexagon}" fill="{B}" stroke="{C}" stroke-width="1.6"/><path d="M12 8.5 L15 10.2 L15 13.8 L12 15.5 L9 13.8 L9 10.2Z" fill="{C}"/>`,
  },
  citadel: {
    label: 'Citadel',
    neutral: false,
    svg: `<path d="M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5Z" fill="{C}" stroke="{C}" stroke-width="1.6"/><path d="M12 8 L15.5 10 L15.5 14 L12 16 L8.5 14 L8.5 10Z" fill="{B}"/>`,
  },
  deepSpaceCitadel: {
    label: 'Deep space citadel',
    neutral: false,
    svg: '<path d="M12 4 L18 6.5 L18 12 C18 16 15 19 12 20 C9 19 6 16 6 12 L6 6.5Z" fill="{B}" stroke="{C}" stroke-width="1.6"/>',
  },
  waystation: {
    label: 'Waystation, dots for level 1–3',
    neutral: false,
    svg: '<rect x="6.5" y="4.5" width="11" height="11" rx="2" fill="{B}" stroke="{C}" stroke-width="1.6" transform="rotate(45 12 10)"/><circle cx="12" cy="10" r="2" fill="{C}"/>{DOTS}',
  },
  colony: { label: 'Colony, number when several', neutral: false, svg: planet },
  capital: { label: 'Capital colony', neutral: false, svg: planet + capitalStar },
  orbitalRing: { label: 'Colony with orbital ring', neutral: false, svg: planet + ring },
  megastructure: {
    label: 'Megastructures, one icon for any number (incl. quantum catapult)',
    neutral: false,
    svg: '<circle cx="12" cy="12" r="3" fill="{C}"/><path d="M12 3.5 A8.5 8.5 0 0 1 20.5 12 M12 20.5 A8.5 8.5 0 0 1 3.5 12" fill="none" stroke="{C}" stroke-width="2.2"/><path d="M20.5 12 A8.5 8.5 0 0 1 12 20.5 M3.5 12 A8.5 8.5 0 0 1 12 3.5" fill="none" stroke="{C}" stroke-width="2.2" stroke-dasharray="2.5 1.8"/>',
  },
  ark: {
    label: 'Ark, rings for tier 1–3',
    neutral: false,
    svg: '<path d="M9.4 11 L9 2.5 L11.2 4.5 L11.4 11 Z M14.6 11 L15 2.5 L12.8 4.5 L12.6 11 Z M9 11 L15 11 L15.6 17 L13.6 21 L10.4 21 L8.4 17 Z" fill="{B}" stroke="{C}" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="12" cy="15.5" rx="5.6" ry="1.5" fill="none" stroke="{C}" stroke-width="1.6"/><ellipse cx="12" cy="13.2" rx="5.6" ry="1.5" fill="none" stroke="{C}" stroke-width="1.6"/>',
  },
  militaryFleet: {
    label: 'Military fleets, 1–7 stars for total power',
    neutral: false,
    svg: `<path d="${shipHull}" fill="{C}" stroke="{C}" stroke-width="1.4" stroke-linejoin="round"/>`,
  },
  civilianShips: {
    label: 'Civilian fleets, number of fleets',
    neutral: false,
    svg: `<path d="${shipHull}" fill="{B}" stroke="{C}" stroke-width="1.4" stroke-linejoin="round"/>`,
  },
  enclave: {
    label: 'Enclave',
    neutral: true,
    svg: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="{C}" stroke-width="1.6"/><path d="M12 8.3 L8.8 14 L15.2 14Z" fill="none" stroke="{C}" stroke-width="1"/><circle cx="12" cy="8.3" r="1.8" fill="{C}"/><circle cx="8.8" cy="14" r="1.8" fill="{C}"/><circle cx="15.2" cy="14" r="1.8" fill="{C}"/>',
  },
  gateway: {
    label: 'Gateway',
    neutral: true,
    svg: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="{C}" stroke-width="1.8"/><circle cx="12" cy="12" r="3.8" fill="none" stroke="{C}" stroke-width="1.2"/>',
  },
  hyperRelay: {
    label: 'Hyper relay',
    neutral: true,
    svg: '<path d="M12 6 L16.5 17 L7.5 17Z" fill="none" stroke="{C}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="6" r="2" fill="{C}"/>',
  },
  lGate: {
    label: 'L-gate',
    neutral: true,
    svg: '<rect x="6" y="6" width="12" height="12" rx="3" fill="none" stroke="{C}" stroke-width="1.6" transform="rotate(45 12 12)"/><path d="M10.2 8.5 L10.2 15 L14 15" fill="none" stroke="{C}" stroke-width="1.6"/>',
  },
  wormhole: {
    label: 'Wormhole',
    neutral: true,
    svg: `<path d="${spiral()}" fill="none" stroke="{C}" stroke-width="1.6" stroke-linecap="round"/>`,
  },
  strangeWormhole: {
    label: 'Strange wormhole',
    neutral: true,
    svg: `<path d="${spiral()}" fill="none" stroke="${purple}" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2 1.6"/>`,
  },
  starlitWormhole: {
    label: 'Starlit wormhole',
    neutral: true,
    svg: `<path d="${spiral()}" fill="none" stroke="${gold}" stroke-width="1.6" stroke-linecap="round"/><path d="M19 2 L19.8 4.2 L22 5 L19.8 5.8 L19 8 L18.2 5.8 L16 5 L18.2 4.2Z" fill="${gold}"/>`,
  },
  shroudTunnel: {
    label: 'Shroud tunnel',
    neutral: true,
    svg: `<path d="${spiral(0.55)}" fill="none" stroke="${purple}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
}

// Neutral icons sit on a chip so they read apart from empire icons, whose colour can be anything.
const chip = '<rect x="0" y="0" width="24" height="24" rx="5" fill="{K}"/>'

// Level dots under the waystation icon, centred.
const dots = (n: number) =>
  Array.from({ length: n }, (_, i) => `<circle cx="${12 + (i - (n - 1) / 2) * 4.5}" cy="21" r="1.4" fill="{C}"/>`).join('')

// iconSvg returns standalone SVG markup; colour is the empire colour for owned icons and ignored for neutral ones.
// level sets the waystation's dots.
export function iconSvg(name: IconName, colour: string, size = 20, level = 3): string {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  const { svg, neutral } = icons[name]
  const body = (neutral ? chip + svg : svg)
    .replace('{DOTS}', dots(level))
    .replaceAll('{C}', neutral ? v('--neutral-icon') : colour)
    .replaceAll('{B}', neutral ? v('--neutral-chip') : v('--bg'))
    .replaceAll('{K}', v('--neutral-chip'))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${body}</svg>`
}
