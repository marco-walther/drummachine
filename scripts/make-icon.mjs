// Generates build/icon.png (512×512): ink-on-paper drum-pad grid, no dependencies.
// Run: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const S = 512
const px = new Uint8Array(S * S * 4)
const INK = [21, 21, 21]
const PAPER = [238, 238, 238]
const DIM = [70, 70, 70]

function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r)
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

// lit pads: a little beat (kick on 1/3, hats offbeat feel)
const lit = new Set(['0,0', '1,1', '2,0', '3,2', '1,3', '0,2', '2,2'])
const pad = 86
const gap = 22
const grid = 4 * pad + 3 * gap
const off = (S - grid) / 2

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let c = null
    let a = 0
    if (inRoundRect(x, y, 16, 16, S - 32, S - 32, 96)) {
      c = INK
      a = 255
      for (let gy = 0; gy < 4; gy++)
        for (let gx = 0; gx < 4; gx++) {
          if (inRoundRect(x, y, off + gx * (pad + gap), off + gy * (pad + gap), pad, pad, 14)) c = lit.has(`${gx},${gy}`) ? PAPER : DIM
        }
    }
    const i = (y * S + x) * 4
    if (c) px.set([...c, a], i)
  }
}

// PNG encoding
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1)
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])
mkdirSync(new URL('../build/', import.meta.url), { recursive: true })
writeFileSync(new URL('../build/icon.png', import.meta.url), png)
console.log('build/icon.png', png.length, 'bytes')
