import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { liveRefresher } from '../lib/lazyData'
import { peso } from '../lib/money'
import { loadTodaySales, voidSale } from '../lib/pos'
import { confirmDialog, alertDialog } from '../lib/dialogs'

// Today's walk-in sales at this branch. Void puts the cylinders back in stock.
export default function TodaySales({ branch, onChange, onReprint }) {
  const [sales, setSales] = useState(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setSales(await loadTodaySales(branch))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [branch])

  useEffect(() => {
    let live = true
    loadTodaySales(branch).then(
      (list) => live && (setSales(list), setError('')),
      (e) => live && setError(e.message),
    )
    // a burst of changes (one sale = several rows) reloads once; nothing while the tab is hidden
    const liveUpdates = liveRefresher(refresh)
    const channel = supabase
      .channel(`pos-orders-${branch}`)
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

  const doVoid = async (s) => {
    if (!(await confirmDialog(`Void this ${peso(s.total)} sale? The cylinders go back into stock.`))) return
    try {
      await voidSale(s.groupId)
    } catch (e) {
      await alertDialog(e.message, 'Could not void')
    }
    refresh()
    onChange()
  }

  if (error) return <p className="text-brand-red">Could not load sales: {error}</p>
  if (!sales) return <p className="text-gray-500">Loading...</p>

  const done = sales.filter((s) => !s.voided)
  const cashTotal = done.filter((s) => !s.gcash).reduce((t, s) => t + s.total, 0)
  const gcashTotal = done.filter((s) => s.gcash).reduce((t, s) => t + s.total, 0)
  const cylinders = done.reduce((t, s) => t + s.lines.reduce((n, l) => n + l.qty, 0), 0)

  const tiles = [
    { label: 'Sales', value: done.length },
    { label: 'Cylinders sold', value: cylinders },
    { label: 'Cash', value: peso(cashTotal) },
    { label: 'GCash', value: peso(gcashTotal) },
    { label: 'Total', value: peso(cashTotal + gcashTotal) },
  ]

  return (
    <div>
      <h2 className="mt-0 text-xl">Today's sales</h2>
      <div className="mb-5 grid grid-cols-5 gap-3 max-[900px]:grid-cols-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-(color:--border) bg-white p-4">
            <div className="text-[14px] text-gray-500">{t.label}</div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>

      {sales.length === 0 ? (
        <p className="text-gray-500">No sales yet today.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead>
              <tr>
                <th className="px-3 py-2.5 text-left">Time</th>
                <th className="px-3 py-2.5 text-left">Items</th>
                <th className="px-3 py-2.5 text-left">Customer</th>
                <th className="px-3 py-2.5 text-left">Paid</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.groupId ?? s.time} className={s.voided ? 'text-gray-400 line-through' : ''}>
                  <td className="px-3 py-2.5">
                    {new Date(s.time).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-2.5">{s.lines.map((l) => `${l.size} × ${l.qty}`).join(', ')}</td>
                  <td className="px-3 py-2.5">
                    {s.customer}
                    {s.customerType === 'commercial' && ' (commercial)'}
                    {s.delivery && ' · delivery'}
                  </td>
                  <td className="px-3 py-2.5">{s.gcash ? 'GCash' : 'Cash'}</td>
                  <td className="px-3 py-2.5 text-right">{peso(s.total)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {s.voided ? (
                      <span className="no-underline">Voided</span>
                    ) : (
                      s.groupId && (
                        <div className="flex justify-end gap-2">
                          <button
                            className="min-h-9 border border-(color:--border) bg-white px-3 py-1 text-[14px] text-brand-pine hover:bg-brand-light"
                            onClick={() =>
                              onReprint({
                                groupId: s.groupId,
                                time: s.time,
                                lines: s.lines,
                                discount: s.discount,
                                total: s.total,
                                payment: s.gcash ? 'gcash' : 'cash',
                                cash: 0,
                                customerName: s.customer,
                                delivery: s.delivery,
                                address: s.address,
                              })
                            }
                          >
                            Reprint
                          </button>
                          <button
                            className="min-h-9 border border-red-200 bg-white px-3 py-1 text-[14px] text-brand-red hover:bg-red-50"
                            onClick={() => doVoid(s)}
                          >
                            Void
                          </button>
                        </div>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
