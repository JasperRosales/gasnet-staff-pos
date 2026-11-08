import { useEffect } from 'react'
import Modal from './Modal'
import { peso } from '../lib/money'
import { branchName } from '../lib/branches'

// The receipt after a sale: Print sends only the receipt to the printer.
// autoPrint: opens the print window right away and closes the receipt when printing is done.
export default function Receipt({ sale, branch, cashier, onClose, autoPrint = false }) {
  const time = new Date(sale.time)

  useEffect(() => {
    if (!autoPrint) return
    const done = () => onClose()
    window.addEventListener('afterprint', done)
    // wait a moment so the logo is loaded before printing
    const t = setTimeout(() => window.print(), 300)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [autoPrint, onClose])

  return (
    <Modal onClose={onClose}>
      <div className="print-receipt font-mono text-[13px] text-gray-900">
        <div className="text-center">
          <img src="/cjg-logo.png" alt="CJG" className="mx-auto mb-1 h-12 w-auto" />
          <div className="font-semibold">{branchName(branch)} branch</div>
          <div>{time.toLocaleString('en-PH')}</div>
          <div className="text-[11px] text-gray-500">Ref {sale.groupId.slice(0, 8).toUpperCase()}</div>
          {sale.reprint && <div className="font-semibold">*** REPRINT ***</div>}
        </div>
        <hr className="my-2 border-dashed" />
        {sale.lines.map((l) => (
          <div key={l.size} className="flex justify-between">
            <span>
              {l.size} × {l.qty} @ {peso(l.unitPrice)}
            </span>
            <span>{peso(l.unitPrice * l.qty)}</span>
          </div>
        ))}
        <hr className="my-2 border-dashed" />
        {sale.discount > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>−{peso(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-[15px] font-bold">
          <span>TOTAL</span>
          <span>{peso(sale.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid by</span>
          <span>{sale.payment === 'gcash' ? 'GCash' : 'Cash'}</span>
        </div>
        {sale.payment === 'cash' && sale.cash > 0 && (
          <>
            <div className="flex justify-between">
              <span>Cash</span>
              <span>{peso(sale.cash)}</span>
            </div>
            <div className="flex justify-between">
              <span>Change</span>
              <span>{peso(sale.cash - sale.total)}</span>
            </div>
          </>
        )}
        <hr className="my-2 border-dashed" />
        <div>Customer: {sale.customerName || 'Walk-in'}</div>
        {sale.delivery && <div>For delivery: {sale.address}</div>}
        <div>Cashier: {cashier}</div>
        <div className="mt-2 text-center">Thank you!</div>
      </div>

      <div className="no-print mt-5 flex justify-end gap-2">
        <button className="border border-(color:--border) bg-white text-brand-pine" onClick={onClose}>
          {sale.reprint ? 'Close' : 'New sale'}
        </button>
        <button className="bg-brand-pine" onClick={() => window.print()}>
          Print
        </button>
      </div>
    </Modal>
  )
}
