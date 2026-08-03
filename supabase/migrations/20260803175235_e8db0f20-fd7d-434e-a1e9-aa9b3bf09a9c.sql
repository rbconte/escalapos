ALTER TABLE public.escalas ADD COLUMN IF NOT EXISTS demanda_id uuid;
ALTER TABLE public.ilha_planejamentos ADD COLUMN IF NOT EXISTS demanda_id uuid;
ALTER TABLE public.distribuicao_trabalho ADD COLUMN IF NOT EXISTS demanda_id uuid;

ALTER TABLE public.ilha_planejamentos ADD COLUMN IF NOT EXISTS programa_id uuid REFERENCES public.programas(id) ON DELETE SET NULL;
ALTER TABLE public.ilha_planejamentos ADD COLUMN IF NOT EXISTS pessoa_id uuid REFERENCES public.pessoas(id) ON DELETE SET NULL;
ALTER TABLE public.ilha_planejamentos ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Planejado';
ALTER TABLE public.ilha_planejamentos ADD COLUMN IF NOT EXISTS recursos_necessarios integer NOT NULL DEFAULT 0;

UPDATE public.escalas SET demanda_id = id WHERE demanda_id IS NULL;
UPDATE public.ilha_planejamentos SET demanda_id = id WHERE demanda_id IS NULL;
UPDATE public.distribuicao_trabalho SET demanda_id = id WHERE demanda_id IS NULL;

ALTER TABLE public.escalas ALTER COLUMN demanda_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.ilha_planejamentos ALTER COLUMN demanda_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.distribuicao_trabalho ALTER COLUMN demanda_id SET DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_escalas_demanda ON public.escalas(demanda_id);
CREATE INDEX IF NOT EXISTS idx_ilha_plan_demanda ON public.ilha_planejamentos(demanda_id);
CREATE INDEX IF NOT EXISTS idx_dist_demanda ON public.distribuicao_trabalho(demanda_id);
CREATE INDEX IF NOT EXISTS idx_escalas_data ON public.escalas(data);
CREATE INDEX IF NOT EXISTS idx_dist_data ON public.distribuicao_trabalho(data);