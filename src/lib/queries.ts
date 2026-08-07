import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type {
  EscalaCompleta,
  Funcao,
  Ilha,
  PessoaComFuncao,
  ProgramaComConteudo,
  TipoConteudo,
} from "./domain";
import type { Ocorrencia } from "./validacoes";

export type Ferias = Tables<"ferias">;
export type Licenca = Tables<"licencas">;

export type OcorrenciaComPessoa = Ocorrencia & {
  pessoa: { id: string; nome: string } | null;
};

export const conteudosQuery = () =>
  queryOptions({
    queryKey: ["conteudos"],
    queryFn: async (): Promise<TipoConteudo[]> => {
      const { data, error } = await supabase
        .from("tipos_conteudo")
        .select("*")
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

export const funcoesQuery = () =>
  queryOptions({
    queryKey: ["funcoes"],
    queryFn: async (): Promise<Funcao[]> => {
      const { data, error } = await supabase
        .from("funcoes")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

export const programasQuery = () =>
  queryOptions({
    queryKey: ["programas"],
    queryFn: async (): Promise<ProgramaComConteudo[]> => {
      const { data, error } = await supabase
        .from("programas")
        .select("*, conteudo:tipos_conteudo(*)")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ProgramaComConteudo[];
    },
  });

export type ProgramaNecessidade = Tables<"programa_necessidades">;

/** Returns a map: programa_id -> { [dia_semana 0..6]: quantidade }. */
export const programaNecessidadesQuery = () =>
  queryOptions({
    queryKey: ["programa_necessidades"],
    queryFn: async (): Promise<ProgramaNecessidade[]> => {
      const { data, error } = await supabase
        .from("programa_necessidades")
        .select("*");
      if (error) throw error;
      return data ?? [];
    },
  });


export const ilhasQuery = () =>
  queryOptions({
    queryKey: ["ilhas"],
    queryFn: async (): Promise<Ilha[]> => {
      const { data, error } = await supabase
        .from("ilhas")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

export const pessoasQuery = () =>
  queryOptions({
    queryKey: ["pessoas"],
    queryFn: async (): Promise<PessoaComFuncao[]> => {
      const { data, error } = await supabase
        .from("pessoas")
        .select("*, funcao:funcoes(*)")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as PessoaComFuncao[];
    },
  });

export const escalasQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["escalas", from, to],
    queryFn: async (): Promise<EscalaCompleta[]> => {
      const { data, error } = await supabase
        .from("escalas")
        .select("*, programa:programas(*, conteudo:tipos_conteudo(*)), ilha:ilhas(*)")
        .gte("data", from)
        .lte("data", to);
      if (error) throw error;
      return (data ?? []) as EscalaCompleta[];
    },
  });

export const ocorrenciasQuery = () =>
  queryOptions({
    queryKey: ["ocorrencias"],
    queryFn: async (): Promise<OcorrenciaComPessoa[]> => {
      const { data, error } = await supabase
        .from("ocorrencias")
        .select("*, pessoa:pessoas(id, nome)")
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OcorrenciaComPessoa[];
    },
  });

export const feriasQuery = (from?: string, to?: string) =>
  queryOptions({
    queryKey: ["ferias", from ?? "all", to ?? "all"],
    queryFn: async (): Promise<Ferias[]> => {
      let q = supabase.from("ferias").select("*").order("data_inicio", { ascending: false });
      if (from) q = q.gte("data_fim", from);
      if (to) q = q.lte("data_inicio", to);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const todasFeriasQuery = () =>
  queryOptions({
    queryKey: ["ferias", "all"],
    queryFn: async (): Promise<Ferias[]> => {
      const { data, error } = await supabase
        .from("ferias")
        .select("*")
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const licencasQuery = (from?: string, to?: string) =>
  queryOptions({
    queryKey: ["licencas", from ?? "all", to ?? "all"],
    queryFn: async (): Promise<Licenca[]> => {
      let q = supabase.from("licencas").select("*").order("data_inicio", { ascending: false });
      if (from) q = q.gte("data_fim", from);
      if (to) q = q.lte("data_inicio", to);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export type Situacao = Tables<"situacoes">;

export const situacoesQuery = () =>
  queryOptions({
    queryKey: ["situacoes"],
    queryFn: async (): Promise<Situacao[]> => {
      const { data, error } = await supabase
        .from("situacoes")
        .select("*")
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
