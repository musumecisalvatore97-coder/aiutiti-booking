-- 029_cancel_reservation_rpc.sql
-- Adds an RPC to cancel a reservation and updates the reservation status to 'cancelled'.

CREATE OR REPLACE FUNCTION public.cancel_reservation(
    p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_reservation_record record;
BEGIN
    -- Check if reservation exists
    SELECT * INTO v_reservation_record
    FROM reservations
    WHERE id = p_reservation_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'FAILED', 'reason', 'RESERVATION_NOT_FOUND');
    END IF;

    -- Update reservation status
    UPDATE reservations
    SET status = 'cancelled'
    WHERE id = p_reservation_id;

    RETURN jsonb_build_object(
        'status', 'OK',
        'reservation', row_to_json(v_reservation_record)
    );
END;
$$;
