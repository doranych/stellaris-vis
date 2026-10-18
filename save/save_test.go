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
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			root, err := clausewitz.Parse([]byte(tt.in))
			require.NoError(t, err)
			require.Equal(t, tt.want, Name(root.Get("name")))
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
		player    string
		playerSys int
	}{
		// Denis's ironman, 4.5.2, 2623.07.01: the player is a nomad without systems.
		{path: "testdata/ironman.sav", systems: 1011, owned: 953, lanes: 1466, empires: 22, wayLines: 48, arks: 1, player: "Interstellar Techarus Nucleus", playerSys: 0},
		// github.com/chennin/stellaris-dashboard-test-saves, 4.0.1/unitednationsofearth2_-629118313.
		{path: filepath.Join(os.Getenv("STELLARIS_SAVES"), "autosave_2312.01.01.sav"), systems: 602, owned: 474, lanes: 859, empires: 14, wayLines: 0, player: "Bilnoc Autocracy", playerSys: 37},
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
