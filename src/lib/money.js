// 1250 -> ₱1,250.00
export const peso = (value) =>
  '₱' +
  Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })