// The confirm / message pop-ups, usable from anywhere. The <ConfirmDialog /> on the page shows them.
let openDialog = null

// called by <ConfirmDialog /> when it appears (and with null when it goes away)
export const setDialogOpener = (fn) => {
  openDialog = fn
}

// Use it like this:  if (await confirmDialog('Are you sure ...?')) { ... }
export function confirmDialog(message) {
  return new Promise((resolve) => {
    if (openDialog) openDialog({ message, kind: 'confirm' }, resolve)
    else resolve(window.confirm(message)) // safety net if the dialog is not on the page
  })
}

// A message with an OK button, for example why something cannot be saved:
//   await alertDialog('Contact number must be 11 digits')
export function alertDialog(message, title = 'Please check') {
  return new Promise((resolve) => {
    if (openDialog) openDialog({ message, title, kind: 'alert' }, resolve)
    else {
      window.alert(message) // safety net if the dialog is not on the page
      resolve(true)
    }
  })
}
