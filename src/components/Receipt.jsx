import { useCallback, useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { peso } from '../lib/money'
import { branchName } from '../lib/branches'
import { printReceipt } from '../lib/printer'
import { usePrinter } from '../lib/usePrinter'

// The receipt after a sale. Print sends it straight to the Bluetooth / USB printer when one was
// connected (no print window); otherwise to the browser's print window (only the receipt prints).
// autoPrint: prints right away and closes the receipt when printing is done.
export default function Receipt({ sale, branch, cashier, onClose, autoPrint = false }) {
  const time = new Date(sale.time)
  const printer = usePrinter()
  // a printer was paired on this device: print to it (it reconnects if it was switched off)
  const useBluetooth = printer.supported && Boolean(printer.name)
  const [status, setStatus] = useState('') // '', 'printing', or an error message

  const printBluetooth = useCallback(async () => {
    setStatus('printing')
    try {
      await printReceipt({ sale, branch: branchName(branch), cashier })
      setStatus('')
      return true
    } catch (e) {
      setStatus(e.message)
      return false
    }
  }, [sale, branch, cashier])

  const print = () => (useBluetooth ? printBluetooth() : window.print())

  // auto print when the receipt opens (once: a Bluetooth job must not be sent twice)
  const autoSent = useRef(false)
  useEffect(() => {
    if (!autoPrint) return
    if (useBluetooth) {
      if (autoSent.current) return
      autoSent.current = true
      printBluetooth().then((ok) => ok && onClose()) // on failure the receipt stays open to retry
      return
    }
    const done = () => onClose()
    window.addEventListener('afterprint', done)
    // wait a moment so the logo is loaded before printing
    const t = setTimeout(() => window.print(), 300)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [autoPrint, onClose, useBluetooth, printBluetooth])

  return (
    <Modal onClose={onClose}>
      <div className="print-receipt font-mono text-[13px] text-gray-900">
        <div className="text-center">
          {/* the logo is white (made for the green header): brightness-0 makes it black for paper */}
          <img src="/cjg-logo-bar.png" alt="CJG" className="mx-auto mb-2 block h-auto w-48 brightness-0" />
          <div className="font-semibold">{branchName(branch)} branch</div>
          <div>{time.toLocaleString('en-PH')}</div>
          <div className="text-[11px] text-gray-500">Ref {sale.groupId.slice(0, 8).toUpperCase()}</div>
          {sale.reprint && <div className="font-semibold">*** REPRINT ***</div>}
        </div>
        <hr className="my-2 border-dashed" />
        {sale.lines.map((l) => (
          // two lines so it fits a 58mm roll: "11kg × 2   ₱2,570.00", then "@ ₱1,285.00 each"
          <div key={l.size}>
            <div className="flex justify-between">
              <span>
                {l.size} × {l.qty}
              </span>
              <span>{peso(l.unitPrice * l.qty)}</span>
            </div>
            <div className="text-[0.9em] text-gray-600">@ {peso(l.unitPrice)} each</div>
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
        <div>
          Customer:{' '}
          {sale.customerType === 'commercial'
            ? `Commercial${sale.customerName ? ` (${sale.customerName})` : ''}`
            : sale.customerName || 'Walk-in'}
        </div>
        {sale.delivery && <div>For delivery: {sale.address}</div>}
        <div>Cashier: {cashier}</div>
        <div className="mt-2 text-center">Thank you!</div>
      </div>

      {status && (
        <p className={`no-print mt-4 mb-0 text-[14px] ${status === 'printing' ? 'text-gray-600' : 'text-brand-red'}`}>
          {status === 'printing' ? 'Printing…' : status}
        </p>
      )}
      <div className="no-print mt-5 flex justify-end gap-2">
        <button className="border border-(color:--border) bg-white text-brand-pine" onClick={onClose}>
          {sale.reprint ? 'Close' : 'New sale'}
        </button>
        <button className="bg-brand-pine" onClick={print} disabled={status === 'printing'}>
          {status === 'printing' ? 'Printing…' : 'Print'}
        </button>
      </div>
    </Modal>
  )
}
