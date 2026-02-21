-- 014_seed_tables.sql

-- Insert tables only if the table is empty
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tables LIMIT 1) THEN
        INSERT INTO tables (label, seats) VALUES
            ('T1', 2), ('T2', 2), ('T3', 2),
            ('T4', 4), ('T5', 4), ('T6', 4), ('T7', 4),
            ('T8', 6), ('T9', 6),
            ('T10', 8);
    END IF;
END $$;
