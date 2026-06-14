import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Calendar,
  Filter,
  Layers,
  LayoutGrid,
  RotateCcw,
  Tv,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  conteudosQuery,
  ilhasQuery,
  pessoasQuery,
  programasQuery,
} from "@/lib/queries";
import { resolvePeriodo, type GestaoSearch, type PeriodoPreset } from "@/lib/gestao/filtros";
import { cn } from "@/lib/utils";

const ALL = "__all__";

const TABS = [
  { to: "/gestao", label: "Visão Geral", exact: true },
  { to: "/gestao/pessoas", label: "Pessoas", exact: false },
  { to: "/gestao/operacao", label: "Operação", exact: false },
  { to: "/gestao/conteudos", label: "Conteúdos", exact: false },
  { to: "/gestao/planejamento", label: "Planejamento", exact: false },
] as const;

const PERIODO_LABEL: Record<PeriodoPreset, string> = {
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  custom: "Personalizado",
};

export function GestaoHeader({ search }: { search: GestaoSearch }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: conteudos } = useSuspenseQuery(conteudosQuery());
  const { data: programas } = useSuspenseQuery(programasQuery());
  const { data: ilhas } = useSuspenseQuery(ilhasQuery());
  const { data: pessoas } = useSuspenseQuery(pessoasQuery());
  const { label: periodoLabel, from, to } = resolvePeriodo(search);

  const update = (patch: Partial<GestaoSearch>) =>
    navigate({ to: ".", search: (prev: GestaoSearch) => ({ ...prev, ...patch }) as never });

  const isActive = (to: string, exact: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  return (
    <header className="sticky top-0 z-20 border-b bg-card/85 backdrop-blur">
      <div className="flex flex-col gap-3 px-5 py-3 sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight">Gestão</h1>
            <p className="text-xs text-muted-foreground">
              {periodoLabel} · {from} → {to}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate({
                to: ".",
                search: { periodo: "mes" } as never,
              })
            }
          >
            <RotateCcw className="h-3.5 w-3.5" /> Limpar
          </Button>
        </div>

        <nav className="-mx-1 flex gap-1 overflow-x-auto scroll-thin">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              search={(prev: GestaoSearch) => prev as never}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                isActive(t.to, t.exact)
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filtros
          </div>

          <FilterSelect
            icon={<Calendar className="h-3.5 w-3.5" />}
            value={search.periodo}
            onChange={(v) => update({ periodo: v as PeriodoPreset })}
            placeholder="Período"
            options={(Object.keys(PERIODO_LABEL) as PeriodoPreset[])
              .filter((p) => p !== "custom")
              .map((p) => ({ value: p, label: PERIODO_LABEL[p] }))}
          />

          <FilterSelect
            icon={<Layers className="h-3.5 w-3.5" />}
            value={search.conteudo_id ?? ALL}
            onChange={(v) => update({ conteudo_id: v === ALL ? undefined : v })}
            placeholder="Conteúdo"
            options={[
              { value: ALL, label: "Todos os conteúdos" },
              ...conteudos.map((c) => ({ value: c.id, label: c.nome })),
            ]}
          />

          <FilterSelect
            icon={<Tv className="h-3.5 w-3.5" />}
            value={search.programa_id ?? ALL}
            onChange={(v) => update({ programa_id: v === ALL ? undefined : v })}
            placeholder="Programa"
            options={[
              { value: ALL, label: "Todos os programas" },
              ...programas.map((p) => ({ value: p.id, label: p.nome })),
            ]}
          />

          <FilterSelect
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            value={search.ilha_id ?? ALL}
            onChange={(v) => update({ ilha_id: v === ALL ? undefined : v })}
            placeholder="Ilha"
            options={[
              { value: ALL, label: "Todas as ilhas" },
              ...ilhas.map((i) => ({ value: i.id, label: i.nome })),
            ]}
          />

          <FilterSelect
            icon={<User className="h-3.5 w-3.5" />}
            value={search.pessoa_id ?? ALL}
            onChange={(v) => update({ pessoa_id: v === ALL ? undefined : v })}
            placeholder="Colaborador"
            options={[
              { value: ALL, label: "Todos os colaboradores" },
              ...pessoas.map((p) => ({ value: p.id, label: p.nome })),
            ]}
          />
        </div>
      </div>
    </header>
  );
}

function FilterSelect({
  icon,
  value,
  onChange,
  placeholder,
  options,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[10rem] gap-1.5 text-xs">
        {icon}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
