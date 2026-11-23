import { useState } from 'react'
import { choosePrinter, forgetPrinter, reconnect } from '../lib/printer'
import { usePrinter } from '../lib/usePrinter'
import { alertDialog, confirmDialog } from '../lib/dialogs'

const KIND_LABEL = { bluetooth: 'Bluetooth', usb: 'USB cable (OTG)' }

// "Connect printer": pairs the receipt printer once (Bluetooth, or USB / OTG cord);
// receipts then print straight to it
export default function PrinterButton() {
  const printer = usePrinter()
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false) // showing the Bluetooth / USB choice
  if (!printer.supported) return null // e.g. iPhone: receipts use the browser's print window

  const kinds = ['bluetooth', 'usb'].filter((k) => printer[k])

  const connect = async (kind) => {
    setPicking(false)
    setBusy(true)
    try {
      await choosePrinter(kind)
    } catch (e) {
      // closing the device list without choosing is not an error
      if (e.name !== 'NotFoundError') await alertDialog(e.message, 'Printer not connected')
    } finally {
      setBusy(false)
    }
  }

  const click = async () => {
    if (printer.connected) {
      if (await confirmDialog(`Disconnect the printer "${printer.name}"?`)) forgetPrinter()
      return
    }
    if (picking) return setPicking(false)
    if (printer.name) {
      // the printer used before: reconnect without asking
      setBusy(true)
      const ok = await reconnect()
      setBusy(false)
      if (ok) return
      if (printer.kind && printer[printer.kind] && kinds.length === 1) return connect(printer.kind)
    }
    if (kinds.length === 1) return connect(kinds[0])
    setPicking(true)
  }

  const btn = 'min-h-0 rounded-lg border px-3 py-1 text-[14px]'
  return (
    <div className="relative">
      <button
        className={`${btn} ${
          printer.connected
            ? 'border-brand-pine bg-brand-light text-brand-pine'
            : 'border-(color:--border) bg-white font-medium text-gray-600'
        }`}
        onClick={click}
        disabled={busy}
        title={printer.connected ? 'Receipts print straight to this printer. Click to disconnect.' : 'Connect the receipt printer'}
      >
        {busy
          ? 'Connecting…'
          : printer.connected
            ? `🖨 ${printer.name || 'Printer'}${printer.kind === 'usb' ? ' (USB)' : ''}`
            : printer.name
              ? `Reconnect ${printer.name}`
              : 'Connect printer'}
      </button>
      {picking && (
        <div className="absolute right-0 z-20 mt-1 flex w-56 flex-col gap-1 rounded-lg border border-(color:--border) bg-white p-2 shadow-lg">
          <div className="px-1 text-[13px] text-gray-500">How is the printer connected?</div>
          {kinds.map((k) => (
            <button key={k} className={`${btn} border-(color:--border) bg-white text-left text-brand-pine`} onClick={() => connect(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
          {printer.usb && (
            <div className="px-1 text-[12px] text-gray-500">For USB: plug the printer in with the OTG cord first.</div>
          )}
        </div>
      )}
    </div>
  )
}
