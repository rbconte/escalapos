DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'performance_impact') THEN
    CREATE TYPE public.performance_impact AS ENUM ('baixo', 'medio', 'alto');
  END IF;
END $$;

ALTER TABLE public.performance_records
  ADD COLUMN IF NOT EXISTS impact public.performance_impact NOT NULL DEFAULT 'medio';