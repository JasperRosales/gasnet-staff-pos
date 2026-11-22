import { useEffect, useState } from 'react'
import { onPrinterChange, printerState } from './btPrinter'

// The Bluetooth printer's state, kept up to date: { supported, connected, name }
export function usePrinter() {
  const [state, setState] = useState(printerState)
  useEffect(() => onPrinterChange(setState), [])
  return state
}
