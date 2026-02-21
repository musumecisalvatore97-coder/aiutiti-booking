-- 007_fix_web_upsert.sql

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
    
    -- Safe variables
    v_safe_source text;
    v_safe_chat_id text;
    v_safe_session_id text;
    
    v_current_pending pending_reservations;
    v_new_option_id text;
    v_resulting_row pending_reservations;
    
    -- Avail check
    v_found_join_id text;
    
    -- Debug
    v_tot int;
    v_dbg_chat text;
    v_dbg_sess text;
    v_dbg_src text;
BEGIN
    -- 1. Input Cleaning
    v_safe_source := lower(trim(coalesce(p_source, 'web')));
    v_safe_chat_id := trim(coalesce(p_chat_id, ''));
    v_safe_session_id := trim(coalesce(p_session_id, ''));

    -- Config 
    BEGIN
        SELECT value::int INTO v_booking_duration FROM app_config WHERE key = 'booking_duration_minutes';
    EXCEPTION WHEN OTHERS THEN
        v_booking_duration := 120;
    END;
    IF v_booking_duration IS NULL THEN v_booking_duration := 120; END IF;

    -- Calc End
    v_calculated_end := p_end_at;
    IF p_start_at IS NOT NULL AND p_end_at IS NULL THEN
        v_calculated_end := p_start_at + (v_booking_duration || ' minutes')::interval;
    END IF;

    -- 2. Robust Lookup (SIMPLIFIED)
    -- Ignore source for now, trust unique session/chat id
    SELECT * INTO v_current_pending 
    FROM pending_reservations 
    WHERE 
       (v_safe_chat_id <> '' AND chat_id = v_safe_chat_id)
       OR 
       (v_safe_session_id <> '' AND session_id = v_safe_session_id)
    ORDER BY created_at DESC 
    LIMIT 1;

    -- Logic
    v_new_option_id := coalesce(p_assigned_option_id, v_current_pending.assigned_option_id);
    
    -- Check Availability if Core Params Provided
    IF p_party_size IS NOT NULL AND p_start_at IS NOT NULL THEN
        BEGIN
            v_found_join_id := web_find_available_option(p_party_size, p_start_at, v_calculated_end);
            
            IF v_found_join_id IS NOT NULL THEN
                v_new_option_id := v_found_join_id;
            ELSE
                 v_new_option_id := NULL;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Availability check error: %', SQLERRM;
        END;
    END IF;

    IF v_current_pending IS NOT NULL THEN
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
        WHERE pending_id = v_current_pending.pending_id
        RETURNING * INTO v_resulting_row;
    ELSE
        -- INSERT
        IF p_party_size IS NOT NULL AND p_start_at IS NOT NULL THEN
            INSERT INTO pending_reservations (
                chat_id, source, session_id,
                party_size, start_at, end_at, 
                customer_name, phone, notes, 
                assigned_option_id
            ) VALUES (
                CASE WHEN v_safe_chat_id = '' THEN NULL ELSE v_safe_chat_id END, 
                v_safe_source, 
                CASE WHEN v_safe_session_id = '' THEN NULL ELSE v_safe_session_id END,
                p_party_size, p_start_at, v_calculated_end,
                p_customer_name, p_phone, p_notes,
                v_new_option_id
            ) RETURNING * INTO v_resulting_row;
        ELSE
             -- DEBUG FAILURE
             SELECT count(*), 
                    (array_agg(chat_id))[1], 
                    (array_agg(session_id))[1], 
                    (array_agg(source))[1]
             INTO v_tot, v_dbg_chat, v_dbg_sess, v_dbg_src
             FROM pending_reservations
             ORDER BY created_at DESC LIMIT 1;

             RAISE EXCEPTION 'DEBUG FAIL: No Match. Input: chat=% sess=% source=%. DB has % rows. Top row: chat=% sess=% source=%', 
                v_safe_chat_id, v_safe_session_id, v_safe_source, 
                v_tot, v_dbg_chat, v_dbg_sess, v_dbg_src;
        END IF;
    END IF;

    RETURN v_resulting_row;
END;
$$;
