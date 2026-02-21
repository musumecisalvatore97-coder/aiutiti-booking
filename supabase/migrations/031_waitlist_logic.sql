-- 031_waitlist_logic.sql
-- Adds an RPC to confirm a pending reservation into the Waitlist

CREATE OR REPLACE FUNCTION public.web_waitlist_confirm(
    p_chat_id text,
    p_source text,
    p_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_pending_id uuid;
    v_pending record;
    v_res_id uuid;
    v_safe_source text;
    v_safe_chat_id text;
    v_safe_session_id text;
BEGIN
    v_safe_source := lower(trim(coalesce(p_source, 'web')));
    v_safe_chat_id := nullif(trim(coalesce(p_chat_id, '')), '');
    v_safe_session_id := nullif(trim(coalesce(p_session_id, '')), '');

    -- Find Pending
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

    -- Validate required fields (we need at least a name or size and time)
    IF v_pending.start_at IS NULL THEN
         RETURN jsonb_build_object('status', 'FAILED', 'reason', 'MISSING_DATE_TIME');
    END IF;
    
    IF v_pending.customer_name IS NULL OR v_pending.phone IS NULL THEN
         RETURN jsonb_build_object('status', 'FAILED', 'reason', 'MISSING_CONTACT_INFO');
    END IF;

    -- Insert Waitlist Reservation
    BEGIN
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
            'waitlist', -- Special Status
            NULL, -- No tables
            coalesce(v_safe_chat_id, v_safe_session_id)
        ) RETURNING reservation_id INTO v_res_id; 

        -- Create Audit Log
        INSERT INTO audit_logs (action, table_name, record_id, details)
        VALUES ('insert', 'reservations', v_res_id, jsonb_build_object('status', 'waitlist'));

        -- Clean up pending
        UPDATE pending_reservations SET status = 'confirmed' WHERE pending_id = v_pending_id;

        RETURN jsonb_build_object(
            'status', 'OK',
            'reservation_id', v_res_id,
            'customer_name', v_pending.customer_name,
            'party_size', v_pending.party_size,
            'start_at', v_pending.start_at,
            'phone', v_pending.phone
        );
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('status', 'FAILED', 'reason', SQLERRM);
    END;
END;
$$;
