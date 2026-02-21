-- 018_operational_tables.sql

-- 1. Support for Multi-tenancy (if not already present)
CREATE TABLE IF NOT EXISTS public.tenants (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Ensure profiles exists and has tenant_id
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    first_name text,
    last_name text,
    role text DEFAULT 'staff',
    tenant_id uuid REFERENCES public.tenants(id),
    created_at timestamptz DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.profiles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE public.profiles ADD COLUMN role text DEFAULT 'staff';
    END IF;
END $$;


-- 2. Shifts
CREATE TABLE IF NOT EXISTS public.shifts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) NOT NULL,
    opened_by uuid REFERENCES public.profiles(id),
    closed_by uuid REFERENCES public.profiles(id),
    started_at timestamptz DEFAULT now(),
    ended_at timestamptz,
    status text CHECK (status IN ('open', 'closed')),
    expected_cash numeric(10,2) DEFAULT 0,
    actual_cash numeric(10,2),
    difference numeric(10,2),
    notes text
);

-- 3. Restaurant Tables
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) NOT NULL,
    label text NOT NULL,
    capacity int,
    zone_id uuid, -- For future use
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- 4. Table Sessions (The core of "Active Table")
CREATE TABLE IF NOT EXISTS public.table_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) NOT NULL,
    table_id uuid REFERENCES public.restaurant_tables(id) NOT NULL,
    shift_id uuid REFERENCES public.shifts(id) NOT NULL,
    status text CHECK (status IN ('seated', 'ordering', 'eating', 'bill_requested', 'paying', 'closed')) DEFAULT 'seated',
    pax int DEFAULT 2,
    opened_at timestamptz DEFAULT now(),
    closed_at timestamptz,
    start_time timestamptz DEFAULT now(), -- Redundant but useful for simpler queries
    notes text
);

-- 5. Operational Bills (Shadow Bill)
CREATE TABLE IF NOT EXISTS public.operational_bills (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) NOT NULL,
    session_id uuid REFERENCES public.table_sessions(id),
    shift_id uuid REFERENCES public.shifts(id),
    bill_number serial, -- Simple serial for now
    status text CHECK (status IN ('draft', 'pre_close', 'paid', 'voided')) DEFAULT 'draft',
    total_amount numeric(10,2) DEFAULT 0,
    total_adjustments numeric(10,2) DEFAULT 0, -- Discounts
    final_amount numeric(10,2) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    closed_at timestamptz
);

-- 6. Bill Items
CREATE TABLE IF NOT EXISTS public.bill_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    bill_id uuid REFERENCES public.operational_bills(id) ON DELETE CASCADE,
    name text NOT NULL,
    quantity int DEFAULT 1,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(10,2) NOT NULL,
    category text,
    status text DEFAULT 'active',
    void_reason text
);

-- 7. Payments Declared (For reconciliation)
CREATE TABLE IF NOT EXISTS public.payments_declared (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    bill_id uuid REFERENCES public.operational_bills(id),
    method text CHECK (method IN ('cash', 'card', 'voucher', 'other')),
    amount numeric(10,2) NOT NULL,
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES public.profiles(id)
);

-- 8. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) NOT NULL,
    actor_id uuid REFERENCES public.profiles(id),
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    diff jsonb,
    created_at timestamptz DEFAULT now()
);

-- RLS Policies (Start Strict but Allow All for now to avoid locking out during dev)
-- In production, these should be stricter.
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments_declared ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Simple "Allow All for Authenticated" policy for MVP Dev
-- (Ideally should filter by tenant_id)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'Allow all for authenticated') THEN
        CREATE POLICY "Allow all for authenticated" ON public.tenants FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Allow all for authenticated') THEN
        CREATE POLICY "Allow all for authenticated" ON public.profiles FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shifts' AND policyname = 'Allow all for authenticated') THEN
        CREATE POLICY "Allow all for authenticated" ON public.shifts FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'restaurant_tables' AND policyname = 'Allow all for authenticated') THEN
        CREATE POLICY "Allow all for authenticated" ON public.restaurant_tables FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'table_sessions' AND policyname = 'Allow all for authenticated') THEN
        CREATE POLICY "Allow all for authenticated" ON public.table_sessions FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operational_bills' AND policyname = 'Allow all for authenticated') THEN
        CREATE POLICY "Allow all for authenticated" ON public.operational_bills FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bill_items' AND policyname = 'Allow all for authenticated') THEN
         CREATE POLICY "Allow all for authenticated" ON public.bill_items FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments_declared' AND policyname = 'Allow all for authenticated') THEN
        CREATE POLICY "Allow all for authenticated" ON public.payments_declared FOR ALL USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Allow all for authenticated') THEN
        CREATE POLICY "Allow all for authenticated" ON public.audit_logs FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;
