import './wasm_exec.js'

declare global {
  var Go: new () => { importObject: WebAssembly.Imports; run(instance: WebAssembly.Instance): Promise<void> }
  function stellarisParse(
    data: Uint8Array,
    onProgress: (stage: string, done: number) => void,
  ): { json?: string; error?: string }
}

const ready = (async () => {
  const go = new Go()
  const { instance } = await WebAssembly.instantiateStreaming(fetch(import.meta.env.BASE_URL + 'main.wasm'), go.importObject)
  void go.run(instance)
})()

self.onmessage = async (e: MessageEvent<ArrayBuffer>) => {
  try {
    await ready
    const result = stellarisParse(new Uint8Array(e.data), (stage, done) => self.postMessage({ progress: { stage, done } }))
    self.postMessage(result)
  } catch (err) {
    self.postMessage({ error: String(err) })
  }
}
