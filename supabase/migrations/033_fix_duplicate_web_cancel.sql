-- 033_fix_duplicate_web_cancel.sql
-- Drops the old web_cancel function that took a 4th argument (p_reservation_id) causing ambiguity.

DROP FUNCTION IF EXISTS public.web_cancel(text, text, text, uuid);
