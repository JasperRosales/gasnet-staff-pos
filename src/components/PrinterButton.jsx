import { useState } from 'react'
import { choosePrinter, forgetPrinter, reconnect } from '../lib/btPrinter'
import { usePrinter } from '../lib/usePrinter'
import { alertDialog, confirmDialog } from '../lib/dialogs'

// "Connect printer": pairs the Bluetooth receipt printer once; receipts then print straight to it
export default function PrinterButton() {
  const printer = usePrinter()
  const [busy, setBusy] = useState(false)
  if (!printer.supported) return null // e.g. iPhone: receipts use the browser's print window

  const click = async () => {
    if (printer.connected) {
      if (await confirmDialog(`Disconnect the printer "${printer.name}"?`)) forgetPrinter()
      return
    }
    setBusy(true)
    try {
      // the printer used before: reconnect without asking; otherwise choose it from the list
      if (!(await reconnect())) await choosePrinter()
    } catch (e) {
      // closing the Bluetooth list without choosing is not an error
      if (e.name !== 'NotFoundError') await alertDialog(e.message, 'Printer not connected')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className={`min-h-0 rounded-lg border px-3 py-1 text-[14px] ${
        printer.connected
          ? 'border-brand-pine bg-brand-light text-brand-pine'
          : 'border-(color:--border) bg-white font-medium text-gray-600'
      }`}
      onClick={click}
      disabled={busy}
      title={printer.connected ? 'Receipts print straight to this printer. Click to disconnect.' : 'Pair the Bluetooth receipt printer'}
    >
      {busy ? 'Connecting…' : printer.connected ? `🖨 ${printer.name || 'Printer'}` : printer.name ? `Reconnect ${printer.name}` : 'Connect printer'}
    </button>
  )
}
