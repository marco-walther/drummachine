import * as Tone from 'tone'

/**
 * Captures what flows through audio nodes (master / inserts) as raw PCM via an
 * AudioWorklet. Each tap records stereo blocks and remembers the audio frame
 * where it started, so recordings can be trimmed to the exact playback start.
 */

const PROCESSOR = `
class DmRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.size = 8192
    this.l = new Float32Array(this.size)
    this.r = new Float32Array(this.size)
    this.n = 0
    this.first = -1
    this.stopping = false
    this.port.onmessage = (e) => { if (e.data === 'stop') this.stopping = true }
  }
  flush() {
    if (this.n === 0) return
    this.port.postMessage({ l: this.l.slice(0, this.n), r: this.r.slice(0, this.n) })
    this.n = 0
  }
  process(inputs) {
    if (this.first < 0) { this.first = currentFrame; this.port.postMessage({ first: currentFrame, rate: sampleRate }) }
    const input = inputs[0]
    const frames = 128
    const L = input && input[0]
    const R = input && (input[1] || input[0])
    for (let i = 0; i < frames; i++) {
      this.l[this.n] = L ? L[i] : 0
      this.r[this.n] = R ? R[i] : 0
      this.n++
      if (this.n === this.size) this.flush()
    }
    if (this.stopping) { this.flush(); this.port.postMessage({ done: true }); return false }
    return true
  }
}
registerProcessor('dm-recorder', DmRecorder)
`

let moduleReady: Promise<void> | null = null
function loadModule(): Promise<void> {
  // Tone caches a single worklet module per context, so ours is added directly.
  moduleReady ??= Tone.getContext().rawContext.audioWorklet.addModule(
    URL.createObjectURL(new Blob([PROCESSOR], { type: 'application/javascript' }))
  )
  return moduleReady
}

export interface Capture {
  /** frame where this tap's recording started (audio clock) */
  firstFrame: number
  sampleRate: number
  left: Float32Array
  right: Float32Array
}

export interface Recorder {
  stop(): Promise<Capture[]>
}

export async function startRecorder(sources: Tone.ToneAudioNode[]): Promise<Recorder> {
  await loadModule()
  const ctx = Tone.getContext()
  const sink = new Tone.Gain(0).toDestination() // keeps the worklets running, silently
  const taps = sources.map((source) => {
    const node = ctx.createAudioWorkletNode('dm-recorder', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit'
    })
    const blocks: { l: Float32Array; r: Float32Array }[] = []
    const meta = { first: 0, rate: ctx.sampleRate }
    let resolveDone: () => void = () => {}
    const done = new Promise<void>((r) => (resolveDone = r))
    node.port.onmessage = (e: MessageEvent) => {
      const d = e.data
      if (d.first !== undefined) Object.assign(meta, { first: d.first, rate: d.rate })
      else if (d.done) resolveDone()
      else blocks.push(d)
    }
    source.connect(node)
    Tone.connect(node, sink)
    return { node, source, blocks, meta, done }
  })

  return {
    async stop() {
      for (const t of taps) t.node.port.postMessage('stop')
      await Promise.all(taps.map((t) => Promise.race([t.done, new Promise((r) => setTimeout(r, 1000))])))
      const result = taps.map((t) => {
        const total = t.blocks.reduce((n, b) => n + b.l.length, 0)
        const left = new Float32Array(total)
        const right = new Float32Array(total)
        let o = 0
        for (const b of t.blocks) {
          left.set(b.l, o)
          right.set(b.r, o)
          o += b.l.length
        }
        try {
          t.source.disconnect(t.node)
        } catch {
          /* already gone */
        }
        t.node.disconnect()
        return { firstFrame: t.meta.first, sampleRate: t.meta.rate, left, right }
      })
      sink.dispose()
      return result
    }
  }
}
