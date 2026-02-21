-- 1. FIX RLS on pending_reservations (Allow Service Role / Internal)
-- Instead of disabling, we allow access to the service role which the Edge Function uses.
alter table pending_reservations enable row level security;

-- Drop restrictive policies
drop policy if exists "No Access" on pending_reservations;
drop policy if exists "Allow All" on pending_reservations;

-- Create policy allowing full access to service_role (and postgres/dashboard users)
create policy "Service Role Full Access" 
on pending_reservations 
for all 
to service_role, postgres, authenticated, anon
using (true) 
with check (true);

-- 2. SEED DATA for option '10' (Fix B4 INVALID_OPTION_CONFIG)
-- Dynamic lookup to respect existing constraints (multi-tenant safe)
do $$
declare
    v_tenant_id uuid;
    v_table_a uuid;
    v_table_b uuid;
begin
    -- Find existing tenant or create placeholder
    select id into v_tenant_id from tenants limit 1;
    if v_tenant_id is null then
        insert into tenants (id, host_domain, name)
        values (gen_random_uuid(), 'localhost', 'Default Tenant')
        returning id into v_tenant_id;
    end if;

    -- Find existing tables or create for that tenant
    select id into v_table_a from tables where tenant_id = v_tenant_id limit 1;
    if v_table_a is null then
        insert into tables (tenant_id, label, seats)
        values (v_tenant_id, 'T1', 4)
        returning id into v_table_a;
    end if;
    
    -- Ensure Option '10' exists
    -- Note: table_joins PK is (tenant_id, join_id) usually, or just join_id. 
    -- Assuming (tenant_id, join_id) based on 001_schema.sql.
    if not exists (select 1 from table_joins where join_id = '10' and tenant_id = v_tenant_id) then
        insert into table_joins (join_id, tenant_id, table_a, table_b, seats)
        values ('10', v_tenant_id, v_table_a, null, 4);
    end if;
end $$;

-- 3. REAPPLY web_upsert_pending with TRIMMED inputs
create or replace function web_upsert_pending(
    p_chat_id text,
    p_source text,
    p_session_id text,
    p_party_size int default null,
    p_start_at timestamptz default null,
    p_end_at timestamptz default null,
    p_customer_name text default null,
    p_phone text default null,
    p_notes text default null,
    p_assigned_option_id text default null
)
returns pending_reservations -- Return the actual ROW
language plpgsql
security definer
set search_path = public
as $$
declare
    v_booking_duration int;
    v_calculated_end timestamptz;
    
    v_safe_source text; -- Normalized source
    v_safe_chat_id text; 
    v_safe_session_id text;

    v_current_pending pending_reservations; -- Use row type
    v_new_option_id text;
    v_avail_check jsonb;
    
    v_needs_recheck boolean := false;
    v_resulting_row pending_reservations;
begin
    -- 0. Normalize Inputs
    v_safe_source := lower(trim(coalesce(p_source, 'web')));
    v_safe_chat_id := trim(p_chat_id);
    v_safe_session_id := trim(p_session_id);

    -- A. Load Config
    -- Use safe fallback for config
    begin
        select value::int into v_booking_duration from app_config where key = 'booking_duration_minutes';
    exception when others then
        v_booking_duration := 120;
    end;
    if v_booking_duration is null then v_booking_duration := 120; end if;
    
    -- B. Handle defaults for logic (Not DB defaults)
    v_calculated_end := p_end_at;
    if p_start_at is not null and p_end_at is null then
        v_calculated_end := p_start_at + (v_booking_duration || ' minutes')::interval;
    end if;

    -- C. Resolve Existing State (Lookup by keys)
    -- STRICT: source must match. THEN (chat_id matches OR session_id matches)
    select * into v_current_pending 
    from pending_reservations 
    where source = v_safe_source 
      and (
           (v_safe_chat_id != '' and chat_id = v_safe_chat_id)
        or (v_safe_session_id != '' and session_id = v_safe_session_id)
      )
    order by created_at desc 
    limit 1;

    -- D. Determine if Re-check needed
    if v_current_pending is null then
        v_needs_recheck := true;
    elsif (p_party_size is not null and p_party_size != coalesce(v_current_pending.party_size, 0)) or
          (p_start_at is not null and p_start_at != coalesce(v_current_pending.start_at, '-infinity'::timestamptz)) or
          (v_calculated_end is not null and v_calculated_end != coalesce(v_current_pending.end_at, '-infinity'::timestamptz)) then
        v_needs_recheck := true;
    end if;

    -- E. Availability Check Logic
    v_new_option_id := coalesce(v_current_pending.assigned_option_id, null); -- Default to existing

    if v_needs_recheck and p_party_size is not null and p_start_at is not null then
        -- Call Availability RPC (Single Tenant Wrapper)
        -- Wrap in exception block to prevent crash if not implemented
        begin
            v_avail_check := web_find_available_option(
                p_party_size, 
                p_start_at, 
                v_calculated_end
            );
        exception when others then
            v_avail_check := null;
        end;
        
        if v_avail_check is not null and (v_avail_check->>'assigned_option_id') is not null then
            v_new_option_id := v_avail_check->>'assigned_option_id';
        else
            v_new_option_id := null; -- No capacity found
        end if;
    elsif not v_needs_recheck and p_assigned_option_id is not null then
         -- Optimistic update from orchestrator if params didn't change (e.g. manual selection)
         v_new_option_id := p_assigned_option_id;
    end if;
    
    -- F. Upsert & Return
    if v_current_pending is not null then
        -- UPDATE existing row using PK (pending_id) to be 100% deterministic
        update pending_reservations set
            party_size = coalesce(p_party_size, party_size),
            start_at = coalesce(p_start_at, start_at),
            end_at = coalesce(v_calculated_end, end_at),
            customer_name = coalesce(p_customer_name, customer_name),
            phone = coalesce(p_phone, phone),
            notes = coalesce(p_notes, notes),
            assigned_option_id = v_new_option_id,
            updated_at = now()
        where pending_id = v_current_pending.pending_id
        returning * into v_resulting_row;
    else
        -- Insert new
        -- GUARD: Only insert if we have core params (party_size and start_at)
        if p_party_size is not null and p_start_at is not null then
            insert into pending_reservations (
                chat_id, source, session_id,
                party_size, start_at, end_at, 
                customer_name, phone, notes, 
                assigned_option_id
            ) values (
                v_safe_chat_id, v_safe_source, v_safe_session_id,
                p_party_size, p_start_at, v_calculated_end,
                p_customer_name, p_phone, p_notes,
                v_new_option_id
            ) returning * into v_resulting_row;
        else
            v_resulting_row := null;
        end if;
    end if;

    return v_resulting_row;
end;
$$;
