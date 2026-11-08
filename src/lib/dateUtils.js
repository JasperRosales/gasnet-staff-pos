const pad = (n) => String(n).padStart(2, '0')

// 'YYYY-MM-DD' for a date, in the browser's local time
export function dateString(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const todayString = () => dateString(new Date())

export const localDateString = (iso) => dateString(new Date(iso))