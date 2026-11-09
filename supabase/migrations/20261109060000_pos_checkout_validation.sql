-- pos_checkout: the same input rules as the towngaz staff functions (add_manual_orders), checked
-- in the database so nothing can skip them, and the discount spread over the lines.
--  * the discount used to go on the first line only, but orders_discount_limit allows each line
--    at most its own amount: a ₱1,000 discount on 2.7kg + 50kg failed with a constraint error.
--    Now each line takes what it can, largest line first.
--  * discount: 0 or more, at most 2 decimal places, less than the sale amount
--  * quantity: a whole number from 1 to 999; each size once; known sizes only
--  * contact: exactly 11 digits when given; customer type: one of customer_types when given
--  * text lengths: name 80, contact 11, address 200, expenses 200

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
  v_item record;
  v_left integer;
  v_subtotal numeric := 0;
  v_discount numeric := coalesce(p_discount, 0);
  v_remaining numeric;
  v_line_discount numeric;
  v_lines jsonb := '[]'::jsonb;
  v_summary text := '';
  v_name text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_contact text := nullif(trim(coalesce(p_customer_contact, '')), '');
  v_address text := nullif(trim(coalesce(p_customer_address, '')), '');
  v_type text := nullif(trim(coalesce(p_customer_type, '')), '');
  v_remarks text := nullif(trim(coalesce(p_remarks, '')), '');
begin
  -- ---- the customer ----
  if length(v_name) > 80 then raise exception 'Customer name is too long (80 characters at most)'; end if;
  if v_contact is not null and v_contact !~ '^[0-9]{11}$' then
    raise exception 'Contact number must be exactly 11 digits';
  end if;
  if length(v_address) > 200 then raise exception 'Address is too long (200 characters at most)'; end if;
  if length(v_remarks) > 200 then raise exception 'Expenses are too long (200 characters at most)'; end if;
  if v_type is not null and not exists (select 1 from public.customer_types where type = v_type) then
    raise exception 'Unknown customer type: %', v_type;
  end if;
  if coalesce(p_delivery, false) and v_address is null then
    raise exception 'A delivery needs an address';
  end if;

  -- ---- the items ----
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The cart is empty';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
             where jsonb_typeof(e) <> 'object'
                or jsonb_typeof(e->'qty') <> 'number'
                or (e->>'qty')::numeric <> trunc((e->>'qty')::numeric)
                or (e->>'qty')::numeric < 1 or (e->>'qty')::numeric > 999) then
    raise exception 'Quantity must be a whole number from 1 to 999';
  end if;
  if (select count(*) <> count(distinct e->>'size') from jsonb_array_elements(p_items) e) then
    raise exception 'Each size can only be entered once';
  end if;

  -- prices of this branch (its own price, or the normal price)
  create temporary table if not exists pos_lines (size text, qty integer, price numeric) on commit drop;
  truncate pos_lines;
  insert into pos_lines
  select e->>'size', (e->>'qty')::integer, coalesce(bp.price, p.price)
  from jsonb_array_elements(p_items) e
  left join public.lpg_prices p on p.size = e->>'size'
  left join public.branch_prices bp on bp.branch = v_branch and bp.size = p.size;
  if exists (select 1 from pos_lines where price is null) then
    raise exception 'Unknown size: %', (select size from pos_lines where price is null limit 1);
  end if;
  select sum(price * qty) into v_subtotal from pos_lines;

  -- ---- the discount ----
  if v_discount < 0 then raise exception 'Discount cannot be negative'; end if;
  if v_discount <> round(v_discount, 2) then raise exception 'Discount can have at most 2 decimal places'; end if;
  if v_discount > 0 and v_discount >= v_subtotal then
    raise exception 'Discount must be less than the sale amount (₱%)', to_char(v_subtotal, 'FM999,999,990.00');
  end if;

  -- ---- save: stock first (row locks stop two cashiers selling the same last cylinder) ----
  v_remaining := v_discount;
  for v_item in select * from pos_lines order by price * qty desc, size loop
    update public.stock
    set quantity = quantity - v_item.qty
    where branch = v_branch and item_name = 'LPG Cylinder ' || v_item.size and quantity >= v_item.qty
    returning quantity into v_left;
    if not found then
      select quantity into v_left from public.stock
      where branch = v_branch and item_name = 'LPG Cylinder ' || v_item.size;
      raise exception 'Not enough % in stock (% left)', v_item.size, coalesce(v_left, 0);
    end if;

    -- each line takes as much of the discount as its own amount allows, largest line first
    v_line_discount := least(v_remaining, v_item.price * v_item.qty);
    v_remaining := v_remaining - v_line_discount;

    insert into public.orders (
      group_id, branch, customer_id, customer_name, customer_contact, customer_address,
      customer_type, item_name, quantity, unit_price, discount,
      status, accepted_at, source, delivery_status, paid_gcash, remarks
    ) values (
      v_group, v_branch, null, coalesce(v_name, 'Walk-in'), v_contact, v_address, v_type,
      'LPG Cylinder ' || v_item.size, v_item.qty, v_item.price, v_line_discount,
      'accepted', now(), 'walkin',
      case when p_delivery then 'preparing' else 'delivered' end,
      coalesce(p_paid_gcash, false),
      v_remarks
    );

    v_lines := v_lines || jsonb_build_object(
      'size', v_item.size, 'qty', v_item.qty, 'unit_price', v_item.price,
      'total_price', v_item.price * v_item.qty, 'stock_left', v_left);
    v_summary := v_summary || case when v_summary = '' then '' else ', ' end || v_item.qty || ' x ' || v_item.size;
  end loop;

  perform public.log_staff_activity(
    v_branch, 'POS sale',
    v_summary || ' for ' || coalesce(v_name, 'Walk-in')
      || ', ₱' || to_char(v_subtotal - v_discount, 'FM999,999,990.00')
      || case when coalesce(p_paid_gcash, false) then ' (GCash)' else '' end
      || case when p_delivery then ' (for delivery)' else '' end
  );

  return jsonb_build_object('group_id', v_group, 'subtotal', v_subtotal,
    'discount', v_discount, 'total', v_subtotal - v_discount, 'lines', v_lines);
end $$;

revoke all on function public.pos_checkout(jsonb, text, text, text, text, boolean, numeric, boolean, text) from public, anon;
grant execute on function public.pos_checkout(jsonb, text, text, text, text, boolean, numeric, boolean, text) to authenticated;
