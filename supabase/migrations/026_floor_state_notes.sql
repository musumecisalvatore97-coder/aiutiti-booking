-- 026_floor_state_notes.sql

DROP FUNCTION IF EXISTS get_floor_state(uuid, uuid);

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
    bill_total numeric,
    session_notes text
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
        COALESCE(b.total_amount, 0) as bill_total,
        s.notes as session_notes
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
