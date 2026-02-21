-- 019_operational_rpcs.sql

-- 1. Open Shift
CREATE OR REPLACE FUNCTION open_shift(
    p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_active_shift_id uuid;
    v_new_shift_id uuid;
    v_actor_id uuid;
BEGIN
    -- Get current user profile
    SELECT id INTO v_actor_id FROM profiles WHERE id = auth.uid();
    
    -- Check if there is already an open shift for this tenant
    SELECT id INTO v_active_shift_id 
    FROM shifts 
    WHERE tenant_id = p_tenant_id AND status = 'open' 
    LIMIT 1;

    IF v_active_shift_id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Shift already open', 'shift_id', v_active_shift_id);
    END IF;

    -- Create new shift
    INSERT INTO shifts (tenant_id, opened_by, status, started_at)
    VALUES (p_tenant_id, v_actor_id, 'open', now())
    RETURNING id INTO v_new_shift_id;

    -- Audit Log
    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, diff)
    VALUES (p_tenant_id, v_actor_id, 'open_shift', 'shift', v_new_shift_id, jsonb_build_object('started_at', now()));

    RETURN jsonb_build_object('status', 'OK', 'shift_id', v_new_shift_id);
END;
$$;

-- 2. Close Shift
CREATE OR REPLACE FUNCTION close_shift(
    p_shift_id uuid,
    p_actual_cash numeric,
    p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift RECORD;
    v_expected numeric;
    v_open_tables int;
    v_actor_id uuid;
BEGIN
    SELECT id INTO v_actor_id FROM profiles WHERE id = auth.uid();

    -- Get Shift info
    SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
    
    IF v_shift IS NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Shift not found');
    END IF;

    IF v_shift.status = 'closed' THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Shift already closed');
    END IF;

    -- 1. Check open tables
    SELECT count(*) INTO v_open_tables 
    FROM table_sessions 
    WHERE shift_id = p_shift_id AND status != 'closed';
  
    IF v_open_tables > 0 THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Cannot close shift. Tables are still open.', 'open_count', v_open_tables);
    END IF;

    -- 2. Calculate Expected Cash
    -- Sum of all payments declared as 'cash' for bills in this shift
    SELECT coalesce(sum(amount), 0) INTO v_expected 
    FROM payments_declared p
    JOIN operational_bills b ON b.id = p.bill_id
    WHERE b.shift_id = p_shift_id AND p.method = 'cash';

    -- 3. Update Shift
    UPDATE shifts SET 
        ended_at = now(),
        status = 'closed',
        closed_by = v_actor_id,
        actual_cash = p_actual_cash,
        expected_cash = v_expected,
        difference = (p_actual_cash - v_expected),
        notes = p_notes
    WHERE id = p_shift_id;

    -- Audit Log
    INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type, entity_id, diff)
    VALUES (v_shift.tenant_id, v_actor_id, 'close_shift', 'shift', p_shift_id, 
        jsonb_build_object('expected', v_expected, 'actual', p_actual_cash, 'diff', (p_actual_cash - v_expected))
    );
  
    RETURN jsonb_build_object('status', 'OK', 'summary', jsonb_build_object(
        'expected_cash', v_expected,
        'difference', (p_actual_cash - v_expected)
    ));
END;
$$;

-- 3. Get Active Shift
CREATE OR REPLACE FUNCTION get_active_shift(
    p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift RECORD;
BEGIN
    SELECT * INTO v_shift 
    FROM shifts 
    WHERE tenant_id = p_tenant_id AND status = 'open' 
    LIMIT 1;

    IF v_shift IS NULL THEN
        RETURN jsonb_build_object('active', false);
    ELSE
        RETURN jsonb_build_object('active', true, 'shift', row_to_json(v_shift));
    END IF;
END;
$$;
