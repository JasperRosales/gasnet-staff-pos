// Builds the receipt as ESC/POS printer commands for a 58mm thermal printer (32 characters a line).
// Pure functions (no browser): tested in escpos.test.js.

export const WIDTH = 32 // characters per line on a 58mm roll (font A)
export const LOGO_DOTS = 320 // logo width in printer dots (58mm = 384 dots; must be a multiple of 8)

const ESC = 0x1b
const GS = 0x1d

// The printer's character set (code page 437) has no ₱, ×, − or accents: use plain letters
export function plain(text) {
  return String(text ?? '')
    .replace(/₱/g, 'P')
    .replace(/×/g, 'x')
    .replace(/[−–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ñ/g, '\ue000') // keep ñ / Ñ (they exist in code page 437)
    .replace(/Ñ/g, '\ue001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // é -> e
    .replace(/[^\ue000\ue001\x20-\x7e]/g, '?')
}

// text -> bytes in code page 437
function bytesOf(text) {
  return [...plain(text)].map((c) => (c === '\ue000' ? 0xa4 : c === '\ue001' ? 0xa5 : c.charCodeAt(0)))
}

// "Cash" ... "P5,000.00" on one line, the right text at the right edge
export function row(left, right, width = WIDTH) {
  const l = plain(left)
  const r = plain(right)
  const space = width - l.length - r.length
  if (space >= 1) return l + ' '.repeat(space) + r
  return l + '\n' + ' '.repeat(Math.max(0, width - r.length)) + r // too long: right text on its own line
}

// splits a long text into lines of at most `width` characters, breaking at spaces
export function wrap(text, width = WIDTH) {
  const lines = []
  let line = ''
  for (const word of plain(text).split(/\s+/).filter(Boolean)) {
    let w = word
    while (w.length > width) {
      if (line) (lines.push(line), (line = ''))
      lines.push(w.slice(0, width))
      w = w.slice(width)
    }
    if (!line) line = w
    else if (line.length + 1 + w.length <= width) line += ' ' + w
    else (lines.push(line), (line = w))
  }
  if (line) lines.push(line)
  return lines
}

// The receipt's lines: [{ text, align: 'left'|'center', bold, big }]
// sale: the same object the on-screen receipt shows; money: formats a number (₱1,285.00)
export function receiptLines({ sale, branch, cashier, money }) {
  const out = []
  const add = (text, opts = {}) => out.push({ text, align: 'left', ...opts })
  const center = (text, opts) => add(text, { align: 'center', ...opts })
  const rule = () => add('-'.repeat(WIDTH))

  center(`${branch} branch`, { bold: true })
  center(new Date(sale.time).toLocaleString('en-PH'))
  center(`Ref ${sale.groupId.slice(0, 8).toUpperCase()}`)
  if (sale.reprint) center('*** REPRINT ***', { bold: true })
  rule()
  for (const l of sale.lines) {
    add(row(`${l.size} x ${l.qty}`, money(l.unitPrice * l.qty)))
    add(`  @ ${money(l.unitPrice)} each`)
  }
  rule()
  if (sale.discount > 0) add(row('Discount', `-${money(sale.discount)}`))
  // double width: half as many characters fit
  add(row('TOTAL', money(sale.total), WIDTH / 2), { bold: true, big: true })
  add(row('Paid by', sale.payment === 'gcash' ? 'GCash' : 'Cash'))
  if (sale.payment === 'cash' && sale.cash > 0) {
    add(row('Cash', money(sale.cash)))
    add(row('Change', money(sale.cash - sale.total)))
  }
  rule()
  const customer =
    sale.customerType === 'commercial'
      ? `Commercial${sale.customerName ? ` (${sale.customerName})` : ''}`
      : sale.customerName || 'Walk-in'
  wrap(`Customer: ${customer}`).forEach((t) => add(t))
  if (sale.delivery) wrap(`For delivery: ${sale.address || ''}`).forEach((t) => add(t))
  wrap(`Cashier: ${cashier}`).forEach((t) => add(t))
  add('')
  center('Thank you!')
  return out
}

// A black-and-white picture as printer bytes. dots: one boolean per pixel, row by row.
// Uses ESC * (24-dot bit image), which nearly every cheap printer understands; some (e.g. POS58D)
// ignore the newer GS v 0 and then print nothing after it. One band of 24 rows per printed line.
export function rasterImage(dots, widthDots, height) {
  const out = [ESC, 0x33, 24] // line spacing = 24 dots, so the bands touch
  for (let y0 = 0; y0 < height; y0 += 24) {
    out.push(ESC, 0x2a, 33, widthDots & 0xff, widthDots >> 8)
    for (let x = 0; x < widthDots; x++)
      for (let k = 0; k < 3; k++) {
        let b = 0
        for (let bit = 0; bit < 8; bit++) {
          const y = y0 + k * 8 + bit
          if (y < height && dots[y * widthDots + x]) b |= 0x80 >> bit
        }
        out.push(b)
      }
    out.push(0x0a)
  }
  out.push(ESC, 0x32) // normal line spacing again
  return out
}

// The whole print job as bytes. logo: bytes from rasterImage(), or null to print without it.
export function receiptBytes(lines, logo = null) {
  const out = [ESC, 0x40, ESC, 0x74, 0] // reset, code page 437
  if (logo) out.push(ESC, 0x61, 1, ...logo)
  for (const l of lines) {
    out.push(ESC, 0x61, l.align === 'center' ? 1 : 0)
    out.push(ESC, 0x45, l.bold ? 1 : 0)
    out.push(GS, 0x21, l.big ? 0x11 : 0)
    for (const part of l.text.split('\n')) out.push(...bytesOf(part), 0x0a)
  }
  out.push(ESC, 0x45, 0, GS, 0x21, 0, ESC, 0x61, 0)
  out.push(ESC, 0x64, 4) // feed 4 lines so the receipt clears the tear bar
  return Uint8Array.from(out)
}
