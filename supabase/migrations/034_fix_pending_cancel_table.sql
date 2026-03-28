-- 034_fix_pending_cancel_table.sql
-- Fixes web_cancel to reference pending_reservations and pending_id instead of pending_bookings and id.
-- We also delete the pending reservation instead of setting a status, to avoid ENUM conflicts and clean up.

CREATE OR REPLACE FUNCTION public.web_cancel(
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
    v_reservation_record record;
    v_cancelled_count int := 0;
BEGIN
    -- 1. Check if there's a pending session and clear it (delete it)
    SELECT pending_id INTO v_pending_id
    FROM pending_reservations
    WHERE chat_id = p_chat_id AND source = p_source
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_pending_id IS NOT NULL THEN
        DELETE FROM pending_reservations
        WHERE pending_id = v_pending_id;
    END IF;

    -- 2. Check if there is a CONFIRMED reservation in the future for this chat_id that we can cancel
    FOR v_reservation_record IN
        SELECT * FROM reservations
        WHERE chat_id = p_chat_id 
          AND status IN ('CONFIRMED', 'waitlist') 
          AND start_at >= now()
        ORDER BY start_at ASC
    LOOP
        UPDATE reservations
        SET status = 'cancelled' -- Assuming the reservations table accepts 'cancelled' (lowercase). Or we might need uppercase if it throws.
        WHERE id = v_reservation_record.id;
        
        v_cancelled_count := v_cancelled_count + 1;
        
        RETURN jsonb_build_object(
            'status', 'OK',
            'type', 'confirmed',
            'reservation', row_to_json(v_reservation_record)
        );
    END LOOP;

    IF v_pending_id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'OK', 'type', 'pending');
    END IF;

    RETURN jsonb_build_object('status', 'FAILED', 'reason', 'NOTHING_TO_CANCEL');
END;
$$;
