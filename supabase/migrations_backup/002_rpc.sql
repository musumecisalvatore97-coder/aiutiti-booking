-- 0. Index for UPSERT support (REQUIRED for ON CONFLICT)
create unique index if not exists uq_pending_tenant_user on pending_reservations(tenant_id, user_id);

-- 1. Helper: Check Capacity (Physical Tables Aware)
create or replace function check_capacity(
    p_tenant_id uuid,
    p_party_size int,
    p_start timestamptz,
    p_end timestamptz,
    p_config jsonb
) returns text language plpgsql as $$
declare
    v_join_id text;
begin
    -- Logic: Find a Join where ALL constituent tables are physically free
    select j.join_id into v_join_id
    from table_joins j
    where j.tenant_id = p_tenant_id
      and j.seats >= p_party_size
      and not exists (
          -- Check Physical Blocks (Reservations)
          select 1 from reservation_table_blocks b
          where b.tenant_id = p_tenant_id
            and (b.table_id = j.table_a or (j.table_b is not null and b.table_id = j.table_b))
            and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start, p_end, '[)')
      )
      and not exists (
          -- Check Pending (Soft Lock via Option ID -> Table mapping implications)
          select 1 from pending_reservations pr
          join table_joins pr_j on pr_j.tenant_id = pr.tenant_id and pr_j.join_id = pr.assigned_option_id
          where pr.tenant_id = p_tenant_id
            and pr.updated_at > (now() - interval '15 minutes') -- Valid Pending
            and pr.assigned_option_id is not null
            and tstzrange(pr.start_at, pr.end_at, '[)') && tstzrange(p_start, p_end, '[)')
            -- Conflict if they share ANY table
            and (
                pr_j.table_a = j.table_a 
                or (j.table_b is not null and pr_j.table_a = j.table_b)
                or (pr_j.table_b is not null and (
                    pr_j.table_b = j.table_a 
                    or (j.table_b is not null and pr_j.table_b = j.table_b)
                ))
            )
      )
    order by j.seats asc
    limit 1;
    
    return v_join_id;
end;
$$ set search_path = public;


-- 2. Web Upsert Pending
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
    
    -- Variables to hold current state
    v_cur_people int;
    v_cur_customer_name text;
    v_cur_phone text;
    v_cur_start timestamptz;
    
    v_parsed_date date;
    v_parsed_time time;
begin
    -- A. Secure User ID (Support Auth or Session UUID)
    v_user_id := coalesce(auth.uid(), p_user_id);
    if v_user_id is null then raise exception 'Unauthorized'; end if;

    -- B. Load Tenant Config
    select config into v_config from tenants where id = p_tenant_id;
    if v_config is null then raise exception 'Tenant not found'; end if;
    
    v_duration := coalesce((v_config->>'booking_duration_minutes')::int, 120);
    v_timezone := coalesce(v_config->>'timezone', 'Europe/Rome');
    
    -- C. Upsert Pending (Unique Constraint ensures 1 per user)
    insert into pending_reservations (tenant_id, user_id)
    values (p_tenant_id, v_user_id)
    on conflict (tenant_id, user_id) do update 
    set updated_at = now() -- Touch updated_at to extend TTL
    returning id into v_pending_id;

    -- Update explicitly provided fields
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

    -- Calculate Timestamps with Timezone
    if (p_intent_data->>'date') is not null and (p_intent_data->>'time') is not null then
        v_parsed_date := (p_intent_data->>'date')::date;
        v_parsed_time := (p_intent_data->>'time')::time;
        
        -- Construct timestamp in the specific timezone
        v_start := (v_parsed_date || ' ' || v_parsed_time)::timestamp AT TIME ZONE v_timezone;
        v_end := v_start + (v_duration || ' minutes')::interval;
        
        update pending_reservations set start_at = v_start, end_at = v_end 
        where id = v_pending_id;
    end if;
    
    -- Reload State
    select start_at, end_at, party_size, customer_name, phone 
    into v_cur_start, v_end, v_cur_people, v_cur_customer_name, v_cur_phone
    from pending_reservations where id = v_pending_id;

    -- D. Flow Checks
    if v_cur_start is null then
        return jsonb_build_object('reply', 'Per quando vorresti prenotare?');
    end if;
    
    if v_cur_people is null then
         return jsonb_build_object('reply', 'Per quante persone?');
    end if;

    -- E. Check Capacity
    v_option_id := check_capacity(p_tenant_id, v_cur_people, v_cur_start, v_end, v_config);
    
    if v_option_id is null then
         return jsonb_build_object('reply', 'Non ho tavoli liberi per quell''orario. Prova a cambiare orario.');
    else
         -- Soft Reserve
         update pending_reservations set assigned_option_id = v_option_id, updated_at = now()
         where id = v_pending_id;
    end if;

    -- F. Info Gathering
    if v_cur_customer_name is null then 
        return jsonb_build_object('reply', 'Disponibilità confermata! Come ti chiami?');
    end if;
    
    if v_cur_phone is null then
         return jsonb_build_object('reply', 'Grazie ' || v_cur_customer_name || '. Mi lasci un numero di telefono?');
    end if;

    -- Note: use HH24:MI format
    return jsonb_build_object('reply', 'Tutto pronto per ' || to_char(v_cur_start at time zone v_timezone, 'DD/MM HH24:MI') || '. Confermi la prenotazione? (Scrivi "Confermo")');
end;
$$;


-- 3. Web Confirm (Transaction with Physical Blocks)
create or replace function web_confirm(
    p_tenant_id uuid,
    p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_pending record;
    v_res_id uuid;
    v_join record;
    v_timezone text;
begin
    v_user_id := coalesce(auth.uid(), p_user_id);
    if v_user_id is null then raise exception 'Unauthorized'; end if;

    -- Load Timezone for output
    select coalesce(config->>'timezone', 'Europe/Rome') into v_timezone 
    from tenants where id = p_tenant_id;

    -- Get Pending
    select * into v_pending from pending_reservations
    where tenant_id = p_tenant_id and user_id = v_user_id
    limit 1;
    
    -- Validation: Existence
    if v_pending is null or v_pending.assigned_option_id is null then
        return jsonb_build_object('reply', 'Nessuna prenotazione in attesa.');
    end if;

    -- Validation: TTL (15 mins)
    if v_pending.updated_at < (now() - interval '15 minutes') then
        return jsonb_build_object('reply', 'La sessione è scaduta. Riprova.');
    end if;

    -- Validation: Missing Fields
    if v_pending.customer_name is null or v_pending.phone is null then
         return jsonb_build_object('reply', 'Mancano dei dati (Nome o Telefono). Completali prima di confermare.');
    end if;
    
    -- Get Physical Tables for the Option
    select * into v_join from table_joins 
    where tenant_id = p_tenant_id and join_id = v_pending.assigned_option_id;

    if v_join is null then
        raise exception 'Invalid option ID configuration';
    end if;

    -- TRANSACTION START
    -- 1. Insert Reservation Metadata
    insert into reservations (
        tenant_id, assigned_option_id, user_id, 
        customer_name, phone, party_size, start_at, end_at
    ) values (
        v_pending.tenant_id, v_pending.assigned_option_id, v_pending.user_id,
        v_pending.customer_name, v_pending.phone, v_pending.party_size, v_pending.start_at, v_pending.end_at
    ) returning id into v_res_id;

    -- 2. Insert Physical Blocks (Propagates Locks)
    -- Table A
    insert into reservation_table_blocks (tenant_id, table_id, reservation_id, start_at, end_at)
    values (v_pending.tenant_id, v_join.table_a, v_res_id, v_pending.start_at, v_pending.end_at);

    -- Table B (if exists)
    if v_join.table_b is not null then
        insert into reservation_table_blocks (tenant_id, table_id, reservation_id, start_at, end_at)
        values (v_pending.tenant_id, v_join.table_b, v_res_id, v_pending.start_at, v_pending.end_at);
    end if;
    
    -- 3. Cleanup
    delete from pending_reservations where id = v_pending.id;
    
    return jsonb_build_object('reply', 'Prenotazione Confermata per ' || to_char(v_pending.start_at at time zone v_timezone, 'DD/MM HH24:MI') || '! Ti aspettiamo.');

exception 
    when exclusion_violation then
        -- Catch double booking (someone inserted into blocks table just before us)
        return jsonb_build_object('reply', 'Ci dispiace, il tavolo è stato appena prenotato da qualcun altro. Riprova con un altro orario.');
end;
$$;


-- 4. Web Cancel
create or replace function web_cancel(
    p_tenant_id uuid,
    p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
begin
    v_user_id := coalesce(auth.uid(), p_user_id);
    if v_user_id is null then raise exception 'Unauthorized'; end if;
    
    delete from pending_reservations
    where tenant_id = p_tenant_id and user_id = v_user_id;
    
    return jsonb_build_object('reply', 'Prenotazione annullata.');
end;
$$;
