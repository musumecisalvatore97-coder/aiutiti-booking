-- 021_update_tenant_name.sql

-- 1. Update the default tenant name (Targets the first found tenant)
-- We assume there is at least one tenant seeded.
UPDATE tenants
SET name = 'DL Food and Drink'
WHERE id IN (SELECT id FROM tenants LIMIT 1);

-- 2. Add slug column for future use (Nullable for now to avoid issues)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- 3. Set slug for the existing tenant just in case
UPDATE tenants
SET slug = 'dl-food-drink'
WHERE name = 'DL Food and Drink';
