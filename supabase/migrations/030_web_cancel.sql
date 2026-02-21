-- 030_web_cancel.sql
-- Handles cancelling an ongoing booking session or a confirmed reservation for a given chat_id/session.

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
    -- 1. Check if there's a pending session and clear it
    SELECT id INTO v_pending_id
    FROM pending_bookings
    WHERE chat_id = p_chat_id AND source = p_source AND status IN ('collecting_info', 'offered')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_pending_id IS NOT NULL THEN
        UPDATE pending_bookings
        SET status = 'cancelled'
        WHERE id = v_pending_id;
    END IF;

    -- 2. Check if there is a CONFIRMED reservation in the future for this chat_id that we can cancel
    -- Assuming chat_id correlates to the reservation's source_session_id or customer data if we had it,
    -- For our system, when web_confirm runs, does it link the reservation to chat_id? Let's check reservations schema.
    -- Wait, reservations table has `source_id` which might be the chat_id. Let's look for active ones.
    
    FOR v_reservation_record IN
        SELECT * FROM reservations
        WHERE chat_id = p_chat_id 
          AND status IN ('CONFIRMED', 'waitlist') 
          AND start_at >= now()
        ORDER BY start_at ASC
    LOOP
        UPDATE reservations
        SET status = 'cancelled'
        WHERE id = v_reservation_record.id;
        
        v_cancelled_count := v_cancelled_count + 1;
        
        -- We only cancel the upcoming ones. If there's one, we jump out to return its details.
        -- Assuming they only have one upcoming reservation at a time via chat.
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
