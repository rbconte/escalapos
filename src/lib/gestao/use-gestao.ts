import { useSuspenseQueries } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import {
  conteudosQuery,
  escalasQuery,
  feriasQuery,
  ilhasQuery,
  licencasQuery,
  ocorrenciasQuery,
  pessoasQuery,
  programasQuery,
} from "@/lib/queries";
import { resolvePeriodo } from "@/lib/gestao/filtros";
import {
  filtrarEscalas,
  filtrarPessoas,
} from "@/lib/gestao/metricas";

export function useGestao() {
  const search = useSearch({ from: "/gestao" });
  const periodo = resolvePeriodo(search);

  const [
    { data: pessoas },
    { data: programas },
    { data: ilhas },
    { data: conteudos },
    { data: escalasAll },
    { data: ferias },
    { data: licencas },
    { data: ocorrencias },
  ] = useSuspenseQueries({
    queries: [
      pessoasQuery(),
      programasQuery(),
      ilhasQuery(),
      conteudosQuery(),
      escalasQuery(periodo.from, periodo.to),
      feriasQuery(periodo.from, periodo.to),
      licencasQuery(periodo.from, periodo.to),
      ocorrenciasQuery(),
    ],
  });

  const escalas = filtrarEscalas(escalasAll, search);
  const pessoasFiltradas = filtrarPessoas(pessoas, search);

  return {
    search,
    periodo,
    pessoas,
    pessoasFiltradas,
    programas,
    ilhas,
    conteudos,
    escalas,
    escalasAll,
    ferias,
    licencas,
    ocorrencias,
  };
}
