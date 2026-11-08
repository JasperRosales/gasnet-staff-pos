import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { peso } from '../lib/money'
import { loadProducts, checkout } from '../lib/pos'
import { confirmDialog, alertDialog } from '../lib/dialogs'
import PosLayout from '../components/PosLayout'
import { getPrintMode, savePrintMode } from '../lib/printSettings'
import { liveRefresher } from '../lib/lazyData'

// downloaded only when first opened
const Receipt = lazy(() => import('../components/Receipt'))
const TodaySales = lazy(() => import('./TodaySales'))
const Inventory = lazy(() => import('./Inventory'))
const LOADING = <p className="text-gray-500">Loading...</p>

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

const CARD = 'rounded-xl border border-(color:--border) bg-white'
const LABEL = 'mb-1.5 block text-[14px] font-semibold text-gray-700'
const STEP =
  'grid size-9 min-h-0 place-items-center rounded-lg border border-(color:--border) bg-white p-0 text-lg text-brand-pine hover:bg-brand-light'
const choice = (on) =>
  `flex-1 rounded-lg border px-3 py-2 text-[15px] hover:opacity-100 ${
    on
      ? 'border-brand-pine bg-brand-light text-brand-pine ring-1 ring-brand-pine'
      : 'border-(color:--border) bg-white font-medium text-gray-600 hover:border-gray-400'
  }`

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
  const [printMode, setPrintMode] = useState(getPrintMode) // 'auto' | 'manual'

  const changePrintMode = (mode) => {
    setPrintMode(mode)
    savePrintMode(mode)
  }
  const closeReceipt = useCallback(() => setReceipt(null), [])

  const refresh = useCallback(async () => {
    try {
      setProducts(await loadProducts(branch))
      setLoadError('')
    } catch (e) {
      setLoadError(e.message)
    }
  }, [branch])

  useEffect(() => {
    let live = true
    loadProducts(branch)
      .then((list) => live && (setProducts(list), setLoadError('')))
      .catch((e) => live && setLoadError(e.message))
    return () => {
      live = false
    }
  }, [branch])

  // stock changes from other cashiers or the admin show up right away
  // (only while the Register is open: the other tabs load their own data)
  const firstOpen = useRef(true)
  useEffect(() => {
    if (tab !== 'register') return
    // a burst of stock changes reloads once; nothing reloads while the tab is hidden
    const live = liveRefresher(refresh)
    if (firstOpen.current) firstOpen.current = false
    else live.trigger() // back on the Register: catch up on what changed meanwhile
    const channel = supabase
      .channel(`pos-stock-${branch}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock', filter: `branch=eq.${branch}` },
        live.trigger,
      )
      .subscribe()
    return () => {
      live.stop()
      supabase.removeChannel(channel)
    }
  }, [branch, refresh, tab])

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
        autoPrint: printMode === 'auto',
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
      <Suspense fallback={LOADING}>
        {tab === 'today' ? (
          <TodaySales branch={branch} onChange={refresh} onReprint={(sale) => setReceipt({ ...sale, reprint: true })} />
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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                {products.map((p) => {
                  const badge = stockBadge(p)
                  const inCart = qtyInCart(p.size)
                  const canAdd = inCart < p.stock
                  return (
                    <button
                      key={p.size}
                      disabled={!canAdd}
                      onClick={() => setQty(p.size, inCart + 1)}
                      className={`relative flex flex-col items-start gap-1.5 rounded-xl border bg-white p-4 text-left font-normal text-(--text) hover:border-brand-pine hover:opacity-100 ${
                        inCart > 0
                          ? 'border-brand-pine bg-brand-light/40 ring-1 ring-brand-pine'
                          : 'border-(color:--border)'
                      }`}
                    >
                      {inCart > 0 && (
                        <span className="absolute top-3 right-3 grid size-7 place-items-center rounded-full bg-brand-pine text-[14px] font-bold text-white">
                          {inCart}
                        </span>
                      )}
                      <img src="/login-tanks.png" alt="" className="mb-1 h-14 w-auto object-contain" />
                      <span className="text-[26px] leading-none font-bold">{p.size}</span>
                      <span className="text-[17px] font-semibold text-gray-700 tabular-nums">{peso(p.price)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Cart and payment */}
            <aside className={`${CARD} flex flex-col gap-4 self-start p-5`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 text-xl">Current sale</h2>
                <div className="flex items-center gap-2" title="Auto prints the receipt right after each sale">
                  <span className="text-[14px] text-gray-500">Receipt</span>
                  <div className="flex rounded-lg border border-(color:--border) bg-gray-50 p-0.5">
                    {['auto', 'manual'].map((m) => (
                      <button
                        key={m}
                        aria-pressed={printMode === m}
                        className={`min-h-0 rounded-md px-3 py-1 text-[14px] capitalize ${
                          printMode === m
                            ? 'bg-white text-brand-pine shadow-sm'
                            : 'bg-transparent font-medium text-gray-500'
                        }`}
                        onClick={() => changePrintMode(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {lines.length === 0 ? (
                <p className="m-0 rounded-lg border border-dashed border-(color:--border) p-4 text-center text-[15px] text-gray-500">
                  Tap a cylinder to add it to the sale.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col divide-y divide-(--border) p-0">
                  {lines.map((l) => (
                    <li key={l.size} className="flex items-center gap-2 py-2">
                      <div className="flex-1">
                        <div className="font-semibold">{l.size}</div>
                        <div className="text-[14px] whitespace-nowrap text-gray-500">{peso(l.price)} each</div>
                      </div>
                      <button
                        className={STEP}
                        onClick={() => setQty(l.size, l.qty - 1)}
                        aria-label={`One less ${l.size}`}
                      >
                        −
                      </button>
                      <span className="w-7 text-center text-[17px] font-semibold tabular-nums">{l.qty}</span>
                      <button
                        className={STEP}
                        onClick={() => setQty(l.size, l.qty + 1)}
                        disabled={l.qty >= (productOf(l.size)?.stock ?? 0)}
                        aria-label={`One more ${l.size}`}
                      >
                        +
                      </button>
                      <span className="w-28 text-right font-semibold tabular-nums">{peso(l.price * l.qty)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <span className={LABEL}>Customer</span>
                <div className="flex gap-2">
                  <button
                    className={choice(form.customerType === '')}
                    onClick={() => setForm({ ...form, customerType: '' })}
                  >
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
                <label>
                  <span className={LABEL}>Name</span>
                  <input
                    className="w-full"
                    placeholder="Optional"
                    value={form.customerName}
                    onChange={setField('customerName')}
                  />
                </label>
                <label>
                  <span className={LABEL}>Contact</span>
                  <input
                    className="w-full"
                    placeholder="09XXXXXXXXX"
                    inputMode="numeric"
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2.5 text-[15px]">
                <input type="checkbox" checked={form.delivery} onChange={setField('delivery')} />
                For delivery
              </label>
              {form.delivery && (
                <label>
                  <span className={LABEL}>Delivery address</span>
                  <input className="w-full" value={form.address} onChange={setField('address')} />
                </label>
              )}

              <div>
                <span className={LABEL}>Payment</span>
                <div className="flex gap-2">
                  <button
                    className={choice(form.payment === 'cash')}
                    onClick={() => setForm({ ...form, payment: 'cash' })}
                  >
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
                  <input
                    className="w-full box-border"
                    inputMode="decimal"
                    value={form.discount}
                    onChange={setField('discount')}
                  />
                </label>
                {form.payment === 'cash' && (
                  <label>
                    <span className={LABEL}>Cash received (₱)</span>
                    <input className="w-full" inputMode="decimal" value={form.cash} onChange={setField('cash')} />
                  </label>
                )}
              </div>
              <label>
                <span className={LABEL}>Expenses</span>
                <input
                  className="w-full"
                  placeholder="Optional, e.g. gas 70 food 50"
                  value={form.remarks}
                  onChange={setField('remarks')}
                />
              </label>

              <div className="flex flex-col gap-1 border-t border-(color:--border) pt-4 text-[15px] tabular-nums">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{peso(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Discount</span>
                    <span>−{peso(discount)}</span>
                  </div>
                )}
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[17px] font-semibold">Total</span>
                  <span className="text-[30px] leading-tight font-bold">{peso(total)}</span>
                </div>
                {form.payment === 'cash' && form.cash !== '' && (
                  <div
                    className={`flex justify-between rounded-lg px-3 py-2 text-[17px] font-semibold ${
                      cashShort ? 'bg-red-50 text-brand-red' : 'bg-brand-light text-brand-pine'
                    }`}
                  >
                    <span>{cashShort ? 'Short' : 'Change'}</span>
                    <span>{peso(Math.abs(cash - total))}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  className="border border-(color:--border) bg-white px-5 text-gray-700"
                  onClick={clearSale}
                  disabled={saving || (cart.length === 0 && form === EMPTY_FORM)}
                >
                  Clear
                </button>
                <button
                  className="min-h-[52px] flex-1 bg-brand-pine text-[17px]"
                  onClick={submit}
                  disabled={saving || cart.length === 0}
                >
                  {saving ? 'Saving…' : `Charge ${peso(total)}`}
                </button>
              </div>
            </aside>
          </div>
        )}
      </Suspense>

      {receipt && (
        <Suspense fallback={null}>
          <Receipt
            sale={receipt}
            branch={branch}
            cashier={fullName}
            autoPrint={Boolean(receipt.autoPrint)}
            onClose={closeReceipt}
          />
        </Suspense>
      )}
    </PosLayout>
  )
}
