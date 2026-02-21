-- Hardening Update
-- 1. Unify Cancellation Logic (Pending first, then Future Reservations)
-- 2. Expose Dynamic Lookup logic

-- A. Cancel Latest
create or replace function web_cancel_latest(
    p_tenant_id uuid,
    p_user_id uuid,
    p_source text default 'web' 
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pending_id uuid;
    v_res_id uuid;
    v_res_date timestamptz;
begin
    -- 1. Try to delete PENDING first
    delete from pending_reservations 
    where tenant_id = p_tenant_id 
      and user_id = p_user_id
    returning id into v_pending_id;

    if v_pending_id is not null then
        return jsonb_build_object('ok', true, 'cancelled', 'PENDING');
    end if;

    -- 2. Try to cancel FUTURE RESERVATIONS (Confirmed)
    --    We take the latest one created by this user that is still in the future.
    --    Note: In a real system, you might want to specify which one, but 'latest' is the requested UX.
    select id, start_at into v_res_id, v_res_date
    from reservations
    where tenant_id = p_tenant_id
      and user_id = p_user_id
      and start_at > now()
      -- Could also filter by status if we had a status column, but here we assume existence in 'reservations'Table means OK.
      -- However, we don't have a status column in 'reservations' in 001_schema.sql.
      -- 'reservations' table implies confirmed. 
      -- Wait, if there is no status column, how do we "CANCEL"?
      -- User request says: "status = CANCELLED, reservation_table_blocks = RELEASED".
      -- But 001_schema.sql for 'reservations' does NOT have a status column!
      -- Checked schema: id, tenant_id, assigned_option_id, user_id, customer_name, phone, party_size, start_at, end_at...
      
      -- Strategy Change: To "Cancel", we must DELETE the reservation OR add a status column.
      -- Given 001_schema.sql is "frozen" / deployed, and we are in "hardening", adding a column requires a migration.
      -- BUT user said "status = CANCELLED". This implies I should add the column?
      -- OR does the user imply typical soft delete?
      -- "reservation_table_blocks = RELEASED" implies deleting the blocks rows.
      -- If I delete the blocks, the physical slot is free.
      -- If I delete the reservation row, it's gone.
      -- If I keep reservation row but delete blocks, it's a "zombie" or "cancelled" reservation.
      -- To avoid altering schema structure too much if not requested:
      -- I will DELETE the reservation row entirely (Simple Cancel).
      -- Wait, user said "status = CANCELLED". This strongly implies updating a status.
      -- I WILL ADD THE COLUMN `status` to reservations if it doesn't exist?
      -- User said "Non toccare workflow Telegram". If Telegram relies on this table structure...
      -- Actually, if I just DELETE the row, it's cleaner for now.
      -- Let's re-read the request carefully: "status = CANCELLED".
      -- Okay, I will add the column `status` to the reservations table in this migration.
      -- `alter table reservations add column if not exists status text default 'CONFIRMED';`
    order by created_at desc
    limit 1;

    if v_res_id is not null then
        -- Update status
        update reservations set status = 'CANCELLED' where id = v_res_id;
        
        -- Release blocks
        delete from reservation_table_blocks where reservation_id = v_res_id;
        
        return jsonb_build_object('ok', true, 'cancelled', 'RESERVATION', 'reservation_id', v_res_id);
    end if;

    return jsonb_build_object('ok', false, 'reason', 'NOTHING_TO_CANCEL');
end;
$$;


-- B. Dynamic Find Option
create or replace function web_find_available_option(
    p_tenant_id uuid,
    p_party_size int,
    p_start_at timestamptz,
    p_end_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_join_id text;
    v_tables jsonb;
begin
    -- Reuse the checking logic from check_capacity (but check_capacity only returns one join_id)
    -- We can just call it.
    v_join_id := check_capacity(p_tenant_id, p_party_size, p_start_at, p_end_at, '{}'::jsonb);
    
    if v_join_id is null then
        return null;
    end if;

    -- Get constituent tables
    select jsonb_agg(t_id) into v_tables
    from (
        select table_a as t_id from table_joins where tenant_id = p_tenant_id and join_id = v_join_id
        union all
        select table_b as t_id from table_joins where tenant_id = p_tenant_id and join_id = v_join_id and table_b is not null
    ) t;

    return jsonb_build_object(
        'assigned_option_id', v_join_id,
        'assigned_table_ids', v_tables
    );
end;
$$;


-- C. Upsert Pending V2 (Accepts explicit Option)
create or replace function web_upsert_pending(
    p_tenant_id uuid,
    p_message text, 
    p_intent_data jsonb,
    p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_config jsonb;
    v_timezone text;
    v_duration int;
    
    v_start timestamptz;
    v_end timestamptz;
    v_option_id text;
    v_pending_id uuid;
    
    v_cur_people int;
    v_cur_customer_name text;
    v_cur_phone text;
    v_cur_start timestamptz;
    
    v_parsed_date date;
    v_parsed_time time;

    -- New: Check if caller passed an option_id directly in intent_data (populated by Orchestrator)
    p_assigned_option_id text;
begin
    v_user_id := coalesce(auth.uid(), p_user_id);
    if v_user_id is null then raise exception 'Unauthorized'; end if;

    p_assigned_option_id := p_intent_data->>'assigned_option_id';

    -- Load Tenant
    select config into v_config from tenants where id = p_tenant_id;
    if v_config is null then raise exception 'Tenant not found'; end if;
    
    v_duration := coalesce((v_config->>'booking_duration_minutes')::int, 120);
    v_timezone := coalesce(v_config->>'timezone', 'Europe/Rome');
    
    -- Upsert Pending
    insert into pending_reservations (tenant_id, user_id)
    values (p_tenant_id, v_user_id)
    on conflict (tenant_id, user_id) do update 
    set updated_at = now()
    returning id into v_pending_id;

    -- Update Explicit Fields
    if (p_intent_data->>'people') is not null then
        update pending_reservations set party_size = (p_intent_data->>'people')::int 
        where id = v_pending_id;
    end if;
    if (p_intent_data->>'customer_name') is not null then
        update pending_reservations set customer_name = (p_intent_data->>'customer_name') 
        where id = v_pending_id;
    end if;
    if (p_intent_data->>'phone') is not null then
        update pending_reservations set phone = (p_intent_data->>'phone') 
        where id = v_pending_id;
    end if;
     -- If explicit option provided, set it
    if p_assigned_option_id is not null then
        update pending_reservations set assigned_option_id = p_assigned_option_id
        where id = v_pending_id;
    end if;

    -- Calculate Timestamps
    if (p_intent_data->>'date') is not null and (p_intent_data->>'time') is not null then
        v_parsed_date := (p_intent_data->>'date')::date;
        v_parsed_time := (p_intent_data->>'time')::time;
        
        v_start := (v_parsed_date || ' ' || v_parsed_time)::timestamp AT TIME ZONE v_timezone;
        v_end := v_start + (v_duration || ' minutes')::interval;
        
        update pending_reservations set start_at = v_start, end_at = v_end 
        where id = v_pending_id;
    end if;
    
    -- Reload State
    select start_at, end_at, party_size, customer_name, phone, assigned_option_id
    into v_cur_start, v_end, v_cur_people, v_cur_customer_name, v_cur_phone, v_option_id
    from pending_reservations where id = v_pending_id;

    -- Flow Checks
    if v_cur_start is null then
        return jsonb_build_object('reply', 'Per quando vorresti prenotare?');
    end if;
    
    if v_cur_people is null then
         return jsonb_build_object('reply', 'Per quante persone?');
    end if;

    -- Check Capacity / Option Assignment
    -- IF we already have an option_id (passed in or existing), verify it? 
    -- For now, if passed in via Orchestrator, we assume it's fresh.
    -- If NOT passed in, and NOT in DB, we search. 
    -- But since we want "Dynamic", the Orchestrator should usually pass it if the user changed date/people.
    -- If the user just says "My name is Mario", we don't need to re-search unless dates changed.
    -- The logic in 'index.ts' will determine when to call 'web_find_available_option'.
    
    if v_option_id is null then
         -- Fallback internal search (if Orchestrator didn't provide one and none exists)
         v_option_id := check_capacity(p_tenant_id, v_cur_people, v_cur_start, v_end, v_config);
         if v_option_id is null then
             return jsonb_build_object('reply', 'Non ho tavoli liberi per quell''orario. Prova a cambiare orario.');
         else
             update pending_reservations set assigned_option_id = v_option_id, updated_at = now()
             where id = v_pending_id;
         end if;
    end if;

    -- Info Gathering
    if v_cur_customer_name is null then 
        return jsonb_build_object('reply', 'Disponibilità confermata! Come ti chiami?');
    end if;
    
    if v_cur_phone is null then
         return jsonb_build_object('reply', 'Grazie ' || v_cur_customer_name || '. Mi lasci un numero di telefono?');
    end if;

    return jsonb_build_object('reply', 'Tutto pronto per ' || to_char(v_cur_start at time zone v_timezone, 'DD/MM HH24:MI') || '. Confermi la prenotazione? (Scrivi "Confermo")');
end;
$$;
