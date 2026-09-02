CREATE TABLE public.grupos_plantao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  cor text NOT NULL DEFAULT '#2563eb',
  tipo text NOT NULL DEFAULT 'Plantão',
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos_plantao TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos_plantao TO anon;
GRANT ALL ON public.grupos_plantao TO service_role;
ALTER TABLE public.grupos_plantao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public manage grupos_plantao" ON public.grupos_plantao FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER set_updated_at_grupos_plantao BEFORE UPDATE ON public.grupos_plantao FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.grupo_plantao_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.grupos_plantao(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  papel text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, pessoa_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupo_plantao_membros TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupo_plantao_membros TO anon;
GRANT ALL ON public.grupo_plantao_membros TO service_role;
ALTER TABLE public.grupo_plantao_membros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public manage grupo_plantao_membros" ON public.grupo_plantao_membros FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.feriados_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL UNIQUE,
  nome text NOT NULL,
  escopo text NOT NULL DEFAULT 'Personalizado',
  plantao_inicio date,
  plantao_fim date,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  customizado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feriados_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feriados_config TO anon;
GRANT ALL ON public.feriados_config TO service_role;
ALTER TABLE public.feriados_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public manage feriados_config" ON public.feriados_config FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER set_updated_at_feriados_config BEFORE UPDATE ON public.feriados_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.feriado_escalas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  grupo_id uuid REFERENCES public.grupos_plantao(id) ON DELETE SET NULL,
  situacao text NOT NULL DEFAULT 'Trabalha',
  hora_inicio time,
  hora_fim time,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data, pessoa_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feriado_escalas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feriado_escalas TO anon;
GRANT ALL ON public.feriado_escalas TO service_role;
ALTER TABLE public.feriado_escalas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public manage feriado_escalas" ON public.feriado_escalas FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER set_updated_at_feriado_escalas BEFORE UPDATE ON public.feriado_escalas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();