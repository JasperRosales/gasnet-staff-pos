export const BRANCHES = [
  { id: 1, name: 'Caloocan' },
  { id: 2, name: 'Bayan' },
  { id: 3, name: 'Gulod' },
  { id: 4, name: 'Cuenca' },
  { id: 5, name: 'Sta. Teresita' },
  { id: 6, name: 'Agoncillo' },
  { id: 7, name: 'Truck' },
]

export const branchName = (id) =>
  BRANCHES.find((b) => b.id === Number(id))?.name ?? `Branch ${id}`