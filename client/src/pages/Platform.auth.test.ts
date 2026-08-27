import { renderToStaticMarkup } from "react-dom/server";
import React, { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let states: Record<string, any>;

vi.mock("@/lib/trpc", () => ({
  trpc: {
    platform: {
      metrics: { useQuery: () => states.metrics },
      overview: { useQuery: () => states.tenants },
      usage: { useQuery: () => states.usage },
      plans: { list: { useQuery: () => states.plans } },
      report: { useQuery: () => states.report },
      tenantAudit: { useQuery: () => states.audit },
      users: { list: { useQuery: () => states.users } },
    },
  },
}));

vi.mock("@/components/SafeLink", () => ({
  SafeLink: ({ children }: { children: any }) => children,
}));

import { getPlatformAccessState, PlatformDashboard, platformReadOnlySections } from "./Platform";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const ready = (data: unknown) => ({ data, isLoading: false, isError: false });
const failed = { data: undefined, isLoading: false, isError: true };

function renderPlatform(section: Parameters<typeof PlatformDashboard>[0]["initialSection"]) {
  return renderToStaticMarkup(createElement(PlatformDashboard, { initialSection: section }));
}

beforeEach(() => {
  states = {
    metrics: ready({ tenants: 0, activeTenants: 0, users: 0, activeMemberships: 0 }),
    tenants: ready([]),
    usage: ready([]),
    plans: ready([]),
    report: ready({ totals: {}, items: [] }),
    audit: ready({ items: [], page: 1, hasMore: false }),
    users: ready({ items: [], page: 1, hasMore: false }),
  };
});

describe("getPlatformAccessState", () => {
  it("mantém o painel em carregamento enquanto a identidade é resolvida", () => {
    expect(getPlatformAccessState(null, true)).toBe("loading");
  });

  it("não apresenta o painel global para identidade ausente ou sem papel global", () => {
    expect(getPlatformAccessState(null, false)).toBe("unauthenticated");
    expect(getPlatformAccessState({ platformRole: "platform_user" }, false)).toBe("forbidden");
  });

  it("permite somente o papel super_admin na interface global", () => {
    expect(getPlatformAccessState({ platformRole: "super_admin" }, false)).toBe("granted");
  });

  it("mantém todas as seções globais previstas em modo somente leitura", () => {
    expect(platformReadOnlySections.map(section => section.id)).toEqual(["overview", "tenants", "users", "plans", "usage", "reports", "audit", "security", "support"]);
    const markup = renderPlatform("overview");
    ["Visão geral", "Oficinas", "Usuários", "Planos", "Uso", "Indicadores", "Auditoria", "Segurança", "Suporte"].forEach(label => expect(markup).toContain(label));
    expect(markup).not.toContain("Criar oficina");
    expect(markup).not.toContain("Associar a outra oficina");
  });

  it("renderiza loading e estados vazios sem confundir ausência de dado com erro", () => {
    states.metrics = { data: undefined, isLoading: true, isError: false };
    expect(renderPlatform("overview")).toContain("animate-pulse");
    expect(renderPlatform("tenants")).toContain("Nenhuma oficina cadastrada");
    expect(renderPlatform("plans")).toContain("Nenhum plano cadastrado");
    expect(renderPlatform("usage")).toContain("Sem consumo para exibir");
  });

  it("renderiza indisponibilidade explícita para métricas, oficinas, planos e uso", () => {
    states.metrics = failed;
    expect(renderPlatform("overview")).toContain("Indicadores indisponíveis");
    states.tenants = failed;
    expect(renderPlatform("tenants")).toContain("Diretório indisponível");
    states.plans = failed;
    expect(renderPlatform("plans")).toContain("Catálogo indisponível");
    states.usage = failed;
    expect(renderPlatform("usage")).toContain("Uso indisponível");
  });
});
