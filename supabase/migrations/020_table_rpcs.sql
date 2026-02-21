-- 020_table_rpcs.sql

-- 1. Helper: Ensure Tables Exist (Seed)
-- This is a procedural block to seed data if empty
DO $$
DECLARE
    v_tenant_id uuid;
BEGIN
    -- Try to find a tenant, or use the first one
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
    
    IF v_tenant_id IS NOT NULL THEN
        -- Check if tables exist
        IF NOT EXISTS (SELECT 1 FROM restaurant_tables WHERE tenant_id = v_tenant_id) THEN
            -- Insert 8 default tables
            INSERT INTO restaurant_tables (tenant_id, label, capacity, zone_id) VALUES
            (v_tenant_id, 'T1', 2, NULL),
            (v_tenant_id, 'T2', 2, NULL),
            (v_tenant_id, 'T3', 4, NULL),
            (v_tenant_id, 'T4', 4, NULL),
            (v_tenant_id, 'T5', 4, NULL),
            (v_tenant_id, 'T6 (VIP)', 6, NULL),
            (v_tenant_id, 'T7', 2, NULL),
            (v_tenant_id, 'T8', 8, NULL);
        END IF;
    END IF;
END $$;

-- 2. RPC: Get Floor State
-- Returns all tables with their CURRENT active session (if any) for the given shift
CREATE OR REPLACE FUNCTION get_floor_state(
    p_tenant_id uuid,
    p_shift_id uuid
)
RETURNS TABLE (
    table_id uuid,
    label text,
    capacity int,
    session_id uuid,
    session_status text,
    pax int,
    opened_at timestamptz,
    bill_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as table_id,
        t.label,
        t.capacity,
        s.id as session_id,
        s.status as session_status,
        s.pax,
        s.opened_at,
        -- Calculate provisional total if needed (for now 0 or join bills)
        COALESCE(b.total_amount, 0) as bill_total
    FROM restaurant_tables t
    LEFT JOIN table_sessions s ON t.id = s.table_id 
        AND s.shift_id = p_shift_id 
        AND s.status != 'closed'
    LEFT JOIN operational_bills b ON b.session_id = s.id 
        AND b.status != 'paid' 
        AND b.status != 'voided'
    WHERE t.tenant_id = p_tenant_id
    ORDER BY t.label;
END;
$$;

-- 3. RPC: Open Table Session
CREATE OR REPLACE FUNCTION open_table_session(
    p_table_id uuid,
    p_shift_id uuid,
    p_pax int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_id uuid;
    v_active_check uuid;
    v_tenant_id uuid;
BEGIN
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

    -- Create Session
    INSERT INTO table_sessions (tenant_id, table_id, shift_id, status, pax, opened_at)
    VALUES (v_tenant_id, p_table_id, p_shift_id, 'seated', p_pax, now())
    RETURNING id INTO v_session_id;
    
    -- Auto-create a Draft Bill for convenience
    INSERT INTO operational_bills (tenant_id, session_id, shift_id, status, total_amount)
    VALUES (v_tenant_id, v_session_id, p_shift_id, 'draft', 0);

    RETURN jsonb_build_object('status', 'OK', 'session_id', v_session_id);
END;
$$;
