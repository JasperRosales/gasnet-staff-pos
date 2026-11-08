import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { liveRefresher } from '../lib/lazyData'
import { peso } from '../lib/money'
import { branchName } from '../lib/branches'
import { loadProducts, loadTodaySales } from '../lib/pos'

function status(p) {
  if (p.stock <= 0) return { text: 'Out of stock', cls: 'bg-red-100 text-brand-red' }
  if (p.stock <= p.low) return { text: 'Low stock', cls: 'bg-amber-100 text-amber-800' }
  return { text: 'In stock', cls: 'bg-brand-light text-brand-pine' }
}

// stock per size plus how many were sold today
async function inventoryRows(branch) {
  const [products, sales] = await Promise.all([loadProducts(branch), loadTodaySales(branch)])
  const sold = {}
  for (const s of sales) {
    if (s.voided) continue
    for (const l of s.lines) sold[l.size] = (sold[l.size] || 0) + l.qty
  }
  return products.map((p) => ({ ...p, soldToday: sold[p.size] || 0 }))
}

// This branch's cylinder stock (read-only), updated live as sales and restocks happen
export default function Inventory({ branch }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)

  const show = useCallback((list) => {
    setRows(list)
    setUpdatedAt(new Date())
    setError('')
  }, [])
  const refresh = useCallback(() => inventoryRows(branch).then(show, (e) => setError(e.message)), [branch, show])

  useEffect(() => {
    let live = true
    inventoryRows(branch).then(
      (list) => live && (setRows(list), setUpdatedAt(new Date()), setError('')),
      (e) => live && setError(e.message),
    )
    // a burst of changes (one sale = several rows) reloads once; nothing while the tab is hidden
    const liveUpdates = liveRefresher(refresh)
    const channel = supabase
      .channel(`pos-inventory-${branch}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock', filter: `branch=eq.${branch}` },
        liveUpdates.trigger,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch=eq.${branch}` },
        liveUpdates.trigger,
      )
      .subscribe()
    return () => {
      live = false
      liveUpdates.stop()
      supabase.removeChannel(channel)
    }
  }, [branch, refresh])

  if (error) return <p className="text-brand-red">Could not load inventory: {error}</p>
  if (!rows) return <p className="text-gray-500">Loading...</p>

  const totalStock = rows.reduce((t, r) => t + r.stock, 0)
  const totalValue = rows.reduce((t, r) => t + r.stock * r.price, 0)
  const needRestock = rows.filter((r) => r.stock <= r.low).length

  const tiles = [
    { label: 'Cylinders on hand', value: totalStock.toLocaleString('en-PH') },
    { label: 'Stock value', value: peso(totalValue) },
    { label: 'Sold today', value: rows.reduce((t, r) => t + r.soldToday, 0) },
    { label: 'Need restock', value: needRestock, warn: needRestock > 0 },
  ]

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="m-0 text-xl">Inventory · {branchName(branch)} branch</h2>
          <p className="m-0 text-[14px] text-gray-500">
            Updates live · last checked {updatedAt?.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <button
          className="border border-(color:--border) bg-white text-brand-pine hover:bg-brand-light"
          onClick={refresh}
        >
          Refresh
        </button>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-(color:--border) bg-white p-4">
            <div className="text-[14px] text-gray-500">{t.label}</div>
            <div className={`text-2xl font-bold tabular-nums ${t.warn ? 'text-brand-red' : 'text-gray-900'}`}>
              {t.value}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead>
            <tr>
              <th className="px-3 py-2.5 text-left">Size</th>
              <th className="px-3 py-2.5 text-right">Price</th>
              <th className="px-3 py-2.5 text-right">On hand</th>
              <th className="px-3 py-2.5 text-right">Sold today</th>
              <th className="px-3 py-2.5 text-right">Low-stock level</th>
              <th className="px-3 py-2.5 text-right">Value</th>
              <th className="px-3 py-2.5 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = status(r)
              return (
                <tr key={r.size}>
                  <td className="px-3 py-2.5 font-semibold">{r.size}</td>
                  <td className="px-3 py-2.5 text-right">{peso(r.price)}</td>
                  <td className="px-3 py-2.5 text-right text-[16px] font-semibold">{r.stock}</td>
                  <td className="px-3 py-2.5 text-right">{r.soldToday}</td>
                  <td className="px-3 py-2.5 text-right">{r.low}</td>
                  <td className="px-3 py-2.5 text-right">{peso(r.stock * r.price)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${s.cls}`}>{s.text}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[14px] text-gray-500">
        Stock goes down with each sale and back up when a sale is voided.
      </p>
    </div>
  )
}
