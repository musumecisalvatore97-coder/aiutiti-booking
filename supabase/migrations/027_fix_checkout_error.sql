-- 027_fix_checkout_error.sql
-- Fixes the expected_cash column error when closing a table by removing it from the table_sessions update and instead updating the operational_bills and shifts table.

CREATE OR REPLACE FUNCTION close_table_session(
    p_table_id uuid,
    p_shift_id uuid,
    p_actual_amount numeric(10, 2) DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_session_id uuid;
BEGIN
    SELECT id INTO v_session_id
    FROM table_sessions
    WHERE table_id = p_table_id AND shift_id = p_shift_id AND status != 'closed'
    ORDER BY opened_at DESC
    LIMIT 1;

    IF v_session_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILED', 'reason', 'NO_ACTIVE_SESSION_FOUND');
    END IF;

    -- Update session
    UPDATE table_sessions
    SET status = 'closed',
        closed_at = now()
    WHERE id = v_session_id;

    -- Update draft bill
    UPDATE operational_bills
    SET status = 'paid',
        final_amount = p_actual_amount,
        closed_at = now()
    WHERE session_id = v_session_id;

    -- Add to shift expected cash
    UPDATE shifts
    SET expected_cash = expected_cash + p_actual_amount
    WHERE id = p_shift_id;

    RETURN jsonb_build_object('status', 'OK', 'session_id', v_session_id);
END;
$$;
