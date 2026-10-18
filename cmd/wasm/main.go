//go:build js && wasm

// Command wasm exposes stellarisParse(bytes: Uint8Array, onProgress?: (stage, done) => void) => {json} | {error} to JavaScript.
package main

import (
	"encoding/json"
	"syscall/js"

	"github.com/doranych/stellaris-vis/save"
)

func main() {
	js.Global().Set("stellarisParse", js.FuncOf(parse))
	select {}
}

func parse(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return map[string]any{"error": "stellarisParse takes a Uint8Array"}
	}
	data := make([]byte, args[0].Get("length").Int())
	js.CopyBytesToGo(data, args[0])
	var progress save.Progress
	if len(args) > 1 && args[1].Type() == js.TypeFunction {
		progress = func(stage string, done float64) { args[1].Invoke(stage, done) }
	}
	m, err := save.Open(data, progress)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	out, err := json.Marshal(m)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	return map[string]any{"json": string(out)}
}
