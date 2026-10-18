// Mirror of model/model.go.

export interface Model {
  meta: { name: string; version: string; date: string }
  systems: System[]
  lanes: [number, number][] | null
  relays: [number, number][] | null
  wayLines: { a: number; b: number; owner: number }[] | null
  arks: { system: number; owner: number; kind: string; tier: number }[] | null
  empires: Empire[] | null
}

export interface System {
  id: number
  name: string
  x: number
  y: number
  owner: number
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
  label?: { x: number; y: number; width: number; systems: number }
  cells: number[][] | null
  borders: number[] | null
}
