// npm test (node --test): the Register's input rules
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterMoney, parseMoney, expensesError, checkSale } from './saleRules.js'

const FORM = { customerName: '', contact: '', address: '', delivery: false, payment: 'cash', cash: '', discount: '', remarks: '' }
const sale = (changes, subtotal = 1285) => checkSale({ ...FORM, ...changes }, subtotal)

test('filterMoney keeps digits and one dot with 2 decimals', () => {
  assert.equal(filterMoney('₱1,250.505'), '1250.50')
  assert.equal(filterMoney('12.3.4'), '12.34')
  assert.equal(filterMoney('-50'), '50')
  assert.equal(filterMoney('abc'), '')
})

test('parseMoney', () => {
  assert.deepEqual(parseMoney('', 'X'), { value: 0 })
  assert.deepEqual(parseMoney('₱1,250.50', 'X'), { value: 1250.5 })
  assert.deepEqual(parseMoney('5.', 'X'), { value: 5 }, 'still typing')
  for (const bad of ['abc', '-5', '1.234', '1e3', 'Infinity', '.5']) assert.ok(parseMoney(bad, 'X').error, bad)
})

test('expenses need a name and an amount for each item', () => {
  for (const ok of ['', 'gas 70', 'gas 70 food 50', 'snacks 1,250.50', 'diesel 900 sahod 7200', 'gas70']) {
    assert.equal(expensesError(ok), '', ok)
  }
  for (const bad of ['gas', '70', 'gas 70 food', '70 gas', 'x'.repeat(201) + ' 5']) assert.ok(expensesError(bad), bad)
})

test('a plain cash sale is fine', () => {
  const r = sale({ cash: '1500' })
  assert.deepEqual(r.errors, {})
  assert.equal(r.total, 1285)
})

test('discount rules', () => {
  assert.ok(sale({ discount: 'abc' }).errors.discount)
  assert.ok(sale({ discount: '1.234' }).errors.discount)
  assert.ok(sale({ discount: '1285' }).errors.discount, 'equal to the amount')
  assert.ok(sale({ discount: '5000' }).errors.discount, 'more than the amount')
  assert.equal(sale({ discount: '20.50' }).total, 1264.5)
})

test('cash must cover the total', () => {
  assert.match(sale({ cash: '1000' }).errors.cash, /short by/)
  assert.ok(sale({ cash: 'abc' }).errors.cash)
  assert.equal(sale({ payment: 'gcash', cash: 'abc' }).errors.cash, undefined, 'GCash ignores cash')
})

test('contact, delivery address and lengths', () => {
  assert.ok(sale({ contact: '0917123456' }).errors.contact)
  assert.equal(sale({ contact: '09171234567' }).errors.contact, undefined)
  assert.ok(sale({ delivery: true, address: '  ' }).errors.address)
  assert.equal(sale({ delivery: true, address: 'Purok 3, Caloocan' }).errors.address, undefined)
  assert.ok(sale({ customerName: 'x'.repeat(81) }).errors.customerName)
})
