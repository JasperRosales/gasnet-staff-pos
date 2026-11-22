// Prints receipts straight to a Bluetooth thermal printer from the browser (Web Bluetooth),
// with no printer app. Works in Chrome / Edge on Android, Windows, Mac and Linux; not on iPhone.
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
const NAME_KEY = 'gasnet-pos-bt-printer'
const CHUNK = 100 // bytes sent at a time

export const bluetoothSupported = () => typeof navigator !== 'undefined' && Boolean(navigator.bluetooth)

let device = null
let channel = null // the characteristic print data is written to
const listeners = new Set()

// { supported, connected, name }: what the printer button shows
export function printerState() {
  let saved = null
  try {
    saved = localStorage.getItem(NAME_KEY)
  } catch {
    // storage blocked
  }
  return { supported: bluetoothSupported(), connected: Boolean(channel), name: device?.name || saved }
}
export function onPrinterChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const changed = () => listeners.forEach((fn) => fn(printerState()))

async function findChannel(server) {
  const services = await server.getPrimaryServices()
  for (const s of services) {
    const chars = await s.getCharacteristics().catch(() => [])
    const c = chars.find((ch) => ch.properties.writeWithoutResponse || ch.properties.write)
    if (c) return c
  }
  throw new Error('This Bluetooth device does not accept print data. Is it a thermal printer?')
}

async function open(d) {
  const server = await d.gatt.connect()
  channel = await findChannel(server)
  device = d
  try {
    localStorage.setItem(NAME_KEY, d.name || 'Printer')
  } catch {
    // storage blocked
  }
  d.addEventListener('gattserverdisconnected', () => {
    channel = null
    changed()
  })
  changed()
}

// Opens the browser's Bluetooth list to choose the printer (must run from a button press)
export async function choosePrinter() {
  if (!bluetoothSupported()) {
    throw new Error('This browser cannot use Bluetooth. Please use Chrome or Edge (not available on iPhone).')
  }
  const d = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES })
  await open(d)
}

// Reconnects to the printer chosen before, without asking (after it was switched off, or a reload
// on browsers that remember Bluetooth permissions). Returns false when it needs choosePrinter().
export async function reconnect() {
  if (channel) return true
  try {
    if (device) {
      await open(device)
      return true
    }
    const name = printerState().name
    const known = navigator.bluetooth?.getDevices ? await navigator.bluetooth.getDevices() : []
    const d = known.find((k) => k.name === name) ?? (known.length === 1 ? known[0] : null)
    if (!d) return false
    await open(d)
    return true
  } catch {
    return false
  }
}

export function forgetPrinter() {
  device?.gatt?.disconnect()
  device = null
  channel = null
  try {
    localStorage.removeItem(NAME_KEY)
  } catch {
    // storage blocked
  }
  changed()
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function send(bytes) {
  const noReply = channel.properties.writeWithoutResponse
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.slice(i, i + CHUNK)
    if (noReply) {
      await channel.writeValueWithoutResponse(part)
      await wait(20) // let the printer's small buffer keep up
    } else {
      await channel.writeValueWithResponse(part)
    }
  }
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

// Prints one receipt. Throws with a message for the cashier when the printer is not reachable.
export async function printReceipt({ sale, branch, cashier }) {
  if (!channel && !(await reconnect())) {
    throw new Error('The printer is not connected. Press "Connect printer" and choose it.')
  }
  const bytes = receiptBytes(receiptLines({ sale, branch, cashier, money: peso }), await logo())
  try {
    await send(bytes)
  } catch (e) {
    // the connection dropped (printer off or out of range): try once more after reconnecting
    channel = null
    if (!(await reconnect())) throw new Error(`Could not print: ${e.message}`, { cause: e })
    await send(bytes)
  }
}
