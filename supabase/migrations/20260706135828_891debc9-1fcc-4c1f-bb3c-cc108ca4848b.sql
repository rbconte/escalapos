
-- ILHA_PLANEJAMENTOS
CREATE TABLE public.ilha_planejamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ilha_id UUID NOT NULL REFERENCES public.ilhas(id) ON DELETE CASCADE,
  produto TEXT NOT NULL,
  cor TEXT,
  area TEXT,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  hora_inicio TIME NOT NULL DEFAULT '08:00',
  hora_fim TIME NOT NULL DEFAULT '18:00',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ilha_planejamentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ilha_planejamentos TO anon;
GRANT ALL ON public.ilha_planejamentos TO service_role;

ALTER TABLE public.ilha_planejamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public manage ilha_planejamentos" ON public.ilha_planejamentos
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_ilha_plan_ilha ON public.ilha_planejamentos(ilha_id);
CREATE INDEX idx_ilha_plan_datas ON public.ilha_planejamentos(data_inicio, data_fim);

CREATE TRIGGER ilha_planejamentos_set_updated_at
  BEFORE UPDATE ON public.ilha_planejamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- DISTRIBUICAO_TRABALHO
CREATE TABLE public.distribuicao_trabalho (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  ilha_id UUID NOT NULL REFERENCES public.ilhas(id) ON DELETE CASCADE,
  produto TEXT,
  programa_id UUID REFERENCES public.programas(id) ON DELETE SET NULL,
  retranca TEXT,
  parceiro_conteudo TEXT,
  pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL,
  hora_inicio TIME NOT NULL DEFAULT '08:00',
  hora_fim TIME NOT NULL DEFAULT '18:00',
  status TEXT NOT NULL DEFAULT 'Planejado' CHECK (status IN ('Planejado','Em Andamento','Concluído','Cancelado')),
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribuicao_trabalho TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribuicao_trabalho TO anon;
GRANT ALL ON public.distribuicao_trabalho TO service_role;

ALTER TABLE public.distribuicao_trabalho ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public manage distribuicao_trabalho" ON public.distribuicao_trabalho
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_distribuicao_data ON public.distribuicao_trabalho(data);
CREATE INDEX idx_distribuicao_ilha ON public.distribuicao_trabalho(ilha_id);
CREATE INDEX idx_distribuicao_pessoa ON public.distribuicao_trabalho(pessoa_id);

CREATE TRIGGER distribuicao_trabalho_set_updated_at
  BEFORE UPDATE ON public.distribuicao_trabalho
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
