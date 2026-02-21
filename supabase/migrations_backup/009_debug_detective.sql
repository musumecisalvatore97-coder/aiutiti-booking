-- 009_debug_detective.sql

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
    v_new_option_id text;
    v_resulting_row pending_reservations;
    v_found_join_id text;
    
    -- Debug vars
    v_tot int;
    v_last_chat text;
    v_last_sess text;
    v_last_src text;
    v_last_id uuid;
    v_last_ts timestamptz;
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

    -- 2. Lookup
    SELECT * INTO v_current_pending 
    FROM pending_reservations 
    WHERE 
       (v_safe_session_id IS NOT NULL AND session_id = v_safe_session_id)
       OR 
       (v_safe_chat_id IS NOT NULL AND chat_id = v_safe_chat_id)
    ORDER BY created_at DESC 
    LIMIT 1;

    v_new_option_id := coalesce(p_assigned_option_id, v_current_pending.assigned_option_id);
    
    -- Avail Check
    IF p_party_size IS NOT NULL AND p_start_at IS NOT NULL THEN
        BEGIN
            v_found_join_id := web_find_available_option(p_party_size, p_start_at, v_calculated_end);
            v_new_option_id := v_found_join_id; 
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF v_current_pending IS NOT NULL THEN
        UPDATE pending_reservations SET
            party_size = coalesce(p_party_size, party_size),
            start_at = coalesce(p_start_at, start_at),
            end_at = coalesce(v_calculated_end, end_at),
            customer_name = coalesce(p_customer_name, customer_name),
            phone = coalesce(p_phone, phone),
            notes = coalesce(p_notes, notes),
            assigned_option_id = v_new_option_id,
            updated_at = now()
        WHERE pending_id = v_current_pending.pending_id
        RETURNING * INTO v_resulting_row;
    ELSE
        IF p_party_size IS NOT NULL AND p_start_at IS NOT NULL THEN
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
             -- DEBUG FAILURE
             SELECT count(*) INTO v_tot FROM pending_reservations;
             
             -- Get THE VERY LAST ROW created
             SELECT pending_id, chat_id, session_id, source, created_at 
             INTO v_last_id, v_last_chat, v_last_sess, v_last_src, v_last_ts
             FROM pending_reservations 
             ORDER BY created_at DESC 
             LIMIT 1;
             
             RAISE EXCEPTION 'DEBUG DETECTIVE: No Match. Input: chat=% sess=% source=%. Total Rows: %. LAST ROW in DB: id=% chat=% sess=% src=% time=%', 
                v_safe_chat_id, v_safe_session_id, v_safe_source, 
                v_tot, v_last_id, v_last_chat, v_last_sess, v_last_src, v_last_ts;
        END IF;
    END IF;

    RETURN v_resulting_row;
END;
$$;
