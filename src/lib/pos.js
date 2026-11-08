import { supabase } from './supabaseClient'
import { cachedQuery } from './lazyData'

// prices and sizes change rarely: kept for 5 minutes (stock is always read fresh)
const PRICES_TTL = 5 * 60 * 1000

export const ITEM_PREFIX = 'LPG Cylinder '
// "LPG Cylinder 11kg" -> "11kg"
export const sizeOf = (itemName) => (itemName || '').replace(ITEM_PREFIX, '')

// Sizes with this branch's price and stock: [{ size, price, stock, low }]
export async function loadProducts(branch) {
  const [sizes, branchPrices, stock] = await Promise.all([
    cachedQuery('prices:lpg', PRICES_TTL, () =>
      supabase.from('lpg_prices').select('size, price, low_stock_level').order('sort_order'),
    ),
    cachedQuery(`prices:branch:${branch}`, PRICES_TTL, () =>
      supabase.from('branch_prices').select('size, price').eq('branch', branch),
    ),
    supabase.from('stock').select('item_name, quantity').eq('branch', branch),
  ])
  const error = sizes.error || branchPrices.error || stock.error
  if (error) throw error
  return sizes.data.map((p) => ({
    size: p.size,
    price: Number(branchPrices.data.find((b) => b.size === p.size)?.price ?? p.price),
    stock: stock.data.find((s) => s.item_name === ITEM_PREFIX + p.size)?.quantity ?? 0,
    low: p.low_stock_level ?? 0,
  }))
}

// Saves the sale and reduces stock in one database transaction
export async function checkout(sale) {
  const { data, error } = await supabase.rpc('pos_checkout', {
    p_items: sale.items.map((x) => ({ size: x.size, qty: x.qty })),
    p_customer_name: sale.customerName,
    p_customer_contact: sale.contact,
    p_customer_address: sale.address,
    p_customer_type: sale.customerType,
    p_paid_gcash: sale.payment === 'gcash',
    p_discount: sale.discount,
    p_delivery: sale.delivery,
    p_remarks: sale.remarks,
  })
  if (error) throw error
  return data
}

export async function voidSale(groupId) {
  const { error } = await supabase.rpc('pos_void_sale', { p_group_id: groupId })
  if (error) throw error
}

// Today's walk-in sales at a branch, grouped into transactions (newest first)
export async function loadTodaySales(branch) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('orders')
    .select('id, group_id, item_name, quantity, unit_price, discount, total_price, status, accepted_at, customer_name, customer_address, customer_type, paid_gcash, delivery_status, remarks')
    .eq('branch', branch)
    .eq('source', 'walkin')
    .in('status', ['accepted', 'rejected'])
    .gte('accepted_at', start.toISOString())
    .order('accepted_at', { ascending: false })
    .order('id')
  if (error) throw error

  const groups = new Map()
  for (const o of data) {
    const key = o.group_id ?? `order-${o.id}`
    if (!groups.has(key)) {
      groups.set(key, {
        groupId: o.group_id,
        time: o.accepted_at,
        customer: o.customer_name,
        address: o.customer_address,
        customerType: o.customer_type,
        gcash: o.paid_gcash,
        delivery: Boolean(o.delivery_status),
        voided: o.status === 'rejected',
        remarks: o.remarks,
        lines: [],
        discount: 0,
        total: 0,
      })
    }
    const g = groups.get(key)
    g.lines.push({ size: sizeOf(o.item_name), qty: o.quantity, unitPrice: Number(o.unit_price) })
    g.discount += Number(o.discount || 0)
    g.total += Number(o.total_price || 0)
  }
  return [...groups.values()]
}
