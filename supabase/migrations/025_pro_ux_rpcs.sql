-- 025_pro_ux_rpcs.sql

-- 1. RPC to update session status
CREATE OR REPLACE FUNCTION update_table_session_status(
    p_session_id uuid,
    p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    -- Validate status (matches check constraint)
    IF p_status NOT IN ('seated', 'ordering', 'eating', 'bill_requested', 'paying', 'closed') THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Invalid status');
    END IF;

    UPDATE table_sessions
    SET status = p_status
    WHERE id = p_session_id;

    RETURN jsonb_build_object('status', 'OK');
END;
$$;

-- 2. RPC to assign a reservation to a table (Seat reservation)
CREATE OR REPLACE FUNCTION assign_table_to_reservation(
    p_reservation_id uuid,
    p_table_id uuid,
    p_shift_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_res RECORD;
    v_session_id uuid;
    v_tenant_id uuid;
    v_active_check uuid;
BEGIN
    -- Get reservation details
    SELECT * INTO v_res FROM reservations WHERE reservation_id = p_reservation_id;
    
    IF v_res IS NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Reservation not found');
    END IF;

    -- Check if table is already busy
    SELECT id INTO v_active_check
    FROM table_sessions
    WHERE table_id = p_table_id 
      AND shift_id = p_shift_id 
      AND status != 'closed';
      
    IF v_active_check IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Table already occupied');
    END IF;

    -- Get tenant
    SELECT tenant_id INTO v_tenant_id FROM restaurant_tables WHERE id = p_table_id;

    -- 1. Create Session for the table
    INSERT INTO table_sessions (tenant_id, table_id, shift_id, status, pax, opened_at, notes)
    VALUES (v_tenant_id, p_table_id, p_shift_id, 'seated', v_res.party_size, now(), 'Reservation: ' || v_res.customer_name)
    RETURNING id INTO v_session_id;
    
    -- 2. Auto-create a Draft Bill
    INSERT INTO operational_bills (tenant_id, session_id, shift_id, status, total_amount)
    VALUES (v_tenant_id, v_session_id, p_shift_id, 'draft', 0);

    -- 3. Update Reservation Status
    UPDATE reservations
    SET status = 'SEATED',
        assigned_table_ids = ARRAY[p_table_id::text]
    WHERE reservation_id = p_reservation_id;

    RETURN jsonb_build_object('status', 'OK', 'session_id', v_session_id);
END;
$$;
