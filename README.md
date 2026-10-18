# stellaris-vis

Galaxy map of a Stellaris save in the browser: stars, hyperlanes, empire territory and a sortable empire table. There is no backend. The save is unpacked and parsed by Go compiled to WebAssembly in a Web Worker, and the page draws the result on a canvas.

Supported saves: Stellaris 4.x in the text format. Checked on 4.0.1 and 4.5.2.

## Running locally

Requires Go 1.27, Node 22 and [Task](https://taskfile.dev).

```
task dev
```

Open http://localhost:5173 and drop a `.sav` file onto the page. Saves are in `Documents/Paradox Interactive/Stellaris/save games`.

## What the map shows

- Territory: the Voronoi cell of each system, clipped by a circle and merged per empire. Fill is the second flag colour, border is the first. Colours come from the game's `flags/colors.txt` (`save/map-colours.json`) and are lightened or darkened to stay visible in the current theme.
- System owner: the owner of the system's first main starbase (outpost to citadel, or a Gate Builders station).
- Painted country types: `default`, `fallen_empire`, `awakened_fallen_empire`, `gate_builders`.
- Thicker lanes: hyperlanes with an active hyper relay at both ends; thickest: way lines between two waystations of the same country.
- Empire names sit on the largest hyperlane-connected group of their systems; small ones appear when zoomed in. Capitals are marked with ✩ in the border colour; a nomad's capital is its capital ark, drawn as an ark icon without ✩, with one glowing ring per tier, where the ark is now.
- Overlapping names move up or down, then shrink, then hide until zoomed in.
- Hovering a star shows the system and its owner; hovering territory shows the empire.
- The selected empire's panel shows its government, ethics, civics, origin, ascension perks, federation, overlord and subjects, with game keys made readable instead of localised.
- Clicking an empire's territory, way line or table row highlights it.

## Tasks

| Task | What it does |
|---|---|
| `task dev` | Builds the WASM module and starts the Vite dev server |
| `task build` | Builds the static site into `web/dist` |
| `task wasm` | Builds `web/public/main.wasm` and copies the matching `wasm_exec.js` |
| `task test` | Runs the Go tests |

Golden tests run on `save/testdata/ironman.sav` (4.5.2, shared by its owner). The 4.0.1 save `autosave_2312.01.01.sav` from [chennin/stellaris-dashboard-test-saves](https://github.com/chennin/stellaris-dashboard-test-saves) has no clear licence, so it is not in the repository; its test runs when `STELLARIS_SAVES` names a directory that holds it.

`go run ./cmd/stellmap file.sav` prints a summary of a save; `-json` prints the model the page receives.

## Layout

- `save`: Stellaris knowledge: archive, owners, names, colours.
- `geom`: territory geometry.
- `model`: the JSON contract with the page; `web/src/model.ts` mirrors it.
- `cmd/wasm`: the WebAssembly bridge, `cmd/stellmap`: the CLI.
- `web`: TypeScript and Vite front end.

Pushes to `main` deploy `web/dist` to GitHub Pages.

## Licence

GNU GPL v3.
