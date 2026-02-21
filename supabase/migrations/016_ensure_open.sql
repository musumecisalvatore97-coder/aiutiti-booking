-- 016_ensure_open.sql

-- Ensure table exists
CREATE TABLE IF NOT EXISTS opening_hours (
    id bigint generated always as identity primary key,
    day_of_week int not null check (day_of_week between 0 and 6),
    open_time time not null,
    close_time time not null,
    created_at timestamptz default now()
);

-- Enable RLS (best practice) but allow public read for now? or service role?
ALTER TABLE opening_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read opening_hours" ON opening_hours
    FOR SELECT TO anon, authenticated USING (true);


-- Ensure we have opening hours so availability checks don't fail by default
INSERT INTO opening_hours (day_of_week, open_time, close_time)
SELECT d, '00:00'::time, '23:59'::time
FROM generate_series(0, 6) d
WHERE NOT EXISTS (SELECT 1 FROM opening_hours);
