-- 015_force_logic.sql

-- 1. SEED TABLES (Idempotent)
INSERT INTO tables (label, seats)
SELECT t.label, t.seats
FROM (VALUES 
    ('T1', 2), ('T2', 2), ('T3', 2),
    ('T4', 4), ('T5', 4), ('T6', 4), ('T7', 4),
    ('T8', 6), ('T9', 6),
    ('T10', 8)
) as t(label, seats)
WHERE NOT EXISTS (SELECT 1 FROM tables);

-- 2. RECREATE FUNCTION
DROP FUNCTION IF EXISTS web_upsert_pending(text,text,text,int,timestamptz,timestamptz,text,text,text,text);

CREATE OR REPLACE FUNCTION web_upsert_pending(
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
RETURNS pending_reservations
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_booking_duration int;
    v_calculated_end timestamptz;
    
    v_safe_source text;
    v_safe_chat_id text;
    v_safe_session_id text;
    
    v_current_pending pending_reservations;
    v_pending_id uuid;
    v_new_option_id text;
    v_resulting_row pending_reservations;
    v_found_join_id text;
BEGIN
    -- 1. Input Cleaning
    v_safe_source := lower(trim(coalesce(p_source, 'web')));
    v_safe_chat_id := nullif(trim(coalesce(p_chat_id, '')), '');
    v_safe_session_id := nullif(trim(coalesce(p_session_id, '')), '');

    -- Config 
    BEGIN
        SELECT value::int INTO v_booking_duration FROM app_config WHERE key = 'booking_duration_minutes';
    EXCEPTION WHEN OTHERS THEN v_booking_duration := 120; END;
    IF v_booking_duration IS NULL THEN v_booking_duration := 120; END IF;

    v_calculated_end := p_end_at;
    IF p_start_at IS NOT NULL AND p_end_at IS NULL THEN
        v_calculated_end := p_start_at + (v_booking_duration || ' minutes')::interval;
    END IF;

    -- 2. Lookup (Explicit ID fetch first)
    SELECT pending_id INTO v_pending_id
    FROM pending_reservations 
    WHERE 
       (v_safe_session_id IS NOT NULL AND session_id = v_safe_session_id)
       OR 
       (v_safe_chat_id IS NOT NULL AND chat_id = v_safe_chat_id)
    ORDER BY created_at DESC 
    LIMIT 1;

    IF FOUND AND v_pending_id IS NOT NULL THEN
        -- LOAD FULL ROW
        SELECT * INTO v_current_pending FROM pending_reservations WHERE pending_id = v_pending_id;
        
        v_new_option_id := coalesce(p_assigned_option_id, v_current_pending.assigned_option_id);
        
        -- Availability Check
        IF p_party_size IS NOT NULL AND p_start_at IS NOT NULL THEN
            BEGIN
                v_found_join_id := web_find_available_option(p_party_size, p_start_at, v_calculated_end);
                v_new_option_id := v_found_join_id;
            EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;

        -- UPDATE
        UPDATE pending_reservations SET
            party_size = coalesce(p_party_size, party_size),
            start_at = coalesce(p_start_at, start_at),
            end_at = coalesce(v_calculated_end, end_at),
            customer_name = coalesce(p_customer_name, customer_name),
            phone = coalesce(p_phone, phone),
            notes = coalesce(p_notes, notes),
            assigned_option_id = v_new_option_id,
            updated_at = now()
        WHERE pending_id = v_pending_id
        RETURNING * INTO v_resulting_row;
        
    ELSE
        -- INSERT
        -- CRITICAL CHANGE: Only insert if we have MINIMUM requirements to check availability OR if it's a specific action.
        -- Actually, for "hello", we have neither party_size nor start_at.
        -- So we should RETURN NULL.
        
        IF p_party_size IS NOT NULL AND p_start_at IS NOT NULL THEN
            -- Avail Check
            BEGIN
               v_found_join_id := web_find_available_option(p_party_size, p_start_at, v_calculated_end);
               v_new_option_id := v_found_join_id;
            EXCEPTION WHEN OTHERS THEN NULL; END;

            INSERT INTO pending_reservations (
                chat_id, source, session_id,
                party_size, start_at, end_at, 
                customer_name, phone, notes, 
                assigned_option_id
            ) VALUES (
                v_safe_chat_id, 
                v_safe_source, 
                v_safe_session_id,
                p_party_size, p_start_at, v_calculated_end,
                p_customer_name, p_phone, p_notes,
                v_new_option_id
            ) RETURNING * INTO v_resulting_row;
        ELSE
             -- No existing reservation found, and not enough info to create one.
             -- Return NULL/Empty so the calling function/API can ask for more info.
             v_resulting_row := NULL;
        END IF;
    END IF;

    RETURN v_resulting_row;
END;
$$;
