package save

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	clausewitz "github.com/doranych/clausewitz-parser"
	"github.com/stretchr/testify/require"
)

func TestName(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{`name={ key="EMPIRE_DESIGN_hazbuzan" }`, "Hazbuzan"},
		{`name={ key="REP3_PLANET_Kurec" }`, "Kurec"},
		{`name={ key="AofB" variables={ {key="1" value={key="Foundation"}} {key="2" value={key="SPEC_RekThalar_planet"}} } }`, "Foundation of RekThalar"},
		{`name={ key="%ADJECTIVE%" variables={ {key="adjective" value={key="SPEC_Zmelder"}} {key="1" value={key="%ADJ%" variables={ {key="1" value={key="Sacred_Theocracy"}} }}} } }`, "Zmelder Sacred Theocracy"},
		{`name={ key="%ADJ%" variables={ {key="1" value={key="Interstellar" variables={ {key="1" value={key="Nucleus"}} }}} } }`, "Interstellar Nucleus"},
		{`name={ key="Gottara" }`, "Gottara"},
		{`name={ key="SUFFIX_NAME_FORMAT" variables={ {key="NAME" value={key="MACHINE1_SHIP_Assassin"}} {key="SUFFIX" value={key="VII" literal=yes}} } }`, "Assassin VII"},
		{`name={ key="%ADJ%" variables={ {key="1" value={key="Allianceof" variables={ {key="1" value={key="StarNations"}} }}} } }`, "Alliance of StarNations"},
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			root, err := clausewitz.Parse([]byte(tt.in))
			require.NoError(t, err)
			require.Equal(t, tt.want, Name(root.Get("name")))
		})
	}
}

func TestMegastructureName(t *testing.T) {
	tests := []struct {
		typ  string
		want string
	}{
		{"orbital_arc_furnace_4", "Orbital arc furnace"},
		{"dyson_swarm_3", "Dyson swarm"},
		{"think_tank_restored", "Think tank"},
		{"cosmogenesis_world_ruined", "Cosmogenesis world"},
		{"shroud_seal", "Shroud seal"},
		{"quantum_catapult_3", "Quantum catapult"},
		{"gateway_final", ""},
		{"lgate_base", ""},
		{"hyper_relay", ""},
		{"habitat_major_orbital", ""},
	}
	for _, tt := range tests {
		t.Run(tt.typ, func(t *testing.T) {
			require.Equal(t, tt.want, megastructureName(tt.typ))
		})
	}
}

func TestHashColour(t *testing.T) {
	tests := []struct {
		id uint32
	}{{0}, {1}, {16777220}, {4294967294}}
	for _, tt := range tests {
		t.Run(strconv.FormatUint(uint64(tt.id), 10), func(t *testing.T) {
			c := hashColour(tt.id)
			require.Regexp(t, `^#[0-9a-f]{6}$`, c)
			require.Equal(t, c, hashColour(tt.id))
		})
	}
}

// Golden tests on real saves. Denis's ironman lives in testdata with his permission;
// the 4.0.1 save has no clear licence, so it is read from the directory named by STELLARIS_SAVES.
func TestOpen(t *testing.T) {
	tests := []struct {
		path      string
		systems   int
		owned     int
		lanes     int
		empires   int
		wayLines  int
		arks      int
		colonies  int
		links     int
		player    string
		playerSys int
	}{
		// Denis's ironman, 4.5.2, 2623.07.01: the player is a nomad without systems.
		{path: "testdata/ironman.sav", systems: 1011, owned: 953, lanes: 1466, empires: 22, wayLines: 48, arks: 12, colonies: 346, links: 17, player: "Interstellar Techarus Nucleus", playerSys: 0},
		// github.com/chennin/stellaris-dashboard-test-saves, 4.0.1/unitednationsofearth2_-629118313.
		{path: filepath.Join(os.Getenv("STELLARIS_SAVES"), "autosave_2312.01.01.sav"), systems: 602, owned: 474, lanes: 859, empires: 14, wayLines: 0, colonies: 59, links: 7, player: "Bilnoc Autocracy", playerSys: 37},
	}
	for _, tt := range tests {
		t.Run(filepath.Base(tt.path), func(t *testing.T) {
			data, err := os.ReadFile(tt.path)
			if errors.Is(err, os.ErrNotExist) {
				t.Skipf("%s not found", tt.path)
			}
			require.NoError(t, err)
			m, err := Open(data, nil)
			require.NoError(t, err)
			require.Len(t, m.Systems, tt.systems)
			require.Len(t, m.Lanes, tt.lanes)
			require.Len(t, m.Empires, tt.empires)
			require.Len(t, m.WayLines, tt.wayLines)
			require.Len(t, m.Arks, tt.arks)
			require.Len(t, m.WormholeLinks, tt.links)
			colonies := 0
			for _, s := range m.Systems {
				colonies += s.Colonies
			}
			require.Equal(t, tt.colonies, colonies)
			require.NotEmpty(t, m.Fleets)
			owned := 0
			for _, s := range m.Systems {
				if s.Owner >= 0 {
					owned++
				}
			}
			require.Equal(t, tt.owned, owned)
			var players []string
			for i, e := range m.Empires {
				if e.Systems > 0 {
					require.GreaterOrEqual(t, e.CapitalSystem, int32(0), e.Name)
					require.Equal(t, int32(i), m.Systems[e.CapitalSystem].Owner, "%s owns its capital", e.Name)
					require.NotNil(t, e.Label, e.Name)
				}
				if e.IsPlayer {
					players = append(players, e.Name)
					require.Equal(t, tt.playerSys, e.Systems)
				}
			}
			require.Equal(t, []string{tt.player}, players)
		})
	}
}
