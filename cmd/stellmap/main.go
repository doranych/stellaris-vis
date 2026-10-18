// Command stellmap prints a summary of a Stellaris save, or its map model as JSON with -json.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/doranych/stellaris-vis/save"
)

func main() {
	asJSON := flag.Bool("json", false, "write the model as JSON to stdout")
	flag.Parse()
	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: stellmap [-json] file.sav")
		os.Exit(2)
	}
	if err := run(flag.Arg(0), *asJSON); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(path string, asJSON bool) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	start := time.Now()
	m, err := save.Open(data, nil)
	if err != nil {
		return err
	}
	if asJSON {
		return json.NewEncoder(os.Stdout).Encode(m)
	}
	owned := 0
	for _, s := range m.Systems {
		if s.Owner >= 0 {
			owned++
		}
	}
	fmt.Printf("%s, %s, %s (%v)\n", m.Meta.Name, m.Meta.Version, m.Meta.Date, time.Since(start).Round(time.Millisecond))
	fmt.Printf("systems %d, owned by painted empires %d, lanes %d (relays %d, way lines %d), empires %d\n",
		len(m.Systems), owned, len(m.Lanes), len(m.Relays), len(m.WayLines), len(m.Empires))
	for _, e := range m.Empires {
		fmt.Printf("%5d %-24s %-40q systems %4d border %s fill %s cells %d border segments %d\n",
			e.ID, e.Type, e.Name, e.Systems, e.BorderColour, e.FillColour, len(e.Cells), len(e.Borders)/4)
	}
	return nil
}
