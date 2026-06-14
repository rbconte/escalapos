import { createFileRoute, Outlet } from "@tanstack/react-router";
import { GestaoHeader } from "@/components/gestao/filtros-bar";
import { gestaoSearchValidator } from "@/lib/gestao/filtros";
import {
  conteudosQuery,
  ilhasQuery,
  pessoasQuery,
  programasQuery,
} from "@/lib/queries";

export const Route = createFileRoute("/gestao")({
  validateSearch: gestaoSearchValidator,
  head: () => ({
    meta: [
      { title: "Gestão — Escala Operacional" },
      { name: "description", content: "Dashboards executivos e operacionais da equipe." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(conteudosQuery());
    context.queryClient.ensureQueryData(programasQuery());
    context.queryClient.ensureQueryData(ilhasQuery());
    context.queryClient.ensureQueryData(pessoasQuery());
  },
  component: GestaoLayout,
});

function GestaoLayout() {
  const search = Route.useSearch();
  return (
    <div className="flex h-[100dvh] flex-col">
      <GestaoHeader search={search} />
      <div className="min-h-0 flex-1 overflow-auto scroll-thin px-5 py-5 sm:px-7">
        <Outlet />
      </div>
    </div>
  );
}
