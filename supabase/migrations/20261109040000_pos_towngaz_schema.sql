-- POS checkout and void on the towngaz schema (schema.sql):
--  * orders.total_price is a generated column there (unit_price * quantity - discount), so the
--    POS must not write it (every checkout failed with "cannot insert a non-DEFAULT value").
--  * orders.delivery_status is NOT NULL there, and edit_order only accepts 'preparing',
--    'out_for_delivery' or 'delivered' on an accepted order: a counter sale is 'delivered'
--    (handed over at the counter), a sale for delivery starts as 'preparing' like
--    add_manual_order, and the branch moves it on with update_delivery_status.
--  * orders.status only allows pending / accepted / cancelled there: a void is 'cancelled'.
--  * like the other staff functions, each sale and each void is written to staff_activity.

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
language plpgsql
security definer
set search_path to ''
as $$
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
  v_summary text := '';
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
      customer_type, item_name, quantity, unit_price, discount,
      status, accepted_at, source, delivery_status, paid_gcash, remarks
    ) values (
      v_group, v_branch, null,
      coalesce(nullif(trim(p_customer_name), ''), 'Walk-in'),
      nullif(trim(p_customer_contact), ''),
      nullif(trim(p_customer_address), ''),
      nullif(p_customer_type, ''),
      'LPG Cylinder ' || v_size, v_qty, v_price,
      case when v_first then v_discount else 0 end,
      'accepted', now(), 'walkin',
      case when p_delivery then 'preparing' else 'delivered' end,
      coalesce(p_paid_gcash, false),
      nullif(trim(p_remarks), '')
    );

    v_lines := v_lines || jsonb_build_object(
      'size', v_size, 'qty', v_qty, 'unit_price', v_price,
      'total_price', v_price * v_qty, 'stock_left', v_left);
    v_summary := v_summary || case when v_first then '' else ', ' end || v_qty || ' x ' || v_size;
    v_first := false;
  end loop;

  perform public.log_staff_activity(
    v_branch, 'POS sale',
    v_summary || ' for ' || coalesce(nullif(trim(p_customer_name), ''), 'Walk-in')
      || ', ₱' || to_char(v_subtotal - v_discount, 'FM999,999,990.00')
      || case when coalesce(p_paid_gcash, false) then ' (GCash)' else '' end
      || case when p_delivery then ' (for delivery)' else '' end
  );

  return jsonb_build_object('group_id', v_group, 'subtotal', v_subtotal,
    'discount', v_discount, 'total', v_subtotal - v_discount, 'lines', v_lines);
end $$;

create or replace function public.pos_void_sale(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_branch smallint := public.pos_branch();
  r record;
  v_count integer := 0;
  v_amount numeric := 0;
  v_summary text := '';
begin
  for r in
    select id, item_name, quantity, total_price from public.orders
    where group_id = p_group_id and branch = v_branch and status = 'accepted'
      and source = 'walkin'
      and (accepted_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date
    for update
  loop
    update public.stock set quantity = quantity + r.quantity
    where branch = v_branch and item_name = r.item_name;
    update public.orders set status = 'cancelled' where id = r.id;
    v_amount := v_amount + coalesce(r.total_price, 0);
    v_summary := v_summary || case when v_count = 0 then '' else ', ' end
      || r.quantity || ' x ' || replace(r.item_name, 'LPG Cylinder ', '');
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'Sale not found, already voided, or not from today';
  end if;

  perform public.log_staff_activity(
    v_branch, 'POS sale voided',
    v_summary || ', ₱' || to_char(v_amount, 'FM999,999,990.00') || ' (stock put back)'
  );
end $$;

revoke all on function public.pos_checkout(jsonb, text, text, text, text, boolean, numeric, boolean, text) from public, anon;
grant execute on function public.pos_checkout(jsonb, text, text, text, text, boolean, numeric, boolean, text) to authenticated;
revoke all on function public.pos_void_sale(uuid) from public, anon;
grant execute on function public.pos_void_sale(uuid) to authenticated;
