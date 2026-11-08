import { useEffect, useState } from 'react'

let openDialog = null

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

export default function ConfirmDialog() {
  const [dialog, setDialog] = useState(null)

  useEffect(() => {
    openDialog = (options, resolve) => setDialog({ ...options, resolve })
    return () => {
      openDialog = null
    }
  }, [])

  // press Esc to cancel (or to close a message)
  useEffect(() => {
    if (!dialog) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        dialog.resolve(false)
        setDialog(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  if (!dialog) return null

  const answer = (result) => {
    dialog.resolve(result)
    setDialog(null)
  }
  const alert = dialog.kind === 'alert'

  return (
    <div
      className="fixed inset-0 z-[1000] box-border flex animate-[confirm-fade_0.2s_ease] items-center justify-center bg-black/50 p-4"
      onClick={() => answer(false)}
    >
      <div
        className="box-border w-full max-w-[380px] animate-[confirm-pop_0.2s_ease] rounded-2xl bg-white p-6 text-center shadow-2xl"
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {alert ? (
          <>
            <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-full bg-red-100 text-[22px] font-bold text-brand-red">
              !
            </div>
            <h3 className="mt-0 mb-2 text-xl">{dialog.title}</h3>
            <p className="mt-0 mb-5 whitespace-pre-line">{dialog.message}</p>
            <button className="w-full" autoFocus onClick={() => answer(true)}>OK</button>
          </>
        ) : (
          <>
            <h3 className="mt-0 mb-2 text-xl">Please confirm</h3>
            <p className="mt-0 mb-5">{dialog.message}</p>
            <div className="flex gap-2">
              <button
                className="flex-1 border border-[var(--border)] bg-white text-[var(--text)]"
                onClick={() => answer(false)}
              >
                Cancel
              </button>
              <button className="flex-1" autoFocus onClick={() => answer(true)}>Yes</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
