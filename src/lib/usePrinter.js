import { useEffect, useState } from 'react'
import { onPrinterChange, printerState } from './printer'

// The receipt printer's state, kept up to date (see printerState)
export function usePrinter() {
  const [state, setState] = useState(printerState)
  useEffect(() => onPrinterChange(setState), [])
  return state
}
