import { iconSvg, icons, otherFleets, ownFleets, type IconName } from './icons'

const groups: [string, IconName[]][] = [
  ['Stations', ['outpost', 'starport', 'starhold', 'starfortress', 'citadel', 'deepSpaceCitadel', 'waystation']],
  ['Colonies and structures', ['colony', 'capital', 'orbitalRing', 'megastructure', 'ark']],
  ['Passages and neutral stations', ['gateway', 'hyperRelay', 'lGate', 'wormhole', 'strangeWormhole', 'starlitWormhole', 'shroudTunnel', 'enclave']],
]

// line draws a short sample of a map line for the legend.
const line = (width: number, colour: string, dash = '') =>
  `<svg width="28" height="20" viewBox="0 0 28 20"><line x1="2" y1="10" x2="26" y2="10" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/></svg>`

// renderLegend fills the legend with every icon and line type, in the current theme's colours.
export function renderLegend(root: HTMLElement) {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  const sample = v('--accent') // stands in for an empire's border colour
  const item = (svg: string, label: string) => `<div>${svg}<span>${label}</span></div>`
  let html = ''
  for (const [title, names] of groups) {
    html += `<h4>${title}</h4>` + names.map((n) => item(iconSvg(n, sample), icons[n].label)).join('')
  }
  html +=
    '<h4>Fleets, with an empire selected</h4>' +
    item(iconSvg('militaryFleet', ownFleets), 'Its military fleets, 1–7 stars for total power') +
    item(iconSvg('civilianShips', ownFleets), 'Its civilian fleets, number of fleets') +
    item(iconSvg('militaryFleet', otherFleets), "Other empires' military fleets") +
    item(iconSvg('civilianShips', otherFleets), "Other empires' civilian fleets")
  html +=
    '<h4>Lines</h4>' +
    item(line(1, v('--lane')), 'Hyperlane') +
    item(line(2.5, v('--lane')), 'Hyperlane with relays at both ends') +
    item(line(5, sample), 'Way line between waystations') +
    item(line(1.5, v('--neutral-icon'), '4 3'), 'Wormhole or gateway link, with Spoilers on: whole galaxy, or on hover when zoomed in')
  root.innerHTML = html
}
