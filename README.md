# GasNet Staff POS

Point-of-sale app for branch staff. Same look as the GasNet admin portal
([gasnet-admin-fe](https://github.com/JasperRosales/gasnet-admin-fe)) and the same Supabase project.

## Features
- Branch login (staff and managers only)
- Tap-to-add LPG cylinders with branch prices and live stock
- Walk-in or commercial customers, delivery, cash (with change) or GCash, discount, remarks
- **Inventory reduction**: `pos_checkout` saves the sale and lowers stock in one transaction.
  It blocks overselling, and two cashiers can't sell the same last cylinder.
- Printable receipt (sized for 72 mm thermal printers)
- Today's sales with cash/GCash totals; **Void** puts the cylinders back in stock

## Setup
```bash
cp .env.sample .env   # fill in the Supabase URL and publishable key
npm install
npm run dev
```

## Database
Needs the base schema from `gasnet-admin-fe/supabase/migrations`, then
`supabase/migrations/20261109010000_pos.sql`, which adds:

| Function | What it does |
|---|---|
| `pos_checkout(p_items, ...)` | Saves the sale as accepted walk-in orders and reduces `stock` |
| `pos_void_sale(p_group_id)` | Voids today's sale and restores `stock` |
| `pos_branch()` | The caller's branch (approved staff/manager only) |

It also creates a `stock` row for each branch and size (starting at 0) and turns on realtime for `stock` and `orders`.
