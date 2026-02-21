-- 024_fix_close_table_status.sql
-- Fixes the bug where close_table_session searched for status = 'open' instead of status != 'closed'

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
    -- Find active session for this table in this shift
    -- FIX: Session status is 'seated', 'ordering', 'eating', etc., not 'open'
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
        closed_at = now(),
        expected_cash = p_actual_amount -- For now, we assume expected == actual for a table checkout
    WHERE id = v_session_id;

    RETURN jsonb_build_object('status', 'OK', 'session_id', v_session_id);
END;
$$;
