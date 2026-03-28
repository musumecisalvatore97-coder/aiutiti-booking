-- 037_marketing_history.sql

CREATE TABLE IF NOT EXISTS public.marketing_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL DEFAULT 'default',
    promo_text text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT marketing_history_pkey PRIMARY KEY (id)
);

ALTER TABLE public.marketing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read for marketing_history" ON public.marketing_history
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow authenticated insert for marketing_history" ON public.marketing_history
    FOR INSERT TO authenticated WITH CHECK (true);


-- Modifica admin_update_offer per salvare lo storico se il testo non è vuoto e non è identico all'ultimo

CREATE OR REPLACE FUNCTION public.admin_update_offer(p_tenant_id text, p_offer_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_last_promo text;
BEGIN
    -- Aggiorna o Inserisci nella tenant_settings
    INSERT INTO public.tenant_settings (tenant_id, active_offer_text, updated_at)
    VALUES (p_tenant_id, p_offer_text, now())
    ON CONFLICT (tenant_id)
    DO UPDATE SET 
        active_offer_text = p_offer_text,
        updated_at = now();

    -- Se c'è un testo promozionale, controlla l'ultimo inserito nello storico
    IF p_offer_text IS NOT NULL AND trim(p_offer_text) <> '' THEN
        SELECT promo_text INTO v_last_promo 
        FROM public.marketing_history 
        WHERE tenant_id = p_tenant_id 
        ORDER BY created_at DESC 
        LIMIT 1;

        -- Inserisci in history solo se è nuovo rispetto all'ultimo
        IF v_last_promo IS DISTINCT FROM p_offer_text THEN
            INSERT INTO public.marketing_history (tenant_id, promo_text)
            VALUES (p_tenant_id, p_offer_text);
        END IF;
    END IF;
END;
$$;
