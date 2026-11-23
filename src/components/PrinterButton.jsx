import { useState } from 'react'
import { choosePrinter, forgetPrinter, reconnect, testPrint, pickChannel } from '../lib/printer'
import { usePrinter } from '../lib/usePrinter'
import { alertDialog, confirmDialog } from '../lib/dialogs'

const KIND_LABEL = { bluetooth: 'Bluetooth', usb: 'USB cable (OTG)' }

// "Connect printer": pairs the receipt printer once (Bluetooth, or USB / OTG cord);
// receipts then print straight to it
export default function PrinterButton() {
  const printer = usePrinter()
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false) // showing the Bluetooth / USB choice
  const [menu, setMenu] = useState(false) // connected: Test print / Disconnect
  if (!printer.supported) return null // e.g. iPhone: receipts use the browser's print window

  const kinds = ['bluetooth', 'usb'].filter((k) => printer[k])

  const connect = async (kind) => {
    setPicking(false)
    setBusy(true)
    try {
      await choosePrinter(kind)
    } catch (e) {
      // closing the device list without choosing is not an error
      if (e.name !== 'NotFoundError' || kind === 'usb')
        await alertDialog(`${e.message} (${e.name})`, 'Printer not connected')
    } finally {
      setBusy(false)
    }
  }

  const click = async () => {
    if (printer.connected) return setMenu(!menu)
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

  const test = async () => {
    setMenu(false)
    setBusy(true)
    try {
      const info = await testPrint()
      setBusy(false)
      if (info.length === 1 && info[0].startsWith('USB')) return
      const n = window.prompt(`Which TEST number printed? Leave empty if none.\n\n${info.join('\n')}`)
      if (n && pickChannel(Number(n))) return alertDialog(`Receipts will use channel ${n}.`, 'Printer set')
      if (!n) await alertDialog(`Nothing printed. Please send this to support:\n\n${printer.name}\n${info.join('\n')}`, 'Printer details')
    } catch (e) {
      await alertDialog(`${e.message} (${e.name})`, 'Test print failed')
    } finally {
      setBusy(false)
    }
  }
  const disconnect = async () => {
    setMenu(false)
    if (await confirmDialog(`Disconnect the printer "${printer.name}"?`)) forgetPrinter()
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
      {menu && printer.connected && (
        <div className="absolute right-0 z-20 mt-1 flex w-56 flex-col gap-1 rounded-lg border border-(color:--border) bg-white p-2 shadow-lg">
          <button className={`${btn} border-(color:--border) bg-white text-left text-brand-pine`} onClick={test}>
            Test print
          </button>
          <button className={`${btn} border-(color:--border) bg-white text-left text-red-600`} onClick={disconnect}>
            Disconnect
          </button>
        </div>
      )}
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
