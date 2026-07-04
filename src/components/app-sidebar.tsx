import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Briefcase,
  CalendarCheck,
  CalendarHeart,
  CalendarRange,
  CalendarSearch,
  LayoutGrid,
  Layers,
  TrendingUp,
  Tv,
  Users,
  Users2,
} from "lucide-react";


import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const operacional = [
  { title: "Escala Operacional", url: "/", icon: CalendarRange, exact: true },
  { title: "Planejamento Macro", url: "/planejamento", icon: CalendarCheck },
  { title: "Plano de Férias", url: "/ferias", icon: CalendarHeart },
  { title: "Pessoas", url: "/pessoas", icon: Users },

  { title: "Funções", url: "/funcoes", icon: Briefcase },
  { title: "Conteúdos", url: "/conteudos", icon: Layers },
  { title: "Programas", url: "/programas", icon: Tv },
  { title: "Ilhas", url: "/ilhas", icon: LayoutGrid },
];

const performance = [
  { title: "Performance", url: "/performance", icon: TrendingUp },
];

const gestao = [
  { title: "Visão Geral", url: "/gestao", icon: BarChart3, exact: true },
  { title: "Pessoas", url: "/gestao/pessoas", icon: Users2 },
  { title: "Operação", url: "/gestao/operacao", icon: CalendarRange },
  { title: "Conteúdos", url: "/gestao/conteudos", icon: Layers },
  { title: "Planejamento", url: "/gestao/planejamento", icon: CalendarSearch },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string, exact?: boolean) =>
    exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-1.5 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <CalendarRange className="h-4.5 w-4.5" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="font-display text-sm font-bold leading-tight text-sidebar-foreground">
              Escalas
            </p>
            <p className="truncate text-[11px] leading-tight text-sidebar-foreground/55">
              Gestão de Equipes
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operacional</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operacional.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url, item.exact)}
                    tooltip={item.title}
                  >
                    <Link to={item.url} className="flex items-center gap-2.5">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Gestão</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {gestao.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url, item.exact)}
                    tooltip={item.title}
                  >
                    <Link to={item.url} className="flex items-center gap-2.5">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
