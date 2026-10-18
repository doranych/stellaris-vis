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
	// Arks are nomads' ark ships, which are colonies that move between systems.
	Arks []Ark `json:"arks"`
	// WormholeLinks join the two ends of wormholes and shroud tunnels.
	WormholeLinks []WormholeLink `json:"wormholeLinks"`
	// Fleets are painted empires' fleets added up per system, owner and kind.
	Fleets  []Fleets `json:"fleets"`
	Empires []Empire `json:"empires"`
	// Spacing is the median distance from a star to its nearest neighbour, which sets when system details appear.
	Spacing float32 `json:"spacing"`
}

type Ark struct {
	System  int32  `json:"system"` // index into Systems where the ark is now
	Owner   int32  `json:"owner"`  // index into Empires, or -1
	Kind    string `json:"kind"`   // science, military or civilian
	Tier    int    `json:"tier"`   // 1 to 3, shown as glowing rings
	Capital bool   `json:"capital"`
}

type WormholeLink struct {
	A    int32  `json:"a"`
	B    int32  `json:"b"`
	Kind string `json:"kind"` // icon name: wormhole, strangeWormhole, starlitWormhole or shroudTunnel
}

type Fleets struct {
	System   int32   `json:"system"`
	Owner    int32   `json:"owner"`
	Military bool    `json:"military"`
	Fleets   int     `json:"fleets"`
	Ships    int     `json:"ships"`
	Power    float64 `json:"power"`
	// List has each military fleet for the hover tooltip; civilian ships are only counted.
	List []Fleet `json:"list,omitempty"`
}

type Fleet struct {
	Name  string  `json:"name"`
	Ships int     `json:"ships"`
	Power float64 `json:"power"`
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
	// Station is the main starbase level: outpost, starport, starhold, starfortress, citadel or gatebuilders.
	Station          string   `json:"station,omitempty"`
	DeepSpaceCitadel bool     `json:"deepSpaceCitadel,omitempty"`
	OrbitalRing      bool     `json:"orbitalRing,omitempty"`
	Enclave          bool     `json:"enclave,omitempty"`    // mercenary, salvager, mindwarden or other enclave station
	Waystation       int      `json:"waystation,omitempty"` // level 1 to 3
	Colonies         int      `json:"colonies,omitempty"`
	Megastructures   []string `json:"megastructures,omitempty"`
	Passages         []string `json:"passages,omitempty"` // icon names such as gateway or hyperRelay
	// StationOwners are painted empires with any starbase here, such as nomads' waystations in others' systems.
	StationOwners []int32 `json:"stationOwners,omitempty"`
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
	// Game keys below are made readable without localisation: civic_beastmasters becomes Beastmasters.
	Authority      string   `json:"authority"`
	Government     string   `json:"government"`
	Origin         string   `json:"origin"`
	Ethics         []string `json:"ethics"`
	Civics         []string `json:"civics"`
	AscensionPerks []string `json:"ascensionPerks"`
	Colonies       int      `json:"colonies"`
	Pops           int      `json:"pops"`
	EmpireSize     int      `json:"empireSize"`
	Federation     string   `json:"federation,omitempty"`
	Overlord       string   `json:"overlord,omitempty"`
	Subjects       []string `json:"subjects,omitempty"`
	// Label is where the name goes: the largest hyperlane-connected group of the empire's systems. Nil without systems.
	Label *Label `json:"label,omitempty"`
	// Cells are the clipped Voronoi cells of the empire's systems as flat x0,y0,x1,y1,… rings.
	Cells [][]float32 `json:"cells"`
	// Borders are the outline segments as flat x0,y0,x1,y1 quadruples.
	Borders []float32 `json:"borders"`
}
