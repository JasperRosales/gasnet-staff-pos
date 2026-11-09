// Input rules of the Register (the same rules pos_checkout checks in the database, so a mistake is
// shown right away instead of after Charge). Pure functions: see saleRules.test.js.

export const LIMITS = { name: 80, address: 200, remarks: 200 }

// used while typing a peso amount: digits and one dot, at most 2 decimals ("1,250.5" -> "1250.5")
export const filterMoney = (text) => {
  const clean = String(text).replace(/[^\d.]/g, '')
  const [whole, ...rest] = clean.split('.')
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole
}

// "₱1,250.50" -> { value: 1250.5 }, "" -> { value: 0 }, "abc" / "-5" / "1.234" -> { error }
export function parseMoney(text, label) {
  const t = String(text ?? '').replace(/[₱,\s]/g, '')
  if (t === '') return { value: 0 }
  // "150." (still typing) counts as 150
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return { error: `${label}: type an amount like 150 or 150.50` }
  return { value: Number(t) }
}

// Expenses are typed as "what amount" pairs, like the Daily Sales Log: "gas 70 food 50".
// Returns an error message, or '' when it is fine (empty is fine).
export function expensesError(text) {
  const t = String(text ?? '').trim()
  if (t === '') return ''
  if (t.length > LIMITS.remarks) return `Expenses are too long (${LIMITS.remarks} characters at most)`
  if (!/\d/.test(t)) return 'Type the amount of each expense, for example: gas 70 food 50'
  // every amount needs a name before it, and every name an amount after it
  if (!/^(\s*[^\d\s][^\d]*?\s*\d[\d,]*(\.\d{1,2})?)+\s*$/u.test(t)) {
    return 'Each expense needs a name and an amount, for example: gas 70 food 50'
  }
  return ''
}

// All the checks of a sale. form: the Register form; subtotal: the cart's amount.
// Returns { errors: { field: message }, discount, cash, total }
export function checkSale(form, subtotal) {
  const errors = {}
  const d = parseMoney(form.discount, 'Discount')
  const discount = d.value ?? 0
  if (d.error) errors.discount = d.error
  else if (discount > 0 && discount >= subtotal) {
    errors.discount = `Discount must be less than the sale amount (₱${subtotal.toLocaleString('en-PH')})`
  }
  const total = Math.max(subtotal - discount, 0)

  let cash = 0
  if (form.payment === 'cash') {
    const c = parseMoney(form.cash, 'Cash received')
    cash = c.value ?? 0
    if (c.error) errors.cash = c.error
    else if (form.cash !== '' && cash < total) errors.cash = `Cash is short by ₱${(total - cash).toLocaleString('en-PH')}`
  }

  const name = String(form.customerName ?? '').trim()
  if (name.length > LIMITS.name) errors.customerName = `Name is too long (${LIMITS.name} characters at most)`
  const contact = String(form.contact ?? '')
  if (contact !== '' && !/^\d{11}$/.test(contact)) errors.contact = 'Contact number must be exactly 11 digits'
  const address = String(form.address ?? '').trim()
  if (form.delivery && address === '') errors.address = 'Please enter the delivery address'
  else if (address.length > LIMITS.address) errors.address = `Address is too long (${LIMITS.address} characters at most)`
  const expenses = expensesError(form.remarks)
  if (expenses) errors.remarks = expenses

  return { errors, discount, cash, total }
}
