-- Seed customer_types referenced by pos_checkout validation.
-- POS sends `commercial`; checkout rejects types not in this table.
insert into public.customer_types (type, label, min_quantity, discount_per_unit)
values
  ('commercial', 'Commercial', 1, 0),
  ('household', 'Household', 1, 0),
  ('rto', 'RTO', 1, 0)
on conflict (type) do nothing;
