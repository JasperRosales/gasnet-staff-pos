// npm test (node --test): the Bluetooth receipt layout for a 58mm printer
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WIDTH, plain, row, wrap, receiptLines, receiptBytes, rasterImage } from './escpos.js'

const money = (n) => 'P' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const SALE = {
  groupId: '6dd57ab6-057d-40aa-89b1-9b529cbad267',
  time: '2026-11-23T04:40:33Z',
  lines: [{ size: '11kg', qty: 3, unitPrice: 1285 }, { size: '50kg', qty: 10, unitPrice: 5490 }],
  discount: 100,
  total: 58610,
  payment: 'cash',
  cash: 60000,
  customerType: 'commercial',
  customerName: 'Peñafrancia Eatery and Catering Services',
  delivery: true,
  address: '123 Mabini St, Brgy Poblacion, Batangas City',
}

test('plain() swaps characters the printer lacks', () => {
  assert.equal(plain('₱1,285.00 × 2 − é'), 'P1,285.00 x 2 - e')
})

test('row() puts the amount at the right edge', () => {
  assert.equal(row('Cash', 'P5,000.00'), 'Cash' + ' '.repeat(WIDTH - 13) + 'P5,000.00')
  assert.equal(row('Cash', 'P5,000.00').length, WIDTH)
})

test('wrap() never goes past the line width', () => {
  for (const l of wrap('Customer: ' + SALE.customerName + ' ' + 'x'.repeat(50))) assert.ok(l.length <= WIDTH)
})

test('every receipt line fits a 58mm roll', () => {
  for (const l of receiptLines({ sale: SALE, branch: 'Sta. Teresita', cashier: 'Bayan Staff', money })) {
    const width = l.big ? WIDTH / 2 : WIDTH
    for (const part of l.text.split('\n')) assert.ok(part.length <= width, `too long: "${part}"`)
  }
})

test('receipt bytes start with reset and keep ñ', () => {
  const bytes = receiptBytes(receiptLines({ sale: SALE, branch: 'Bayan', cashier: 'X', money }))
  assert.deepEqual([...bytes.slice(0, 2)], [0x1b, 0x40])
  assert.ok(bytes.includes(0xa4)) // ñ in code page 437
})

test('rasterImage packs 8 dots a byte', () => {
  const dots = Array(16).fill(false)
  dots[0] = true
  dots[9] = true
  // ESC * 33, 8 columns of 3 bytes; column 0 has row 0 set, column 1 has row 1 set
  const cols = Array(24).fill(0)
  cols[0] = 0x80
  cols[3] = 0x40
  assert.deepEqual(rasterImage(dots, 8, 2), [0x1b, 0x33, 24, 0x1b, 0x2a, 33, 8, 0, ...cols, 0x0a, 0x1b, 0x32])
})
