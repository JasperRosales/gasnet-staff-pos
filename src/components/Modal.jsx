// A pop-up window over the page (the page stays behind it, darker).
// Clicking outside closes it, except while busy (for example while saving).
export default function Modal({ onClose, busy = false, children }) {
  return (
    <div
      className="fixed inset-0 z-[900] box-border flex animate-[confirm-fade_0.2s_ease] items-center justify-center overflow-y-auto bg-black/50 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="my-auto box-border w-full max-w-[400px] animate-[confirm-pop_0.2s_ease] rounded-2xl bg-white p-6 text-left shadow-2xl"
      >
        {children}
      </div>
    </div>
  )
}
