CREATE TABLE IF NOT EXISTS public.tenant_settings (
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE PRIMARY KEY,
    active_offer_text TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read/write their own tenant settings
CREATE POLICY "Admins can manage tenant settings"
ON public.tenant_settings
FOR ALL
TO authenticated
USING (
    tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
)
WITH CHECK (
    tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
);

-- Service role can read (for Edge Functions)
CREATE POLICY "Service Role read tenant settings"
ON public.tenant_settings
FOR SELECT
TO service_role
USING (true);

-- RPC for Admin to update the offer
CREATE OR REPLACE FUNCTION admin_update_offer(p_offer_text TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_role TEXT;
BEGIN
    -- Verify caller is admin
    SELECT tenant_id, role INTO v_tenant_id, v_user_role
    FROM profiles
    WHERE id = auth.uid();

    IF v_user_role != 'admin' THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Unauthorized');
    END IF;

    -- Upsert the setting
    INSERT INTO tenant_settings (tenant_id, active_offer_text, updated_at)
    VALUES (v_tenant_id, p_offer_text, NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
        active_offer_text = EXCLUDED.active_offer_text,
        updated_at = NOW();

    RETURN jsonb_build_object('status', 'OK', 'message', 'Offer updated successfully');
END;
$$;
