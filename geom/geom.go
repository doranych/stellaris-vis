// Package geom builds empire territory from star positions: Voronoi cells clipped by a circle and merged per owner.
package geom

import (
	"math"
	"slices"
)

type Point struct{ X, Y float64 }

// arcStep is the largest angle between two points of a polygonised circle arc.
const arcStep = math.Pi / 16

// Cells returns the Voronoi cell of every point, clipped by a circle of radius r around it, as a CCW polygon.
func Cells(pts []Point, r float64) [][]Point {
	// Bisectors of points further than 2r apart cannot cut a cell already clipped to radius r.
	grid := map[[2]int][]int{}
	cell := func(p Point) [2]int { return [2]int{int(math.Floor(p.X / (2 * r))), int(math.Floor(p.Y / (2 * r)))} }
	for i, p := range pts {
		grid[cell(p)] = append(grid[cell(p)], i)
	}

	out := make([][]Point, len(pts))
	for i, s := range pts {
		// Half-width 2r keeps the square's edges clear of the circle so clipping never meets a tangent.
		poly := []Point{{s.X - 2*r, s.Y - 2*r}, {s.X + 2*r, s.Y - 2*r}, {s.X + 2*r, s.Y + 2*r}, {s.X - 2*r, s.Y + 2*r}}
		c := cell(s)
		for dx := -1; dx <= 1; dx++ {
			for dy := -1; dy <= 1; dy++ {
				for _, j := range grid[[2]int{c[0] + dx, c[1] + dy}] {
					q := pts[j]
					if j == i || math.Hypot(q.X-s.X, q.Y-s.Y) > 2*r {
						continue
					}
					poly = clipHalfPlane(poly, s, q)
				}
			}
		}
		out[i] = clipCircle(poly, s, r)
	}
	return out
}

// clipHalfPlane keeps the part of poly closer to s than to q.
func clipHalfPlane(poly []Point, s, q Point) []Point {
	m := Point{(s.X + q.X) / 2, (s.Y + q.Y) / 2}
	n := Point{q.X - s.X, q.Y - s.Y}
	side := func(p Point) float64 { return (p.X-m.X)*n.X + (p.Y-m.Y)*n.Y }
	var out []Point
	for i, a := range poly {
		b := poly[(i+1)%len(poly)]
		sa, sb := side(a), side(b)
		if sa <= 0 {
			out = append(out, a)
		}
		if (sa < 0 && sb > 0) || (sa > 0 && sb < 0) {
			t := sa / (sa - sb)
			out = append(out, Point{a.X + t*(b.X-a.X), a.Y + t*(b.Y-a.Y)})
		}
	}
	return out
}

// clipCircle intersects a convex CCW polygon containing c with the circle of radius r around c.
func clipCircle(poly []Point, c Point, r float64) []Point {
	const (
		inside = iota
		entry
		exit
	)
	type event struct {
		p    Point
		kind int
	}
	var seq []event
	for i, a := range poly {
		b := poly[(i+1)%len(poly)]
		if math.Hypot(a.X-c.X, a.Y-c.Y) <= r {
			seq = append(seq, event{a, inside})
		}
		d := Point{b.X - a.X, b.Y - a.Y}
		f := Point{a.X - c.X, a.Y - c.Y}
		qa, qb, qc := d.X*d.X+d.Y*d.Y, 2*(f.X*d.X+f.Y*d.Y), f.X*f.X+f.Y*f.Y-r*r
		disc := qb*qb - 4*qa*qc
		if qa == 0 || disc <= 0 {
			continue
		}
		sq := math.Sqrt(disc)
		for k, t := range []float64{(-qb - sq) / (2 * qa), (-qb + sq) / (2 * qa)} {
			if t > 1e-9 && t < 1-1e-9 {
				seq = append(seq, event{Point{a.X + t*d.X, a.Y + t*d.Y}, entry + k})
			}
		}
	}

	hasCrossing := slices.ContainsFunc(seq, func(e event) bool { return e.kind != inside })
	if !hasCrossing {
		if len(seq) > 0 {
			return poly
		}
		return arc(c, r, 0, 2*math.Pi, true)
	}

	var out []Point
	for k, e := range seq {
		if e.kind == entry {
			for j := 1; j < len(seq); j++ {
				prev := seq[(k-j+len(seq))%len(seq)]
				if prev.kind == exit {
					a0 := math.Atan2(prev.p.Y-c.Y, prev.p.X-c.X)
					a1 := math.Atan2(e.p.Y-c.Y, e.p.X-c.X)
					delta := math.Mod(a1-a0+4*math.Pi, 2*math.Pi)
					out = append(out, arc(c, r, a0, delta, false)...)
					break
				}
			}
		}
		out = append(out, e.p)
	}
	return out
}

// arc returns points along a CCW arc from angle a0 spanning delta, without its endpoints unless full is set.
func arc(c Point, r, a0, delta float64, full bool) []Point {
	steps := int(math.Ceil(delta / arcStep))
	var out []Point
	from, to := 1, steps-1
	if full {
		from, to = 0, steps-1
	}
	for k := from; k <= to; k++ {
		a := a0 + delta*float64(k)/float64(steps)
		out = append(out, Point{c.X + r*math.Cos(a), c.Y + r*math.Sin(a)})
	}
	return out
}

// Borders returns, per owner, the edges of its cells that no other cell of the same owner shares,
// as flat x0,y0,x1,y1 quadruples. Owners below zero are skipped.
func Borders(cells [][]Point, owners []int32) map[int32][]float32 {
	type key [2]int64
	q := func(p Point) key { return key{int64(math.Round(p.X * 1e3)), int64(math.Round(p.Y * 1e3))} }
	type edge struct {
		owner int32
		a, b  key
	}
	count := map[edge]int{}
	var order []edge
	pts := map[edge][2]Point{}
	for i, poly := range cells {
		if owners[i] < 0 {
			continue
		}
		for k, a := range poly {
			b := poly[(k+1)%len(poly)]
			ka, kb := q(a), q(b)
			if ka == kb {
				continue
			}
			if kb[0] < ka[0] || (kb[0] == ka[0] && kb[1] < ka[1]) {
				ka, kb = kb, ka
			}
			e := edge{owners[i], ka, kb}
			if count[e] == 0 {
				order = append(order, e)
				pts[e] = [2]Point{a, b}
			}
			count[e]++
		}
	}
	out := map[int32][]float32{}
	for _, e := range order {
		if count[e] == 1 {
			p := pts[e]
			out[e.owner] = append(out[e.owner], float32(p[0].X), float32(p[0].Y), float32(p[1].X), float32(p[1].Y))
		}
	}
	return out
}
