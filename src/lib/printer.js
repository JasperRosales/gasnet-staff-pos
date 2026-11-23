// Prints receipts straight to a thermal printer from the browser, with no printer app:
// - Bluetooth (Web Bluetooth): Chrome / Edge on Android, Windows, Mac and Linux
// - USB cable, e.g. an OTG cord on an Android phone or tablet (WebUSB): Chrome / Edge
// Neither works on iPhone.
import { LOGO_DOTS, rasterImage, receiptBytes, receiptLines } from './escpos'
import { peso } from './money'

// The Bluetooth services cheap 58mm ESC/POS printers use to receive print data
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
]
const SAVED_KEY = 'gasnet-pos-bt-printer' // { kind: 'bluetooth' | 'usb', name } (older: just the name)
const BT_CHUNK = 100 // bytes sent at a time over Bluetooth
const USB_CHUNK = 4096

export const bluetoothSupported = () => typeof navigator !== 'undefined' && Boolean(navigator.bluetooth)
export const usbSupported = () => typeof navigator !== 'undefined' && Boolean(navigator.usb)

// the connected printer: { kind, name, device, send(bytes), close() }
let printer = null
let lastDevice = null // the device chosen this session, to reconnect to
const listeners = new Set()

function saved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    if (!raw) return null
    return raw.startsWith('{') ? JSON.parse(raw) : { kind: 'bluetooth', name: raw }
  } catch {
    return null
  }
}
function save(kind, name) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify({ kind, name }))
  } catch {
    // storage blocked
  }
}

// { supported, bluetooth, usb, connected, name, kind }: what the printer button shows
export function printerState() {
  const s = saved()
  const bluetooth = bluetoothSupported()
  const usb = usbSupported()
  return {
    supported: bluetooth || usb,
    bluetooth,
    usb,
    connected: Boolean(printer),
    name: printer?.name || s?.name || null,
    kind: printer?.kind || s?.kind || null,
  }
}
export function onPrinterChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const changed = () => listeners.forEach((fn) => fn(printerState()))
const dropped = (device) => {
  if (printer?.device !== device) return
  printer = null
  changed()
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- Bluetooth ----

async function findChannel(server) {
  const services = await server.getPrimaryServices()
  for (const s of services) {
    const chars = await s.getCharacteristics().catch(() => [])
    const c = chars.find((ch) => ch.properties.writeWithoutResponse || ch.properties.write)
    if (c) return c
  }
  throw new Error('This Bluetooth device does not accept print data. Is it a thermal printer?')
}

async function openBluetooth(d) {
  const server = await d.gatt.connect()
  const channel = await findChannel(server)
  const noReply = channel.properties.writeWithoutResponse
  if (!d.__gasnetWatch) {
    d.__gasnetWatch = true
    d.addEventListener('gattserverdisconnected', () => dropped(d))
  }
  printer = {
    kind: 'bluetooth',
    name: d.name || 'Printer',
    device: d,
    async send(bytes) {
      for (let i = 0; i < bytes.length; i += BT_CHUNK) {
        const part = bytes.slice(i, i + BT_CHUNK)
        if (noReply) {
          await channel.writeValueWithoutResponse(part)
          await wait(20) // let the printer's small buffer keep up
        } else {
          await channel.writeValueWithResponse(part)
        }
      }
    },
    close: () => d.gatt?.disconnect(),
  }
  lastDevice = d
  save('bluetooth', printer.name)
  changed()
}

// ---- USB (OTG cord) ----

// the interface + bulk OUT endpoint print data goes to: the USB printer class (7) first
function findUsbOut(d) {
  const alts = d.configuration.interfaces.map((i) => i.alternate)
  const ordered = [...alts.filter((a) => a.interfaceClass === 7), ...alts.filter((a) => a.interfaceClass !== 7)]
  for (const a of ordered) {
    const ep = a.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')
    if (ep) return { iface: d.configuration.interfaces.find((i) => i.alternate === a), alt: a, ep }
  }
  throw new Error('This USB device does not accept print data. Is it a thermal printer?')
}

async function openUsb(d) {
  if (!d.opened) await d.open()
  if (!d.configuration) await d.selectConfiguration(1)
  const { iface, alt, ep } = findUsbOut(d)
  if (!iface.claimed) {
    try {
      await d.claimInterface(iface.interfaceNumber)
    } catch {
      throw new Error('The printer is busy (another app may be using it). Close other printer apps and try again.')
    }
  }
  if (iface.alternates.length > 1) await d.selectAlternateInterface(iface.interfaceNumber, alt.alternateSetting)
  printer = {
    kind: 'usb',
    name: d.productName || d.manufacturerName || 'USB printer',
    device: d,
    async send(bytes) {
      for (let i = 0; i < bytes.length; i += USB_CHUNK) {
        const r = await d.transferOut(ep.endpointNumber, bytes.slice(i, i + USB_CHUNK))
        if (r.status !== 'ok') throw new Error(`USB write ${r.status}`)
      }
    },
    close: () => d.close().catch(() => {}),
  }
  lastDevice = d
  save('usb', printer.name)
  changed()
}

if (usbSupported()) navigator.usb.addEventListener('disconnect', (e) => dropped(e.device))

// ---- choosing / reconnecting ----

const NO_SUPPORT = {
  bluetooth: 'This browser cannot use Bluetooth. Please use Chrome or Edge (not available on iPhone).',
  usb: 'This browser cannot use USB printers. Please use Chrome or Edge (not available on iPhone).',
}

// Opens the browser's list to choose the printer (must run from a button press).
// kind: 'bluetooth' or 'usb' (USB: plug the printer in first, e.g. with an OTG cord)
export async function choosePrinter(kind = 'bluetooth') {
  if (kind === 'usb') {
    if (!usbSupported()) throw new Error(NO_SUPPORT.usb)
    // no filter: many cheap printers do not report the USB printer class
    const d = await navigator.usb.requestDevice({ filters: [] })
    return openUsb(d)
  }
  if (!bluetoothSupported()) throw new Error(NO_SUPPORT.bluetooth)
  const d = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES })
  await openBluetooth(d)
}

// Reconnects to the printer chosen before, without asking (after it was switched off / unplugged,
// or a reload on browsers that remember permissions). Returns false when it needs choosePrinter().
export async function reconnect() {
  if (printer) return true
  const s = saved()
  if (!s) return false
  try {
    if (s.kind === 'usb') {
      if (!usbSupported()) return false
      const known = await navigator.usb.getDevices()
      const d =
        (lastDevice && known.includes(lastDevice) ? lastDevice : null) ??
        known.find((k) => (k.productName || k.manufacturerName) === s.name) ??
        (known.length === 1 ? known[0] : null)
      if (!d) return false
      await openUsb(d)
    } else {
      if (!bluetoothSupported()) return false
      if (lastDevice?.gatt) {
        await openBluetooth(lastDevice)
      } else {
        const known = navigator.bluetooth.getDevices ? await navigator.bluetooth.getDevices() : []
        const d = known.find((k) => k.name === s.name) ?? (known.length === 1 ? known[0] : null)
        if (!d) return false
        await openBluetooth(d)
      }
    }
    return true
  } catch {
    return false
  }
}

export function forgetPrinter() {
  printer?.close()
  printer = null
  lastDevice = null
  try {
    localStorage.removeItem(SAVED_KEY)
  } catch {
    // storage blocked
  }
  changed()
}

// The logo as black dots (the picture is white on clear: every visible pixel prints black)
let logoBytes
async function logo() {
  if (logoBytes !== undefined) return logoBytes
  try {
    const img = new Image()
    img.src = '/cjg-logo-bar.png'
    await img.decode()
    const h = Math.round((img.naturalHeight / img.naturalWidth) * LOGO_DOTS)
    const canvas = document.createElement('canvas')
    canvas.width = LOGO_DOTS
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, LOGO_DOTS, h)
    const { data } = ctx.getImageData(0, 0, LOGO_DOTS, h)
    const dots = []
    for (let i = 0; i < data.length; i += 4) dots.push(data[i + 3] > 128)
    logoBytes = rasterImage(dots, LOGO_DOTS, h)
  } catch {
    logoBytes = null // print without the logo
  }
  return logoBytes
}

const UNREACHABLE =
  'Could not reach the printer. Check that it is on and nearby (or plugged in), then press Print again. ' +
  'If it still fails, close this and press the printer button to connect it again.'

// Prints one receipt. Throws with a message for the cashier when the printer is not reachable.
export async function printReceipt({ sale, branch, cashier }) {
  if (!printer && !(await reconnect())) throw new Error(UNREACHABLE)
  const bytes = receiptBytes(receiptLines({ sale, branch, cashier, money: peso }), await logo())
  try {
    await printer.send(bytes)
  } catch (e) {
    // the connection dropped (printer off, out of range or unplugged): try once more after reconnecting
    printer = null
    try {
      if (!(await reconnect())) throw e
      await printer.send(bytes)
    } catch (e2) {
      printer = null
      changed()
      throw new Error(UNREACHABLE, { cause: e2 })
    }
  }
}
