-- 028_force_drop_close_table.sql
-- Forcefully clean up any lingering versions of close_table_session that might be causing the expected_cash error.

DROP FUNCTION IF EXISTS public.close_table_session(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.close_table_session(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.close_table_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.close_table_session(p_table_id uuid, p_shift_id uuid, p_actual_amount numeric);


CREATE OR REPLACE FUNCTION public.close_table_session(
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

    -- Add to shift expected cash (in the shifts table, not table_sessions)
    UPDATE shifts
    SET expected_cash = expected_cash + p_actual_amount
    WHERE id = p_shift_id;

    RETURN jsonb_build_object('status', 'OK', 'session_id', v_session_id);
END;
$$;
