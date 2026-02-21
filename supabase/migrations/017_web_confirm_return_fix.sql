-- 017_fix_web_confirm_return.sql

CREATE OR REPLACE FUNCTION web_confirm(
    p_chat_id text,
    p_source text,
    p_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_pending RECORD;
    v_res_id uuid;
    v_tables text[]; 
    v_t text;        
    
    v_safe_source text;
    v_safe_chat_id text;
    v_safe_session_id text;
    
    v_pending_id uuid;
BEGIN
    -- 1. Input Cleaning
    v_safe_source := lower(trim(coalesce(p_source, 'web')));
    v_safe_chat_id := nullif(trim(coalesce(p_chat_id, '')), '');
    v_safe_session_id := nullif(trim(coalesce(p_session_id, '')), '');

    -- 2. Find Pending (Reuse 011 logic style)
    SELECT pending_id INTO v_pending_id
    FROM pending_reservations 
    WHERE 
       (v_safe_session_id IS NOT NULL AND session_id = v_safe_session_id)
       OR 
       (v_safe_chat_id IS NOT NULL AND chat_id = v_safe_chat_id)
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_pending_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILED', 'reason', 'NO_PENDING_FOUND');
    END IF;

    SELECT * INTO v_pending FROM pending_reservations WHERE pending_id = v_pending_id;

    IF v_pending.assigned_option_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILED', 'reason', 'NO_OPTION_ASSIGNED');
    END IF;

    -- 3. Resolve Tables
    SELECT array_agg(DISTINCT t) INTO v_tables
    FROM (
        SELECT unnest(ARRAY[table_a, table_b]) as t
        FROM table_joins
        WHERE join_id = v_pending.assigned_option_id
    ) sub;

    IF v_tables IS NULL OR array_length(v_tables, 1) IS NULL THEN
         RETURN jsonb_build_object('status', 'FAILED', 'reason', 'INVALID_OPTION_CONFIG');
    END IF;

    BEGIN
        -- 4. Insert Reservation
        INSERT INTO reservations (
            source, customer_name, phone, party_size, 
            start_at, end_at, notes, status, 
            assigned_table_ids, chat_id
        ) VALUES (
            v_safe_source,
            v_pending.customer_name, 
            v_pending.phone, 
            v_pending.party_size,
            v_pending.start_at, 
            v_pending.end_at,
            v_pending.notes,
            'CONFIRMED',
            v_tables, 
            coalesce(v_safe_chat_id, v_safe_session_id)
        ) RETURNING reservation_id INTO v_res_id; 

        -- 5. Insert Blocks
        FOREACH v_t IN ARRAY v_tables LOOP
            INSERT INTO reservation_table_blocks (
                reservation_id, table_id, start_at, end_at, status
            ) VALUES (
                v_res_id, v_t, v_pending.start_at, v_pending.end_at, 'CONFIRMED'
            );
        END LOOP;

        -- 6. Cleanup
        DELETE FROM pending_reservations WHERE pending_id = v_pending.pending_id;

        -- 7. RETURN FULL DETAILS (Fix for Notification)
        RETURN jsonb_build_object(
            'status', 'OK', 
            'reservation_id', v_res_id,
            'customer_name', v_pending.customer_name,
            'party_size', v_pending.party_size,
            'phone', v_pending.phone,
            'start_at', v_pending.start_at
        );

    EXCEPTION 
        WHEN exclusion_violation THEN
            RETURN jsonb_build_object('status', 'FAILED', 'reason', 'NO_AVAIL_CONFLICT');
        WHEN OTHERS THEN
            RETURN jsonb_build_object('status', 'FAILED', 'reason', SQLERRM);
    END;
END;
$$;
