-- 018_liveops_enhancements.sql

-- 1. RPC to close a table session
CREATE OR REPLACE FUNCTION close_table_session(
    p_table_id text,
    p_shift_id bigint,
    p_actual_amount numeric(10, 2) DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_session_id bigint;
BEGIN
    -- Find active session for this table in this shift
    SELECT id INTO v_session_id
    FROM table_sessions
    WHERE table_id = p_table_id AND shift_id = p_shift_id AND status = 'open'
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

-- 2. RPC to get today's reservations
CREATE OR REPLACE FUNCTION get_todays_reservations(p_tenant_id bigint)
RETURNS TABLE (
    reservation_id uuid,
    customer_name text,
    phone text,
    party_size int,
    start_at timestamptz,
    status text,
    assigned_tables text[]
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.reservation_id,
        r.customer_name,
        r.phone,
        r.party_size,
        r.start_at,
        r.status,
        r.assigned_table_ids
    FROM reservations r
    -- Simple check for reservations that start today (using UTC/app server time)
    WHERE r.start_at >= date_trunc('day', now()) 
      AND r.start_at < date_trunc('day', now() + interval '1 day')
      AND (r.status = 'CONFIRMED' OR r.status = 'SEATED')
    ORDER BY r.start_at ASC;
END;
$$;
