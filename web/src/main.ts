import './style.css'
import type { Model } from './model'
import { MapView } from './map'
import { EmpireTable } from './table'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const status = $<HTMLSpanElement>('status')
const fitButton = $<HTMLButtonElement>('fit')
const progress = $<HTMLProgressElement>('progress')
const themeButton = $<HTMLButtonElement>('theme')

// Share of the whole job at the start of each stage and its label.
const stages: Record<string, { from: number; to: number; label: string }> = {
  unpack: { from: 0, to: 0.2, label: 'Unpacking' },
  parse: { from: 0.2, to: 0.8, label: 'Parsing' },
  model: { from: 0.8, to: 0.9, label: 'Building the model' },
  territory: { from: 0.9, to: 1, label: 'Drawing territory' },
}

const storedTheme = () => {
  try {
    return localStorage.getItem('theme')
  } catch {
    return null
  }
}
const setTheme = (theme: string) => {
  document.documentElement.dataset.theme = theme
  themeButton.textContent = theme === 'dark' ? '☀ Light' : '☾ Dark'
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // Private windows may block storage; the theme then lasts for this page only.
  }
  map.draw()
}
themeButton.onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')

const select = (i: number | null) => {
  map.selected = i
  table.selected = i
  map.draw()
  table.render()
}
const map = new MapView($<HTMLCanvasElement>('map'), select)
const table = new EmpireTable($('table'), select)
fitButton.onclick = () => map.fit()
setTheme(storedTheme() ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'))

// Go WASM memory never shrinks, so every file gets a fresh worker.
let worker: Worker | null = null

type WorkerMessage = { json?: string; error?: string; progress?: { stage: string; done: number } }

async function open(file: File) {
  worker?.terminate()
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  status.textContent = `Reading ${file.name}…`
  progress.value = 0
  progress.hidden = false
  const started = performance.now()
  const w = worker
  w.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const p = e.data.progress
    if (p) {
      const s = stages[p.stage]
      if (s) {
        progress.value = s.from + (s.to - s.from) * p.done
        status.textContent = `${s.label}…`
      }
      return
    }
    w.terminate()
    progress.hidden = true
    if (e.data.error || !e.data.json) {
      status.textContent = `Could not read ${file.name}: ${e.data.error ?? 'no result'}`
      return
    }
    const m: Model = JSON.parse(e.data.json)
    map.load(m)
    table.load(m.empires ?? [])
    fitButton.disabled = false
    const secs = ((performance.now() - started) / 1000).toFixed(1)
    status.textContent = `${m.meta.name}, ${m.meta.version}, ${m.meta.date}: ${m.systems.length} systems, ${m.empires?.length ?? 0} empires (${secs} s)`
  }
  w.onerror = (e) => {
    progress.hidden = true
    status.textContent = `Worker error: ${e.message}`
  }
  const buf = await file.arrayBuffer()
  w.postMessage(buf, [buf])
}

$<HTMLInputElement>('file').onchange = (e) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) void open(f)
}
document.addEventListener('dragover', (e) => {
  e.preventDefault()
  document.body.classList.add('dragging')
})
document.addEventListener('dragleave', () => document.body.classList.remove('dragging'))
document.addEventListener('drop', (e) => {
  e.preventDefault()
  document.body.classList.remove('dragging')
  const f = e.dataTransfer?.files[0]
  if (f) void open(f)
})
