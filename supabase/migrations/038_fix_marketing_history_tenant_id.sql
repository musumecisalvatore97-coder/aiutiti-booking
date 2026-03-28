-- 038_fix_marketing_history_tenant_id.sql

-- La tabella tenants usa uuid per id, ma abbiamo definito marketing_history.tenant_id come text.
-- Anche la funzione admin_update_offer prende un p_tenant_id di tipo text, il che causa cast mismatch
-- se si prova a fare un insert nella public.tenant_settings (dove tenant_id è tipicamente uuid).

-- 1. Puliamo eventuali righe problematiche e modifichiamo la tabella marketing_history
DELETE FROM public.marketing_history WHERE tenant_id = 'default';

ALTER TABLE public.marketing_history
ALTER COLUMN tenant_id DROP DEFAULT,
ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid;

-- 2. Aggiorniamo la funzione per accettare e usare UUID
DROP FUNCTION IF EXISTS public.admin_update_offer(text, text);

CREATE OR REPLACE FUNCTION public.admin_update_offer(p_tenant_id uuid, p_offer_text text)
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
