// Package save turns a Stellaris .sav file into the map model.
package save

import (
	"archive/zip"
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"io"
	"math"
	"slices"
	"sort"
	"strconv"
	"strings"

	clausewitz "github.com/doranych/clausewitz-parser"

	"github.com/doranych/stellaris-vis/geom"
	"github.com/doranych/stellaris-vis/model"
)

// territoryRadius is the territory radius around a star, in median nearest-neighbour distances.
const territoryRadius = 2.2

// Countries of other types (caravaneers, enclaves) own systems but are not painted.
var paintedTypes = map[string]bool{"default": true, "fallen_empire": true, "awakened_fallen_empire": true, "gate_builders": true}

// Only these levels make a starbase the system's main one; deep space citadels and orbital rings do not.
var mainLevels = map[string]bool{
	"starbase_level_outpost":      true,
	"starbase_level_starport":     true,
	"starbase_level_starhold":     true,
	"starbase_level_starfortress": true,
	"starbase_level_citadel":      true,
	"starbase_level_gatebuilders": true,
}

//go:embed map-colours.json
var mapColoursJSON []byte

// Progress reports the current stage (unpack, parse, model, territory) and the share of it done, from 0 to 1.
type Progress func(stage string, done float64)

// Open reads a .sav archive and builds the model from its gamestate. progress may be nil.
func Open(data []byte, progress Progress) (*model.Model, error) {
	if progress == nil {
		progress = func(string, float64) {}
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("not a Stellaris save (a .sav is a zip archive): %w", err)
	}
	i := slices.IndexFunc(zr.File, func(f *zip.File) bool { return f.Name == "gamestate" })
	if i < 0 {
		return nil, errors.New("not a Stellaris save: the archive has no gamestate file")
	}
	f := zr.File[i]
	rc, err := f.Open()
	if err != nil {
		return nil, fmt.Errorf("open gamestate: %w", err)
	}
	defer rc.Close()
	var buf bytes.Buffer
	// The header size is untrusted, so it only presizes the buffer up to a sane limit.
	buf.Grow(int(min(f.UncompressedSize64, 1<<29)))
	for {
		n, err := io.CopyN(&buf, rc, 4<<20)
		if f.UncompressedSize64 > 0 {
			progress("unpack", min(1, float64(buf.Len())/float64(f.UncompressedSize64)))
		}
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read gamestate: %w", err)
		}
		if n == 0 {
			break
		}
	}
	return Extract(buf.Bytes(), progress)
}

// Extract builds the model from an unpacked gamestate. progress may be nil.
func Extract(gamestate []byte, progress Progress) (*model.Model, error) {
	if progress == nil {
		progress = func(string, float64) {}
	}
	progress("parse", 0)
	root, err := clausewitz.Parse(gamestate, "version", "name", "date", "player", "galactic_object", "starbase_mgr", "ships", "country", "bypasses", "planets", "federation")
	if err != nil {
		return nil, fmt.Errorf("parse gamestate: %w", err)
	}
	progress("model", 0)
	for _, k := range []string{"galactic_object", "starbase_mgr", "ships", "country"} {
		if root.Get(k) == nil {
			return nil, fmt.Errorf("gamestate has no %s section; the save may come from an unsupported game version", k)
		}
	}
	var colours map[string][3]uint8
	if err := json.Unmarshal(mapColoursJSON, &colours); err != nil {
		return nil, fmt.Errorf("decode map colours: %w", err)
	}

	m := &model.Model{Meta: model.Meta{Name: str(root.Get("name")), Version: str(root.Get("version")), Date: str(root.Get("date"))}}

	players := map[uint32]bool{}
	for _, p := range kids(root.Get("player")) {
		if id, err := ref(p.Get("country")); err == nil {
			players[id] = true
		}
	}

	fleetOwner := map[uint32]uint32{}
	empireIdx := map[uint32]int32{}
	capitalColony := map[int32]uint32{} // empire index to its capital colony id
	subjectOf := map[uint32]uint32{}    // subject country id to its overlord's
	for _, c := range root.Get("country").Kids {
		if c.Kids == nil { // deleted: 123=none
			continue
		}
		cid, err := strconv.ParseUint(string(c.Key), 10, 32)
		if err != nil {
			return nil, fmt.Errorf("parse country id %q: %w", c.Key, err)
		}
		for _, f := range kids(c.Get("fleets_manager").Get("owned_fleets")) {
			if fid, err := ref(f.Get("fleet")); err == nil {
				fleetOwner[fid] = uint32(cid)
			}
		}
		typ := str(c.Get("type"))
		if !paintedTypes[typ] {
			continue
		}
		var flag []string
		for _, k := range kids(c.Get("flag").Get("colors")) {
			flag = append(flag, str(k))
		}
		border, fill := colour(colours, flag, 0), colour(colours, flag, 1)
		if border == "" {
			border = hashColour(uint32(cid))
		}
		if fill == "" {
			fill = border
		}
		empireIdx[uint32(cid)] = int32(len(m.Empires))
		m.Empires = append(m.Empires, model.Empire{
			ID:             uint32(cid),
			Name:           Name(c.Get("name")),
			Type:           typ,
			BorderColour:   border,
			FillColour:     fill,
			MilitaryPower:  num(c.Get("military_power")),
			EconomyPower:   num(c.Get("economy_power")),
			TechPower:      num(c.Get("tech_power")),
			FleetSize:      int(num(c.Get("fleet_size"))),
			VictoryScore:   num(c.Get("victory_score")),
			VictoryRank:    int(num(c.Get("victory_rank"))),
			IsPlayer:       players[uint32(cid)],
			CapitalSystem:  -1,
			Authority:      readable(str(c.Get("government").Get("authority"))),
			Government:     readable(str(c.Get("government").Get("type"))),
			Origin:         readable(str(c.Get("government").Get("origin"))),
			Ethics:         readableList(c.Get("ethos").Get("ethics")),
			Civics:         readableList(c.Get("government").Get("civics")),
			AscensionPerks: readableList(c.Get("ascension_perks")),
			Colonies:       len(kids(c.Get("owned_planets"))),
			Pops:           int(num(c.Get("num_sapient_pops"))),
			EmpireSize:     int(num(c.Get("empire_size"))),
		})
		e := &m.Empires[len(m.Empires)-1]
		if f, err := ref(c.Get("federation")); err == nil {
			e.Federation = Name(root.Get("federation").Get(strconv.FormatUint(uint64(f), 10)).Get("name"))
		}
		for _, s := range kids(c.Get("subjects")) {
			if sid, err := s.ID(); err == nil {
				subjectOf[sid] = uint32(cid)
				e.Subjects = append(e.Subjects, Name(root.Get("country").Get(strconv.FormatUint(uint64(sid), 10)).Get("name")))
			}
		}
		if p, err := ref(c.Get("capital")); err == nil {
			capitalColony[empireIdx[uint32(cid)]] = p
		}
	}

	for i := range m.Empires {
		if o, ok := subjectOf[m.Empires[i].ID]; ok {
			m.Empires[i].Overlord = Name(root.Get("country").Get(strconv.FormatUint(uint64(o), 10)).Get("name"))
		}
	}

	shipFleet := map[uint32]uint32{}
	// Nomads' arks are ships that carry a colony.
	type ark struct{ ship, colony, system uint32 }
	var arks []ark
	for _, s := range root.Get("ships").Kids {
		sid, err1 := strconv.ParseUint(string(s.Key), 10, 32)
		fid, err2 := ref(s.Get("fleet"))
		if err1 == nil && err2 == nil {
			shipFleet[uint32(sid)] = fid
		}
		colony, err := ref(s.Get("colony"))
		if err1 != nil || err != nil {
			continue
		}
		if sys, err := ref(s.Get("coordinate").Get("origin")); err == nil {
			arks = append(arks, ark{uint32(sid), colony, sys})
		}
	}

	type starbase struct {
		level string
		owner uint32
	}
	starbases := map[uint32]starbase{}
	stationLevel := map[uint32]string{} // station ship id to its starbase level
	for _, sb := range kids(root.Get("starbase_mgr").Get("starbases")) {
		sbid, err := strconv.ParseUint(string(sb.Key), 10, 32)
		if err != nil {
			continue
		}
		station, err := ref(sb.Get("station"))
		if err != nil {
			continue
		}
		stationLevel[station] = str(sb.Get("level"))
		fleet, ok := shipFleet[station]
		if !ok {
			continue
		}
		if owner, ok := fleetOwner[fleet]; ok {
			starbases[uint32(sbid)] = starbase{str(sb.Get("level")), owner}
		}
	}

	// Active hyper relay bypass id to the relays it links to.
	relays := map[uint32][]uint32{}
	for _, b := range kids(root.Get("bypasses")) {
		if str(b.Get("type")) != "relay_bypass" || str(b.Get("active")) != "yes" {
			continue
		}
		bid, err := strconv.ParseUint(string(b.Key), 10, 32)
		if err != nil {
			continue
		}
		if conns := b.Get("active_connections"); conns != nil {
			ids, err := conns.IDs()
			if err == nil {
				relays[uint32(bid)] = ids
			}
		}
	}
	systemRelay := map[uint32]uint32{} // system id to its relay bypass id
	wayOwner := map[uint32]uint32{}    // system id to the country owning a waystation there

	sysIdx := map[uint32]int32{}
	planetSystem := map[uint32]int32{} // planet id to system index
	var lanes [][2]uint32
	for _, g := range root.Get("galactic_object").Kids {
		if g.Kids == nil {
			continue
		}
		gid, err := strconv.ParseUint(string(g.Key), 10, 32)
		if err != nil {
			return nil, fmt.Errorf("parse system id %q: %w", g.Key, err)
		}
		s := model.System{
			ID:   uint32(gid),
			Name: Name(g.Get("name")),
			// The game draws the galaxy with x growing to the left.
			X:     -float32(num(g.Get("coordinate").Get("x"))),
			Y:     float32(num(g.Get("coordinate").Get("y"))),
			Owner: -1,
		}
		// The first main-level starbase owns the system.
		ownerFound := false
		for _, n := range kids(g.Get("starbases")) {
			sbid, err := n.ID()
			if err != nil {
				continue
			}
			sb, ok := starbases[sbid]
			if !ok {
				continue
			}
			if strings.HasPrefix(sb.level, "starbase_level_waystation") {
				wayOwner[s.ID] = sb.owner
			}
			if mainLevels[sb.level] && !ownerFound {
				ownerFound = true
				if e, ok := empireIdx[sb.owner]; ok {
					s.Owner = e
				}
			}
		}
		for _, n := range kids(g.Get("bypasses")) {
			if bid, err := n.ID(); err == nil {
				if _, ok := relays[bid]; ok {
					systemRelay[s.ID] = bid
				}
			}
		}
		for _, h := range kids(g.Get("hyperlane")) {
			if to, err := ref(h.Get("to")); err == nil {
				lanes = append(lanes, [2]uint32{s.ID, to})
			}
		}
		// Systems list their planets, which saves parsing the large planets section just for capitals.
		for _, p := range g.All("planet") {
			if pid, err := p.ID(); err == nil {
				planetSystem[pid] = int32(len(m.Systems))
			}
		}
		sysIdx[s.ID] = int32(len(m.Systems))
		m.Systems = append(m.Systems, s)
	}
	if len(m.Systems) == 0 {
		return nil, errors.New("gamestate has no systems")
	}

	seen := map[[2]int32]bool{}
	for _, l := range lanes {
		a, ok1 := sysIdx[l[0]]
		b, ok2 := sysIdx[l[1]]
		if !ok1 || !ok2 || a == b {
			continue
		}
		if a > b {
			a, b = b, a
		}
		if !seen[[2]int32{a, b}] {
			seen[[2]int32{a, b}] = true
			m.Lanes = append(m.Lanes, [2]int32{a, b})
		}
	}

	for _, l := range m.Lanes {
		sa, sb := m.Systems[l[0]].ID, m.Systems[l[1]].ID
		if ra, ok := systemRelay[sa]; ok {
			if rb, ok := systemRelay[sb]; ok && slices.Contains(relays[ra], rb) {
				m.Relays = append(m.Relays, l)
			}
		}
		oa, okA := wayOwner[sa]
		ob, okB := wayOwner[sb]
		if okA && okB && oa == ob {
			owner := int32(-1)
			if e, ok := empireIdx[oa]; ok {
				owner = e
			}
			m.WayLines = append(m.WayLines, model.WayLine{A: l[0], B: l[1], Owner: owner})
		}
	}

	// country.capital is a colony id in 4.5; the planet holding that colony gives the system. Nomads' arks are ships and stay -1.
	colonyPlanet := map[uint32]uint32{}
	for _, p := range kids(root.Get("planets").Get("planet")) {
		pid, err := strconv.ParseUint(string(p.Key), 10, 32)
		if err != nil {
			continue
		}
		if c, err := ref(p.Get("colony")); err == nil {
			colonyPlanet[c] = uint32(pid)
		}
	}
	for e, c := range capitalColony {
		p, ok := colonyPlanet[c]
		// Before colonies moved to their own section (4.0 saves), capital is the planet id itself.
		if len(colonyPlanet) == 0 {
			p, ok = c, true
		}
		if !ok {
			continue
		}
		if s, ok := planetSystem[p]; ok {
			m.Empires[e].CapitalSystem = s
		}
	}
	capitalOf := map[uint32]int32{}
	for e, c := range capitalColony {
		capitalOf[c] = e
	}
	for _, a := range arks {
		sys, ok := sysIdx[a.system]
		if !ok {
			continue
		}
		owner := int32(-1)
		if c, ok := fleetOwner[shipFleet[a.ship]]; ok {
			if e, ok := empireIdx[c]; ok {
				owner = e
			}
		}
		// Levels look like starbase_level_science_arkship_3.
		kind, tier, _ := strings.Cut(strings.TrimPrefix(stationLevel[a.ship], "starbase_level_"), "_arkship_")
		t, err := strconv.Atoi(tier)
		if err != nil || t < 1 {
			t = 1
		}
		// Like planets, other colony arks are not drawn; the capital ark stands in for the nomads' capital.
		if e, ok := capitalOf[a.colony]; !ok || e != owner {
			continue
		}
		m.Arks = append(m.Arks, model.Ark{System: sys, Owner: owner, Kind: kind, Tier: t})
	}
	labels(m)
	progress("territory", 0)

	pts := make([]geom.Point, len(m.Systems))
	owners := make([]int32, len(m.Systems))
	for i, s := range m.Systems {
		pts[i] = geom.Point{X: float64(s.X), Y: float64(s.Y)}
		owners[i] = s.Owner
		if s.Owner >= 0 {
			m.Empires[s.Owner].Systems++
		}
	}
	cells := geom.Cells(pts, territoryRadius*medianNearest(pts))
	for i, c := range cells {
		if owners[i] < 0 {
			continue
		}
		flat := make([]float32, 0, 2*len(c))
		for _, p := range c {
			flat = append(flat, float32(p.X), float32(p.Y))
		}
		m.Empires[owners[i]].Cells = append(m.Empires[owners[i]].Cells, flat)
	}
	for o, b := range geom.Borders(cells, owners) {
		m.Empires[o].Borders = b
	}
	progress("territory", 1)
	return m, nil
}

// labels places each empire's label on its largest group of systems joined by hyperlanes inside its borders.
func labels(m *model.Model) {
	parent := make([]int32, len(m.Systems))
	for i := range parent {
		parent[i] = int32(i)
	}
	var find func(int32) int32
	find = func(i int32) int32 {
		for parent[i] != i {
			parent[i] = parent[parent[i]]
			i = parent[i]
		}
		return i
	}
	for _, l := range m.Lanes {
		if o := m.Systems[l[0]].Owner; o >= 0 && o == m.Systems[l[1]].Owner {
			parent[find(l[0])] = find(l[1])
		}
	}
	groups := map[int32][]int32{}
	for i, s := range m.Systems {
		if s.Owner >= 0 {
			r := find(int32(i))
			groups[r] = append(groups[r], int32(i))
		}
	}
	for _, g := range groups {
		e := &m.Empires[m.Systems[g[0]].Owner]
		if e.Label != nil && e.Label.Systems >= len(g) {
			continue
		}
		var sx, sy float32
		minX, maxX := float32(math.Inf(1)), float32(math.Inf(-1))
		for _, i := range g {
			s := m.Systems[i]
			sx, sy = sx+s.X, sy+s.Y
			minX, maxX = min(minX, s.X), max(maxX, s.X)
		}
		n := float32(len(g))
		e.Label = &model.Label{X: sx / n, Y: sy / n, Width: maxX - minX, Systems: len(g)}
	}
}

// ponytail: O(n²) scan, fine for ~1000 systems; use a grid if galaxies grow past a few thousand.
func medianNearest(pts []geom.Point) float64 {
	d := make([]float64, 0, len(pts))
	for i, a := range pts {
		best := math.Inf(1)
		for j, b := range pts {
			if i != j {
				best = min(best, math.Hypot(a.X-b.X, a.Y-b.Y))
			}
		}
		if !math.IsInf(best, 1) {
			d = append(d, best)
		}
	}
	if len(d) == 0 {
		return 1
	}
	sort.Float64s(d)
	return d[len(d)/2]
}

// colour returns flag colour i as #rrggbb, or "" when the flag has no such colour.
func colour(colours map[string][3]uint8, flag []string, i int) string {
	if i >= len(flag) {
		return ""
	}
	c, ok := colours[flag[i]]
	if !ok {
		return ""
	}
	return fmt.Sprintf("#%02x%02x%02x", c[0], c[1], c[2])
}

// hashColour gives a country without flag colours a stable hue from its id, at 60% saturation and 50% lightness.
func hashColour(id uint32) string {
	h := fnv.New32a()
	h.Write([]byte(strconv.FormatUint(uint64(id), 10)))
	hue := float64(h.Sum32()%360) / 60
	const chroma = 0.6
	x := chroma * (1 - math.Abs(math.Mod(hue, 2)-1))
	var r, g, b float64
	switch int(hue) {
	case 0:
		r, g = chroma, x
	case 1:
		r, g = x, chroma
	case 2:
		g, b = chroma, x
	case 3:
		g, b = x, chroma
	case 4:
		r, b = x, chroma
	default:
		r, b = chroma, x
	}
	m := 0.5 - chroma/2
	return fmt.Sprintf("#%02x%02x%02x", uint8(math.Round((r+m)*255)), uint8(math.Round((g+m)*255)), uint8(math.Round((b+m)*255)))
}

// Name renders a name template such as {key="%ADJECTIVE%" variables={…}} without localisation files.
func Name(n *clausewitz.Node) string {
	if n == nil {
		return ""
	}
	key := str(n.Get("key"))
	vars := map[string]string{}
	var order []string
	for _, v := range kids(n.Get("variables")) {
		k := str(v.Get("key"))
		vars[k] = Name(v.Get("value"))
		order = append(order, k)
	}
	switch key {
	case "%ADJECTIVE%":
		return strings.TrimSpace(vars["adjective"] + " " + vars["1"])
	case "%ADJ%":
		return vars["1"]
	case "AofB":
		return vars["1"] + " of " + vars["2"]
	}
	// Format keys such as Allianceof read as "Alliance of {1}".
	if base, ok := strings.CutSuffix(key, "of"); ok && base != "" && !strings.Contains(key, "_") {
		key = base + " of"
	}
	words := []string{leaf(key)}
	for _, k := range order {
		words = append(words, vars[k])
	}
	return strings.Join(slices.DeleteFunc(words, func(s string) bool { return s == "" }), " ")
}

// readable turns a game key such as ethic_fanatic_xenophile into Fanatic xenophile.
func readable(key string) string {
	for _, p := range []string{"ethic_", "civic_", "auth_", "gov_", "origin_", "ap_"} {
		if s, ok := strings.CutPrefix(key, p); ok {
			key = s
			break
		}
	}
	key = strings.ReplaceAll(key, "_", " ")
	if key == "" {
		return ""
	}
	return strings.ToUpper(key[:1]) + key[1:]
}

func readableList(n *clausewitz.Node) []string {
	var out []string
	for _, k := range kids(n) {
		out = append(out, readable(str(k)))
	}
	return out
}

// leaf turns a localisation key such as SPEC_RekThalar_planet or REP3_PLANET_Kurec into readable text.
func leaf(key string) string {
	if strings.HasPrefix(key, "%") {
		return ""
	}
	words := strings.Split(strings.TrimSuffix(key, "_planet"), "_")
	// Leading upper-case parts are namespaces of the name lists, not part of the name.
	for len(words) > 1 && words[0] == strings.ToUpper(words[0]) {
		words = words[1:]
	}
	for i, w := range words {
		if w != "" {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

func kids(n *clausewitz.Node) []*clausewitz.Node {
	if n == nil {
		return nil
	}
	return n.Kids
}

func str(n *clausewitz.Node) string {
	if n == nil {
		return ""
	}
	return n.Str()
}

func num(n *clausewitz.Node) float64 {
	if n == nil {
		return 0
	}
	f, err := n.Float()
	if err != nil {
		return 0
	}
	return f
}

func ref(n *clausewitz.Node) (uint32, error) {
	if n == nil {
		return 0, errors.New("no reference")
	}
	v, err := n.ID()
	if err == nil && v == clausewitz.NoID {
		return 0, errors.New("empty reference")
	}
	return v, err
}
