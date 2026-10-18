// Mirror of model/model.go.

export interface Model {
  meta: { name: string; version: string; date: string }
  systems: System[]
  lanes: [number, number][] | null
  relays: [number, number][] | null
  wayLines: { a: number; b: number; owner: number }[] | null
  arks: Ark[] | null
  wormholeLinks: { a: number; b: number; kind: string }[] | null
  fleets: Fleets[] | null
  empires: Empire[] | null
  spacing: number
}

export interface Ark {
  system: number
  owner: number
  kind: string
  tier: number
  capital: boolean
}

export interface Fleets {
  system: number
  owner: number
  military: boolean
  fleets: number
  ships: number
  power: number
  list?: { name: string; ships: number; power: number }[]
}

export interface System {
  id: number
  name: string
  x: number
  y: number
  owner: number
  station?: string
  deepSpaceCitadel?: boolean
  orbitalRing?: boolean
  enclave?: boolean
  waystation?: number
  colonies?: number
  megastructures?: string[]
  passages?: string[]
  stationOwners?: number[]
}

export interface Empire {
  id: number
  name: string
  type: string
  borderColour: string
  fillColour: string
  systems: number
  militaryPower: number
  economyPower: number
  techPower: number
  fleetSize: number
  victoryScore: number
  victoryRank: number
  isPlayer: boolean
  capitalSystem: number
  authority: string
  government: string
  origin: string
  ethics: string[] | null
  civics: string[] | null
  ascensionPerks: string[] | null
  colonies: number
  pops: number
  empireSize: number
  federation?: string
  overlord?: string
  subjects?: string[]
  label?: { x: number; y: number; width: number; systems: number }
  cells: number[][] | null
  borders: number[] | null
}
