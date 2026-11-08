// Receipt printing: 'auto' prints right after each sale, 'manual' waits for the Print button.
// Saved per device, since each counter has its own printer.
const KEY = 'gasnet-pos-print-mode'

export const getPrintMode = () => {
  try {
    return localStorage.getItem(KEY) === 'auto' ? 'auto' : 'manual'
  } catch {
    return 'manual'
  }
}

export const savePrintMode = (mode) => {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // storage blocked: the choice lasts until the page is reloaded
  }
}
