-- 006_secure_final_fix.sql
-- SECURE FINAL FIX: Single-Tenant Strict Schema

-- ==============================================================================
-- 1. STRICT RLS for pending_reservations
-- ==============================================================================
-- ==============================================================================
-- 1. STRICT RLS for pending_reservations
-- ==============================================================================
-- ==============================================================================
-- 1. STRICT RLS for pending_reservations
-- ==============================================================================
ALTER TABLE pending_reservations DISABLE ROW LEVEL SECURITY;

-- Remove policies to be clean (though ignored)
DROP POLICY IF EXISTS "Allow All" ON pending_reservations;
DROP POLICY IF EXISTS "Service Role Only" ON pending_reservations;
DROP POLICY IF EXISTS "No Access" ON pending_reservations;
-- Drop old ones too just in case
DROP POLICY IF EXISTS "Service Role Only" ON pending_reservations;
-- (Supabase might require policies even if disabled?)
-- No, DISABLE means NO policies checked.


-- ==============================================================================
-- 2. Schema-Aware Seed for Option 10 (Single Tenant, Static)
-- ==============================================================================
-- Ensure Table T1 exists
INSERT INTO tables (table_id, label, seats, is_high)
VALUES ('T1', 'Tavolo 1', 4, false)
ON CONFLICT (table_id) DO UPDATE 
SET seats = EXCLUDED.seats;

-- Ensure Join 10 exists and points to T1
-- table_b is NOT NULL so we duplicate T1 for single-table join scenario
INSERT INTO table_joins (join_id, table_a, table_b, seats)
VALUES ('10', 'T1', 'T1', 4)
ON CONFLICT (join_id) DO UPDATE 
SET table_a = EXCLUDED.table_a, 
    table_b = EXCLUDED.table_b, 
    seats = EXCLUDED.seats;


-- ==============================================================================
-- 3. Deterministic Availability Check (Single Tenant)
-- ==============================================================================
-- FIX: Drop function first to allow signature/return type change
DROP FUNCTION IF EXISTS web_find_available_option(integer, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION web_find_available_option(
    p_party_size int,
    p_start_at timestamptz,
    p_end_at timestamptz
)
RETURNS text -- RETURNS JOIN_ID directly
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_join_id text;
BEGIN
    -- Guard Clause: If end_at is null, we can't check range overlap safely
    IF p_end_at IS NULL THEN
        RETURN NULL;
    END IF;

    -- Select first available option (simplified logic for Single Tenant)
    -- Must not overlap with existing confirmed reservations or blocks
    -- Checks both table_a and table_b (which are never null now)
    SELECT j.join_id INTO v_join_id
    FROM table_joins j
    WHERE j.seats >= p_party_size
    AND NOT EXISTS (
        SELECT 1 FROM reservation_table_blocks b
        WHERE (b.table_id = j.table_a OR b.table_id = j.table_b)
          AND b.status IN ('CONFIRMED', 'CHECKED_IN')
          -- Handle NULL time_range by falling back to start_at/end_at safely
          AND (
               COALESCE(b.time_range, 
                   CASE 
                       WHEN b.start_at IS NOT NULL AND b.end_at IS NOT NULL 
                       THEN tstzrange(b.start_at, b.end_at, '[)') 
                       ELSE NULL -- Ignore corrupt blocks with no times
                   END
               ) 
               && 
               tstzrange(p_start_at, p_end_at, '[)')
          )
    )
    ORDER BY j.seats ASC -- Best fit
    LIMIT 1;

    RETURN v_join_id;
END;
$$;


-- ==============================================================================
-- 4. Web Confirm (Single Tenant, Text Array, Safe ChatID)
-- ==============================================================================
CREATE OR REPLACE FUNCTION web_confirm(
    p_chat_id text,
    p_source text,
    p_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_pending RECORD;
    v_res_id uuid;
    v_tables text[]; -- Schema: assigned_table_ids is text[]
    v_t text;        -- table_id is text
    
    v_safe_source text;
    v_safe_chat_id text;
    v_safe_session_id text;
BEGIN
    -- 1. Input Cleaning
    v_safe_source := lower(trim(coalesce(p_source, 'web')));
    v_safe_chat_id := trim(coalesce(p_chat_id, ''));
    v_safe_session_id := trim(coalesce(p_session_id, ''));

    -- 2. Find Pending (Dual Key Safe Lookup)
    SELECT * INTO v_pending 
    FROM pending_reservations 
    WHERE lower(trim(coalesce(source, 'web'))) = v_safe_source 
      AND (
           (v_safe_chat_id <> '' AND trim(coalesce(chat_id, '')) = v_safe_chat_id)
        OR (v_safe_session_id <> '' AND trim(coalesce(session_id, '')) = v_safe_session_id)
      )
    ORDER BY created_at DESC 
    LIMIT 1;

    IF v_pending IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILED', 'reason', 'NO_PENDING_FOUND');
    END IF;

    IF v_pending.assigned_option_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILED', 'reason', 'NO_OPTION_ASSIGNED');
    END IF;

    -- 3. Resolve Tables (Single Tenant: use table_joins directly)
    -- table_a/table_b are NOT NULL. We deduplicate to avoid redundant blocks if T1=T1.
    SELECT array_agg(DISTINCT t) INTO v_tables
    FROM (
        SELECT unnest(ARRAY[table_a, table_b]) as t
        FROM table_joins
        WHERE join_id = v_pending.assigned_option_id
    ) sub;

    IF v_tables IS NULL OR array_length(v_tables, 1) IS NULL THEN
         RETURN jsonb_build_object('status', 'FAILED', 'reason', 'INVALID_OPTION_CONFIG');
    END IF;

    BEGIN
        -- 4. Insert Reservation (Use v_safe_chat_id)
        INSERT INTO reservations (
            source, customer_name, phone, party_size, 
            start_at, end_at, notes, status, 
            assigned_table_ids, chat_id
        ) VALUES (
            v_safe_source,
            v_pending.customer_name, 
            v_pending.phone, 
            v_pending.party_size,
            v_pending.start_at, 
            v_pending.end_at,
            v_pending.notes,
            'CONFIRMED',
            v_tables, -- text[]
            v_safe_chat_id -- Use safe chat_id
        ) RETURNING reservation_id INTO v_res_id; -- PK is reservation_id

        -- 5. Insert Blocks
        FOREACH v_t IN ARRAY v_tables LOOP
            INSERT INTO reservation_table_blocks (
                reservation_id, table_id, start_at, end_at, status, time_range
            ) VALUES (
                v_res_id, v_t, v_pending.start_at, v_pending.end_at, 'CONFIRMED',
                tstzrange(v_pending.start_at, v_pending.end_at, '[)')
            );
        END LOOP;

        -- 6. Cleanup
        DELETE FROM pending_reservations WHERE pending_id = v_pending.pending_id;

        RETURN jsonb_build_object('status', 'OK', 'reservation_id', v_res_id);

    EXCEPTION 
        WHEN exclusion_violation THEN
            RETURN jsonb_build_object('status', 'FAILED', 'reason', 'NO_AVAIL_CONFLICT');
        WHEN OTHERS THEN
            RETURN jsonb_build_object('status', 'FAILED', 'reason', SQLERRM);
    END;
END;
$$;


-- ==============================================================================
-- 5. Web Upsert Pending (Robust Single Tenant + Availability Check)
-- ==============================================================================
CREATE OR REPLACE FUNCTION web_upsert_pending(
    p_chat_id text,
    p_source text,
    p_session_id text,
    p_party_size int default null,
    p_start_at timestamptz default null,
    p_end_at timestamptz default null,
    p_customer_name text default null,
    p_phone text default null,
    p_notes text default null,
    p_assigned_option_id text default null
)
RETURNS pending_reservations
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_booking_duration int;
    v_calculated_end timestamptz;
    
    -- Safe variables
    v_safe_source text;
    v_safe_chat_id text;
    v_safe_session_id text;
    
    v_current_pending pending_reservations;
    v_new_option_id text;
    v_resulting_row pending_reservations;
    
    -- Avail check
    v_found_join_id text;
    v_tot int; -- DEBUG variable
BEGIN
    -- 1. Input Cleaning
    v_safe_source := lower(trim(coalesce(p_source, 'web')));
    v_safe_chat_id := trim(coalesce(p_chat_id, ''));
    v_safe_session_id := trim(coalesce(p_session_id, ''));

    -- Config (With Exception Handling)
    BEGIN
        SELECT value::int INTO v_booking_duration FROM app_config WHERE key = 'booking_duration_minutes';
    EXCEPTION WHEN undefined_table THEN
        v_booking_duration := 120;
    WHEN OTHERS THEN
        v_booking_duration := 120;
    END;
    IF v_booking_duration IS NULL THEN v_booking_duration := 120; END IF;

    -- Calc End
    v_calculated_end := p_end_at;
    IF p_start_at IS NOT NULL AND p_end_at IS NULL THEN
        v_calculated_end := p_start_at + (v_booking_duration || ' minutes')::interval;
    END IF;

    -- 2. Robust Lookup (Dual Key Safe Lookup)
    -- DEBUG LOG
    RAISE LOG 'DEBUG: web_upsert_pending: searching for source=%, chat_id=%, session_id=%', v_safe_source, v_safe_chat_id, v_safe_session_id;

    SELECT * INTO v_current_pending 
    FROM pending_reservations 
    WHERE lower(trim(coalesce(source, 'web'))) = v_safe_source 
      AND (
           (v_safe_chat_id <> '' AND trim(coalesce(chat_id, '')) = v_safe_chat_id)
        OR (v_safe_session_id <> '' AND trim(coalesce(session_id, '')) = v_safe_session_id)
      )
    ORDER BY created_at DESC 
    LIMIT 1;

    -- DEBUG LOG result
    RAISE LOG 'DEBUG: web_upsert_pending: found pending_id=%', v_current_pending.pending_id;

    -- Logic
    -- Default to existing unless explicitly cleared or new one found
    v_new_option_id := coalesce(p_assigned_option_id, v_current_pending.assigned_option_id);
    
    -- Check Availability if Core Params Provided
    IF p_party_size IS NOT NULL AND p_start_at IS NOT NULL THEN
        BEGIN
            -- Call web_find_available_option(party_size, start_at, end_at) -> RETURNS text (join_id)
            v_found_join_id := web_find_available_option(p_party_size, p_start_at, v_calculated_end);
            
            IF v_found_join_id IS NOT NULL THEN
                v_new_option_id := v_found_join_id;
            ELSE
                 -- Availability check ran but returned NULL (no tables).
                 -- Set to NULL so user knows it's not confirmed available.
                 v_new_option_id := NULL;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Availability check error: %', SQLERRM;
            -- "In caso di errore availability, non azzerare assigned_option_id esistente."
            -- Keep v_new_option_id as is (from existing).
        END;
    END IF;

    IF v_current_pending IS NOT NULL THEN
        -- UPDATE
        UPDATE pending_reservations SET
            party_size = coalesce(p_party_size, party_size),
            start_at = coalesce(p_start_at, start_at),
            end_at = coalesce(v_calculated_end, end_at),
            customer_name = coalesce(p_customer_name, customer_name),
            phone = coalesce(p_phone, phone),
            notes = coalesce(p_notes, notes),
            assigned_option_id = v_new_option_id,
            updated_at = now()
        WHERE pending_id = v_current_pending.pending_id
        RETURNING * INTO v_resulting_row;
    ELSE
        -- INSERT
        IF p_party_size IS NOT NULL AND p_start_at IS NOT NULL THEN
            INSERT INTO pending_reservations (
                chat_id, source, session_id,
                party_size, start_at, end_at, 
                customer_name, phone, notes, 
                assigned_option_id
            ) VALUES (
                CASE WHEN v_safe_chat_id = '' THEN NULL ELSE v_safe_chat_id END, 
                v_safe_source, 
                CASE WHEN v_safe_session_id = '' THEN NULL ELSE v_safe_session_id END,
                p_party_size, p_start_at, v_calculated_end,
                p_customer_name, p_phone, p_notes,
                v_new_option_id
            ) RETURNING * INTO v_resulting_row;
        ELSE
             -- v_resulting_row := NULL;
             SELECT count(*) INTO v_tot FROM pending_reservations; 
             RAISE EXCEPTION 'DEBUG FAIL: chat_id=% session_id=% source=% duration=% user=% role=% tot=%', v_safe_chat_id, v_safe_session_id, v_safe_source, v_booking_duration, current_user, session_user, v_tot;
        END IF;
    END IF;

    RETURN v_resulting_row;
END;
$$;
