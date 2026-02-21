-- 005_pending_confirm_singletenant.sql
-- Refactor Booking Flow for Single Tenant (No Tenants, No TenantID)
-- STRICT: chat_id/source/session_id as keys.
-- STRICT: No dangerous defaults (party_size=0 or start_at=now()).

-- 1. App Configuration (Dynamic Durations)
create table if not exists app_config (
    key text primary key,
    value text
);

-- Seed default configuration if missing
insert into app_config (key, value) values 
('booking_duration_minutes', '120'),
('timezone', 'Europe/Rome')
on conflict do nothing;

-- 2. Schema Updates (Minimal)
-- Ensure 'notes' exists in pending_reservations
do $$ 
begin
    if not exists (select 1 from information_schema.columns where table_name = 'pending_reservations' and column_name = 'notes') then
        alter table pending_reservations add column notes text;
    end if;
end $$;

-- 3. Refactor: web_upsert_pending
-- Replaces previous logic. Supports SINGLE TENANT only.
-- Uses App Config for defaults.
-- Reruns capacity check ONLY if core params change.

-- FIX: Drop function first to allow signature change (defaults)
drop function if exists web_upsert_pending(text, text, text, integer, timestamptz, timestamptz, text, text, text, text);

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
    v_tz text;
    v_calculated_end timestamptz;
    
    v_safe_source text; -- Normalized source
    v_current_pending pending_reservations; -- Use row type
    v_new_option_id text;
    v_avail_check jsonb;
    
    v_needs_recheck boolean := false;
    v_resulting_row pending_reservations;
begin
    -- 0. Normalize Source
    v_safe_source := lower(trim(coalesce(p_source, 'web')));

    -- A. Load Config
    select value::int into v_booking_duration from app_config where key = 'booking_duration_minutes';
    if v_booking_duration is null then v_booking_duration := 120; end if;
    
    -- B. Handle defaults for logic (Not DB defaults)
    v_calculated_end := p_end_at;
    if p_start_at is not null and p_end_at is null then
        v_calculated_end := p_start_at + (v_booking_duration || ' minutes')::interval;
    end if;

    -- C. Resolve Existing State (Lookup by keys)
    -- STRICT: source must match. THEN (chat_id matches OR session_id matches)
    -- This handles casing where chat_id might be missing or session_id is the stable key.
    select * into v_current_pending 
    from pending_reservations 
    where source = v_safe_source 
      and (
           (p_chat_id is not null and chat_id = p_chat_id)
        or (p_session_id is not null and session_id = p_session_id)
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
        v_avail_check := web_find_available_option(
            p_party_size, 
            p_start_at, 
            v_calculated_end
        );
        
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
        -- This prevents creating invalid "zombie" pending rows from partial updates (e.g. just a name)
        if p_party_size is not null and p_start_at is not null then
            insert into pending_reservations (
                chat_id, source, session_id,
                party_size, start_at, end_at, 
                customer_name, phone, notes, 
                assigned_option_id
            ) values (
                p_chat_id, v_safe_source, p_session_id,
                p_party_size, p_start_at, v_calculated_end,
                p_customer_name, p_phone, p_notes,
                v_new_option_id
            ) returning * into v_resulting_row;
        else
            -- Invalid insert attempt (missing core data for new session)
            -- We return NULL to indicate no pending reservation exists or was created
            v_resulting_row := null;
        end if;
    end if;

    return v_resulting_row;
end;
$$;


-- 4. Refactor: web_confirm
-- Hardened Confirmation

-- FIX: Drop confirmation function just in case
drop function if exists web_confirm(text, text, text);

create or replace function web_confirm(
    p_chat_id text,
    p_source text,
    p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pending RECORD;
    v_res_id uuid;
    v_tables uuid[];
    v_t uuid;
    v_safe_source text; -- Normalized source
begin
    -- Normalize Source
    v_safe_source := lower(trim(coalesce(p_source, 'web')));
    
    -- Find Pending (Robust Dual-Key Lookup)
    select * into v_pending 
    from pending_reservations 
    where source = v_safe_source 
      and (
           (p_chat_id is not null and chat_id = p_chat_id)
        or (p_session_id is not null and session_id = p_session_id)
      )
    order by created_at desc 
    limit 1;
    
    if v_pending is null then
        return jsonb_build_object('status', 'FAILED', 'reason', 'NO_PENDING_FOUND');
    end if;

    -- Validate Option assignment
    if v_pending.assigned_option_id is null then
        return jsonb_build_object('status', 'FAILED', 'reason', 'NO_OPTION_ASSIGNED');
    end if;

    -- Resolve Tables for the Option (Single Tenant: Uses table_joins directly)
    -- FIX: table_joins has table_a, table_b columns. NOT option_id/table_id.
    select array_remove(array[table_a, table_b], null) into v_tables
    from table_joins
    where join_id = v_pending.assigned_option_id;

    if v_tables is null or array_length(v_tables, 1) is null then
         return jsonb_build_object('status', 'FAILED', 'reason', 'INVALID_OPTION_CONFIG');
    end if;

    -- Transaction Handled by Exception Block
    begin
        -- Insert Reservation
        insert into reservations (
            source, customer_name, phone, party_size, 
            start_at, end_at, notes, status, 
            assigned_table_ids, chat_id
        ) values (
            v_safe_source,
            v_pending.customer_name, 
            v_pending.phone, 
            v_pending.party_size,
            v_pending.start_at, 
            v_pending.end_at,
            v_pending.notes,
            'CONFIRMED', -- Reservation status
            v_tables, -- Now correctly uuid[]
            p_chat_id
        ) returning id into v_res_id; -- FIX: DB schema says id unique default gen_random_uuid(), primary key

        -- Insert Blocks (Locks)
        foreach v_t in array v_tables
        loop
            insert into reservation_table_blocks (
                reservation_id, table_id, start_at, end_at
            ) values (
                v_res_id, v_t, v_pending.start_at, v_pending.end_at
            );
        end loop;

        -- Remove Pending
        delete from pending_reservations 
        where pending_id = v_pending.pending_id;

        return jsonb_build_object(
            'status', 'OK', 
            'reservation_id', v_res_id
        );

    exception 
        when exclusion_violation then
            return jsonb_build_object('status', 'FAILED', 'reason', 'NO_AVAIL_CONFLICT');
        when others then
             return jsonb_build_object('status', 'FAILED', 'reason', SQLERRM);
    end;
end;
$$;


-- 5. Refactor: web_cancel
-- Simple cancellation of pending
create or replace function web_cancel(
    p_chat_id text,
    p_source text,
    p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_safe_source text;
    v_pending_id uuid;
begin
    v_safe_source := lower(trim(coalesce(p_source, 'web')));

    -- Find ID to delete (Dual Key Lookup)
    select pending_id into v_pending_id
    from pending_reservations
    where source = v_safe_source
      and (
        chat_id = p_chat_id 
        or (p_session_id is not null and session_id = p_session_id)
      )
    order by created_at desc
    limit 1;

    if v_pending_id is not null then
        delete from pending_reservations where pending_id = v_pending_id;
    end if;

    return jsonb_build_object('ok', true);
end;
$$;


-- 6. Tests (Commented)
/*
do $$
begin
    -- Setup Config
    insert into app_config (key, value) values ('booking_duration_minutes', '90') on conflict do nothing;
    
    -- Test Upsert
    perform web_upsert_pending(
        'chat123', 'telegram', 'sess001', 
        4, now() + interval '1 day', null, 
        'Test User', '1234567890', 'Test Note', null
    );

    -- Test Confirm
    -- perform web_confirm('chat123', 'telegram', 'sess001');
    
    -- Test Cancel
end $$;
*/

-- 7. RLS FIX (Authorized Access)
-- Ensure the RPC (and Service Role) can see the rows
alter table pending_reservations enable row level security;
drop policy if exists "No Access" on pending_reservations;
drop policy if exists "Allow All" on pending_reservations;
create policy "Allow All" on pending_reservations for all using (true) with check (true);

-- Grant permissions explicitly
grant all on pending_reservations to postgres, anon, authenticated, service_role;
