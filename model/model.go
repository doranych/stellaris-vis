// Package model is the JSON contract between the Go side and the web UI.
package model

type Model struct {
	Meta    Meta       `json:"meta"`
	Systems []System   `json:"systems"`
	Lanes   [][2]int32 `json:"lanes"` // indices into Systems, a < b, no duplicates
	// Relays are the lanes linked by hyper relays at both ends.
	Relays [][2]int32 `json:"relays"`
	// WayLines are the lanes between two waystations of the same country.
	WayLines []WayLine `json:"wayLines"`
	// Arks are the capital ark ships of nomad empires, which move between systems.
	Arks    []Ark    `json:"arks"`
	Empires []Empire `json:"empires"`
}

type Ark struct {
	System int32  `json:"system"` // index into Systems where the ark is now
	Owner  int32  `json:"owner"`  // index into Empires, or -1
	Kind   string `json:"kind"`   // science, military or civilian
	Tier   int    `json:"tier"`   // 1 to 3, shown as glowing rings
}

type Label struct {
	X       float32 `json:"x"` // centroid of the group
	Y       float32 `json:"y"`
	Width   float32 `json:"width"` // width of the group's bounding box
	Systems int     `json:"systems"`
}

type WayLine struct {
	A     int32 `json:"a"`
	B     int32 `json:"b"`
	Owner int32 `json:"owner"` // index into Empires, or -1
}

type Meta struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Date    string `json:"date"`
}

type System struct {
	ID    uint32  `json:"id"`
	Name  string  `json:"name"`
	X     float32 `json:"x"`
	Y     float32 `json:"y"`
	Owner int32   `json:"owner"` // index into Empires, or -1
}

type Empire struct {
	ID            uint32  `json:"id"`
	Name          string  `json:"name"`
	Type          string  `json:"type"`
	BorderColour  string  `json:"borderColour"`
	FillColour    string  `json:"fillColour"`
	Systems       int     `json:"systems"`
	MilitaryPower float64 `json:"militaryPower"`
	EconomyPower  float64 `json:"economyPower"`
	TechPower     float64 `json:"techPower"`
	FleetSize     int     `json:"fleetSize"`
	VictoryScore  float64 `json:"victoryScore"`
	VictoryRank   int     `json:"victoryRank"` // 1 is first; 0 when the save has none
	IsPlayer      bool    `json:"isPlayer"`
	CapitalSystem int32   `json:"capitalSystem"` // index into Systems, or -1
	// Label is where the name goes: the largest hyperlane-connected group of the empire's systems. Nil without systems.
	Label *Label `json:"label,omitempty"`
	// Cells are the clipped Voronoi cells of the empire's systems as flat x0,y0,x1,y1,… rings.
	Cells [][]float32 `json:"cells"`
	// Borders are the outline segments as flat x0,y0,x1,y1 quadruples.
	Borders []float32 `json:"borders"`
}
