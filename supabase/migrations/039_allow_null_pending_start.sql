-- 039_allow_null_pending_start.sql
-- We need to allow partial states in pending_reservations (e.g., when the user only gives the date but not the time).
-- The web_upsert_pending RPC inserts NULL if information is missing, but the table constraints were blocking it.

ALTER TABLE public.pending_reservations
    ALTER COLUMN start_at DROP NOT NULL,
    ALTER COLUMN party_size DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS partial_date text,
    ADD COLUMN IF NOT EXISTS partial_time text;

DROP FUNCTION IF EXISTS web_upsert_pending(text, text, text, int, timestamptz, timestamptz, text, text, text, text);

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
    p_assigned_option_id text default null,
    p_partial_date text default null,
    p_partial_time text default null
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
        
        -- Availability Check ONLY if we have BOTH core variables
        IF coalesce(p_party_size, v_current_pending.party_size) IS NOT NULL AND coalesce(p_start_at, v_current_pending.start_at) IS NOT NULL THEN
            BEGIN
                v_found_join_id := web_find_available_option(
                    coalesce(p_party_size, v_current_pending.party_size), 
                    coalesce(p_start_at, v_current_pending.start_at), 
                    coalesce(v_calculated_end, v_current_pending.end_at)
                );
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
            partial_date = coalesce(p_partial_date, partial_date),
            partial_time = coalesce(p_partial_time, partial_time),
            updated_at = now()
        WHERE pending_id = v_pending_id
        RETURNING * INTO v_resulting_row;
        
    ELSE
        -- INSERT: Allow partial inserts so we don't block the state machine.
        -- We only block if ALL contextual fields are NULL.
        IF p_party_size IS NOT NULL OR p_start_at IS NOT NULL OR p_customer_name IS NOT NULL OR p_phone IS NOT NULL OR p_partial_date IS NOT NULL OR p_partial_time IS NOT NULL THEN
            
            -- Avail Check ONLY if we have both
            IF p_party_size IS NOT NULL AND p_start_at IS NOT NULL THEN
               BEGIN
                   v_found_join_id := web_find_available_option(p_party_size, p_start_at, v_calculated_end);
                   v_new_option_id := v_found_join_id;
               EXCEPTION WHEN OTHERS THEN NULL; END;
            END IF;

            INSERT INTO pending_reservations (
                chat_id, source, session_id,
                party_size, start_at, end_at, 
                customer_name, phone, notes, 
                assigned_option_id,
                partial_date, partial_time
            ) VALUES (
                v_safe_chat_id, 
                v_safe_source, 
                v_safe_session_id,
                p_party_size, p_start_at, v_calculated_end,
                p_customer_name, p_phone, p_notes,
                v_new_option_id,
                p_partial_date, p_partial_time
            ) RETURNING * INTO v_resulting_row;
        ELSE
             -- Absolutely nothing to insert
             v_resulting_row := NULL;
        END IF;
    END IF;

    RETURN v_resulting_row;
END;
$$;
