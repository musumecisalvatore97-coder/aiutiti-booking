-- 004_check_capacity.sql
-- REVISION: Check Capacity RPC
-- CONTEXT: Single Tenant, TEXT IDs, Normalized Table Joins (option_id, table_id)

-- 1. INDEXES (Essential for performance)

create extension if not exists btree_gist;

create index if not exists idx_tj_table on public.table_joins(table_id);
create index if not exists idx_tj_option on public.table_joins(option_id);

create index if not exists idx_rtb_table_range_gist
  on public.reservation_table_blocks
  using gist (
    table_id,
    tstzrange(start_at, end_at, '[)')
  );


-- 2. THE FUNCTION
create or replace function public.check_capacity(
  p_tenant_id uuid, -- Ignored (Single Tenant)
  p_party_size integer,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_option_id text;
  v_capacity integer;
  v_tables jsonb;
begin
  -- Input Validation
  if p_party_size is null or p_party_size <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'party_size_invalid');
  end if;

  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    return jsonb_build_object('ok', false, 'reason', 'time_range_invalid');
  end if;

  -- Logic:
  -- 1. Identify Options & Constituent Tables
  -- 2. Calculate Capacity per Option
  -- 3. Filter Blocked Options (Any constituent table locked)
  -- 4. Select Best Fit (Min Capacity >= Party Size)

  with option_tables as (
    -- Normalized View: Option -> Table
    select
      tj.option_id,
      tj.table_id
    from public.table_joins tj
    -- No tenant filter (Single Tenant)
  ),
  option_stats as (
    select
      ot.option_id,
      sum(t.seats)::int as capacity,
      jsonb_agg(ot.table_id order by ot.table_id) as table_list
    from option_tables ot
    join public.tables t on t.table_id = ot.table_id
    group by ot.option_id
  ),
  blocked_options as (
    select distinct ot.option_id
    from option_tables ot
    join public.reservation_table_blocks b
      on b.table_id = ot.table_id -- Assumes types match (TEXT)
    where tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ),
  available_options as (
    select
      os.option_id,
      os.capacity,
      os.table_list
    from option_stats os
    left join blocked_options bo on bo.option_id = os.option_id
    where bo.option_id is null
      and os.capacity >= p_party_size
  )
  select
    option_id,
    capacity,
    table_list
  into v_option_id, v_capacity, v_tables
  from available_options
  order by capacity asc, option_id asc -- Best Fit, then deterministic tie-break
  limit 1;

  if v_option_id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_capacity',
      'party_size', p_party_size,
      'start_at', p_start_at,
      'end_at', p_end_at
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'option_id', v_option_id,
    'capacity', v_capacity,
    'tables', v_tables
  );
end;
$$;

-- 3. TESTS
/*
BEGIN;
select check_capacity(null, 2, now(), now() + interval '1 hour', '{}');
ROLLBACK;
*/
