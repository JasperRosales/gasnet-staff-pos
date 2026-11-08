-- Staff POS: checkout with inventory reduction, and voiding a sale.
-- Both run as one transaction: either every line is saved and stock goes down, or nothing changes.

-- One stock row per branch and LPG size (quantity starts at 0; the admin sets the real counts)
insert into public.stock (branch, item_name, quantity, price)
select b.id, 'LPG Cylinder ' || p.size, 0, coalesce(bp.price, p.price)
from generate_series(1, 7) as b(id)
cross join public.lpg_prices p
left join public.branch_prices bp on bp.branch = b.id and bp.size = p.size
on conflict (branch, item_name) do nothing;

-- The caller's branch, if they are approved staff/manager (else an error)
create or replace function public.pos_branch() returns smallint
language plpgsql stable security definer set search_path = '' as $$
declare v_branch smallint;
begin
  select branch into v_branch from public.profiles
  where id = auth.uid() and status = 'approved' and role in ('staff', 'manager');
  if v_branch is null then
    raise exception 'Only approved branch staff can use the POS';
  end if;
  return v_branch;
end $$;

-- p_items: [{"size":"11kg","qty":2}, ...]
-- p_discount: pesos off the whole sale (kept on the first line)
-- Returns {group_id, total, lines:[{size, qty, unit_price, total_price, stock_left}]}
create or replace function public.pos_checkout(
  p_items jsonb,
  p_customer_name text default null,
  p_customer_contact text default null,
  p_customer_address text default null,
  p_customer_type text default null,
  p_paid_gcash boolean default false,
  p_discount numeric default 0,
  p_delivery boolean default false,
  p_remarks text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_branch smallint := public.pos_branch();
  v_group uuid := gen_random_uuid();
  v_item jsonb;
  v_size text;
  v_qty integer;
  v_price numeric;
  v_left integer;
  v_subtotal numeric := 0;
  v_discount numeric := coalesce(p_discount, 0);
  v_first boolean := true;
  v_lines jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The cart is empty';
  end if;
  if p_delivery and coalesce(trim(p_customer_address), '') = '' then
    raise exception 'A delivery needs an address';
  end if;

  -- price check first, so the discount can be validated before any stock moves
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_size := v_item->>'size';
    v_qty := (v_item->>'qty')::integer;
    if v_qty is null or v_qty < 1 then
      raise exception 'Quantity for % must be at least 1', v_size;
    end if;
    select coalesce(bp.price, p.price) into v_price
    from public.lpg_prices p
    left join public.branch_prices bp on bp.branch = v_branch and bp.size = p.size
    where p.size = v_size;
    if v_price is null then
      raise exception 'Unknown size: %', v_size;
    end if;
    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'Discount must be between 0 and %', v_subtotal;
  end if;

  -- reduce stock (row locks stop two cashiers from selling the same last cylinder)
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_size := v_item->>'size';
    v_qty := (v_item->>'qty')::integer;

    update public.stock
    set quantity = quantity - v_qty
    where branch = v_branch and item_name = 'LPG Cylinder ' || v_size and quantity >= v_qty
    returning quantity into v_left;

    if not found then
      select quantity into v_left from public.stock
      where branch = v_branch and item_name = 'LPG Cylinder ' || v_size;
      raise exception 'Not enough % in stock (% left)', v_size, coalesce(v_left, 0);
    end if;

    select coalesce(bp.price, p.price) into v_price
    from public.lpg_prices p
    left join public.branch_prices bp on bp.branch = v_branch and bp.size = p.size
    where p.size = v_size;

    insert into public.orders (
      group_id, branch, customer_id, customer_name, customer_contact, customer_address,
      customer_type, item_name, quantity, unit_price, discount, total_price,
      status, accepted_at, source, delivery_status, paid_gcash, remarks
    ) values (
      v_group, v_branch, null,
      coalesce(nullif(trim(p_customer_name), ''), 'Walk-in'),
      nullif(trim(p_customer_contact), ''),
      nullif(trim(p_customer_address), ''),
      nullif(p_customer_type, ''),
      'LPG Cylinder ' || v_size, v_qty, v_price,
      case when v_first then v_discount else 0 end,
      v_price * v_qty - case when v_first then v_discount else 0 end,
      'accepted', now(), 'walkin',
      case when p_delivery then 'not_started' else null end,
      coalesce(p_paid_gcash, false),
      nullif(trim(p_remarks), '')
    );

    v_lines := v_lines || jsonb_build_object(
      'size', v_size, 'qty', v_qty, 'unit_price', v_price,
      'total_price', v_price * v_qty, 'stock_left', v_left);
    v_first := false;
  end loop;

  return jsonb_build_object('group_id', v_group, 'subtotal', v_subtotal,
    'discount', v_discount, 'total', v_subtotal - v_discount, 'lines', v_lines);
end $$;

-- Undo a sale made today at the caller's branch: marks it rejected and puts the stock back
create or replace function public.pos_void_sale(p_group_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_branch smallint := public.pos_branch();
  r record;
  v_count integer := 0;
begin
  for r in
    select id, item_name, quantity from public.orders
    where group_id = p_group_id and branch = v_branch and status = 'accepted'
      and source = 'walkin'
      and (accepted_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date
    for update
  loop
    update public.stock set quantity = quantity + r.quantity
    where branch = v_branch and item_name = r.item_name;
    update public.orders set status = 'rejected' where id = r.id;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'Sale not found, already voided, or not from today';
  end if;
end $$;

revoke all on function public.pos_branch() from public, anon;
revoke all on function public.pos_checkout(jsonb, text, text, text, text, boolean, numeric, boolean, text) from public, anon;
revoke all on function public.pos_void_sale(uuid) from public, anon;
grant execute on function public.pos_branch() to authenticated;
grant execute on function public.pos_checkout(jsonb, text, text, text, text, boolean, numeric, boolean, text) to authenticated;
grant execute on function public.pos_void_sale(uuid) to authenticated;

-- Live stock and sales updates in the POS
do $$ begin
  alter publication supabase_realtime add table public.stock;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
