package geom

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTerritory(t *testing.T) {
	const r = 10.0
	tests := []struct {
		name        string
		pts         []Point
		owners      []int32
		wantBorders map[int32]int // number of border segments per owner
	}{
		{
			name:        "lone star is a full circle",
			pts:         []Point{{0, 0}},
			owners:      []int32{0},
			wantBorders: map[int32]int{0: 32},
		},
		{
			name:   "same owner drops the shared edge",
			pts:    []Point{{0, 0}, {10, 0}},
			owners: []int32{0, 0},
			// Each cell is a chord plus an arc of 240 degrees, which takes 22 segments.
			wantBorders: map[int32]int{0: 2 * 22},
		},
		{
			name:        "different owners keep the shared edge",
			pts:         []Point{{0, 0}, {10, 0}},
			owners:      []int32{0, 1},
			wantBorders: map[int32]int{0: 23, 1: 23},
		},
		{
			name:        "unowned cells have no borders but still cut neighbours",
			pts:         []Point{{0, 0}, {10, 0}},
			owners:      []int32{0, -1},
			wantBorders: map[int32]int{0: 23},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cells := Cells(tt.pts, r)
			for _, c := range cells {
				area := 0.0
				for i, a := range c {
					b := c[(i+1)%len(c)]
					area += a.X*b.Y - b.X*a.Y
				}
				require.Positive(t, area, "cell must be CCW")
				require.LessOrEqual(t, area/2, math.Pi*r*r)
			}
			got := map[int32]int{}
			for o, segs := range Borders(cells, tt.owners) {
				got[o] = len(segs) / 4
			}
			require.Equal(t, tt.wantBorders, got)
		})
	}
}
