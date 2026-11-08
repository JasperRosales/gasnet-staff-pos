import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { peso } from '../lib/money'
import { loadProducts, checkout } from '../lib/pos'
import { confirmDialog, alertDialog } from '../components/Confirm'
import PosLayout from '../components/PosLayout'
import Receipt from '../components/Receipt'
import TodaySales from './TodaySales'
import Inventory from './Inventory'

const TABS = [
  { key: 'register', label: 'Register' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'today', label: "Today's sales" },
]

const EMPTY_FORM = {
  customerName: '',
  contact: '',
  address: '',
  customerType: '',
  delivery: false,
  payment: 'cash',
  cash: '',
  discount: '',
  remarks: '',
}

const CARD = 'rounded-2xl border border-(color:--border) bg-white'
const LABEL = 'mb-1 block text-[13px] font-medium text-gray-600'
const choice = (on) =>
  `flex-1 rounded-lg px-3 py-2 text-[14px] ${on ? 'bg-brand-pine text-white' : 'border border-(color:--border) bg-white text-brand-pine'}`

function stockBadge(p) {
  if (p.stock <= 0) return { text: 'Out of stock', cls: 'bg-red-100 text-brand-red' }
  if (p.stock <= p.low) return { text: `Low: ${p.stock} left`, cls: 'bg-amber-100 text-amber-800' }
  return { text: `${p.stock} in stock`, cls: 'bg-brand-light text-brand-pine' }
}

export default function Pos({ branch, fullName }) {
  const [tab, setTab] = useState('register')
  const [products, setProducts] = useState([])
  const [loadError, setLoadError] = useState('')
  const [cart, setCart] = useState([]) // [{ size, qty }]
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setProducts(await loadProducts(branch))
      setLoadError('')
    } catch (e) {
      setLoadError(e.message)
    }
  }, [branch])

  useEffect(() => {
    refresh()
  }, [refresh])

  // stock changes from other cashiers or the admin show up right away
  useEffect(() => {
    const channel = supabase
      .channel(`pos-stock-${branch}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock', filter: `branch=eq.${branch}` }, refresh)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [branch, refresh])

  const productOf = (size) => products.find((p) => p.size === size)
  const qtyInCart = (size) => cart.find((x) => x.size === size)?.qty ?? 0

  const setQty = (size, qty) => {
    const max = productOf(size)?.stock ?? 0
    const next = Math.max(0, Math.min(qty, max))
    setCart((c) =>
      next === 0
        ? c.filter((x) => x.size !== size)
        : c.some((x) => x.size === size)
          ? c.map((x) => (x.size === size ? { ...x, qty: next } : x))
          : [...c, { size, qty: next }],
    )
  }

  const setField = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const lines = cart.map((x) => ({ ...x, price: productOf(x.size)?.price ?? 0 }))
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const discount = Math.min(Math.max(Number(form.discount) || 0, 0), subtotal)
  const total = subtotal - discount
  const cash = Number(form.cash) || 0
  const cashShort = form.payment === 'cash' && form.cash !== '' && cash < total

  const clearSale = () => {
    setCart([])
    setForm(EMPTY_FORM)
  }

  const submit = async () => {
    if (cart.length === 0) return
    if (form.delivery && !form.address.trim()) return alertDialog('Please enter the delivery address.')
    if (form.contact && !/^\d{11}$/.test(form.contact)) return alertDialog('Contact number must be exactly 11 digits.')
    if (cashShort) return alertDialog(`Cash is short by ${peso(total - cash)}.`)
    if (!(await confirmDialog(`Charge ${peso(total)} for ${cart.map((x) => `${x.size} × ${x.qty}`).join(', ')}?`)))
      return

    setSaving(true)
    try {
      const result = await checkout({ ...form, items: cart, discount })
      setReceipt({
        groupId: result.group_id,
        time: new Date().toISOString(),
        lines: result.lines.map((l) => ({ size: l.size, qty: l.qty, unitPrice: Number(l.unit_price) })),
        discount: Number(result.discount),
        total: Number(result.total),
        payment: form.payment,
        cash,
        customerName: form.customerName,
        delivery: form.delivery,
        address: form.address,
      })
      clearSale()
    } catch (e) {
      await alertDialog(e.message, 'Sale not saved')
    } finally {
      setSaving(false)
      refresh()
    }
  }

  return (
    <PosLayout branch={branch} fullName={fullName} tabs={TABS} active={tab} onSelect={setTab}>
      {tab === 'today' ? (
        <TodaySales branch={branch} onChange={refresh} />
      ) : tab === 'inventory' ? (
        <Inventory branch={branch} />
      ) : (
        <div className="grid grid-cols-[1fr_380px] gap-5 max-[900px]:grid-cols-1">
          {/* Products */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="m-0 text-xl">LPG cylinders</h2>
              <button className="border border-(color:--border) bg-white text-brand-pine" onClick={refresh}>
                Refresh
              </button>
            </div>
            {loadError && <p className="text-brand-red">Could not load products: {loadError}</p>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              {products.map((p) => {
                const badge = stockBadge(p)
                const inCart = qtyInCart(p.size)
                const canAdd = inCart < p.stock
                return (
                  <button
                    key={p.size}
                    disabled={!canAdd}
                    onClick={() => setQty(p.size, inCart + 1)}
                    className={`${CARD} relative flex flex-col items-start gap-2 p-4 text-left text-(--text) hover:border-brand-pine`}
                  >
                    {inCart > 0 && (
                      <span className="absolute top-3 right-3 grid size-7 place-items-center rounded-full bg-brand-red text-[13px] font-semibold text-white">
                        {inCart}
                      </span>
                    )}
                    <img src="/login-tanks.png" alt="" className="h-16 w-auto object-contain" />
                    <span className="text-2xl font-semibold">{p.size}</span>
                    <span className="text-[17px] text-brand-pine">{peso(p.price)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${badge.cls}`}>{badge.text}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Cart and payment */}
          <aside className={`${CARD} flex flex-col gap-4 self-start p-4`}>
            <h2 className="m-0 text-xl">Current sale</h2>

            {lines.length === 0 ? (
              <p className="m-0 text-[14px] text-gray-500">Tap a cylinder to add it.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {lines.map((l) => (
                  <li key={l.size} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="font-semibold">{l.size}</div>
                      <div className="text-[13px] text-gray-500">{peso(l.price)} each</div>
                    </div>
                    <button className="px-3 py-1" onClick={() => setQty(l.size, l.qty - 1)} aria-label="Less">
                      −
                    </button>
                    <span className="w-6 text-center">{l.qty}</span>
                    <button
                      className="px-3 py-1"
                      onClick={() => setQty(l.size, l.qty + 1)}
                      disabled={l.qty >= (productOf(l.size)?.stock ?? 0)}
                      aria-label="More"
                    >
                      +
                    </button>
                    <span className="w-24 text-right">{peso(l.price * l.qty)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <span className={LABEL}>Customer</span>
              <div className="flex gap-2">
                <button className={choice(form.customerType === '')} onClick={() => setForm({ ...form, customerType: '' })}>
                  Walk-in
                </button>
                <button
                  className={choice(form.customerType === 'commercial')}
                  onClick={() => setForm({ ...form, customerType: 'commercial' })}
                >
                  Commercial
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Name (optional)" value={form.customerName} onChange={setField('customerName')} />
              <input
                placeholder="Contact (11 digits)"
                inputMode="numeric"
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value.replace(/\D/g, '').slice(0, 11) })}
              />
            </div>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={form.delivery} onChange={setField('delivery')} />
              For delivery
            </label>
            {form.delivery && <input placeholder="Delivery address" value={form.address} onChange={setField('address')} />}

            <div>
              <span className={LABEL}>Payment</span>
              <div className="flex gap-2">
                <button className={choice(form.payment === 'cash')} onClick={() => setForm({ ...form, payment: 'cash' })}>
                  Cash
                </button>
                <button
                  className={choice(form.payment === 'gcash')}
                  onClick={() => setForm({ ...form, payment: 'gcash', cash: '' })}
                >
                  GCash
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className={LABEL}>Discount (₱)</span>
                <input className="w-full box-border" inputMode="decimal" value={form.discount} onChange={setField('discount')} />
              </label>
              {form.payment === 'cash' && (
                <label>
                  <span className={LABEL}>Cash received (₱)</span>
                  <input className="w-full box-border" inputMode="decimal" value={form.cash} onChange={setField('cash')} />
                </label>
              )}
            </div>
            <input placeholder="Expenses (optional), e.g. gas 70 food 50" value={form.remarks} onChange={setField('remarks')} />

            <div className="border-t border-(color:--border) pt-3 text-[15px]">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{peso(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>−{peso(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-semibold">
                <span>Total</span>
                <span>{peso(total)}</span>
              </div>
              {form.payment === 'cash' && form.cash !== '' && (
                <div className={`flex justify-between ${cashShort ? 'text-brand-red' : 'text-brand-pine'}`}>
                  <span>{cashShort ? 'Short' : 'Change'}</span>
                  <span>{peso(Math.abs(cash - total))}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                className="border border-(color:--border) bg-white text-brand-pine"
                onClick={clearSale}
                disabled={saving || (cart.length === 0 && form === EMPTY_FORM)}
              >
                Clear
              </button>
              <button className="flex-1 bg-brand-pine py-3 text-[16px]" onClick={submit} disabled={saving || cart.length === 0}>
                {saving ? 'Saving…' : `Charge ${peso(total)}`}
              </button>
            </div>
          </aside>
        </div>
      )}

      {receipt && <Receipt sale={receipt} branch={branch} cashier={fullName} onClose={() => setReceipt(null)} />}
    </PosLayout>
  )
}
