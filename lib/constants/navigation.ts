import {
  Building2,
  Gauge,
  Radar,
  Route,
  Settings,
  ShieldAlert,
  SquareKanban,
  Users2,
} from "lucide-react";

import type { NavItem, RouteMeta } from "@/lib/types";

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Daily GTM operator view",
    implemented: true,
    icon: Gauge,
  },
  {
    href: "/accounts",
    label: "Accounts",
    description: "Account intelligence and detail",
    implemented: true,
    icon: Building2,
  },
  {
    href: "/unmatched",
    label: "Unmatched Queue",
    description: "Signals that failed identity resolution",
    implemented: true,
    icon: ShieldAlert,
  },
  {
    href: "/leads",
    label: "Leads",
    description: "Queue orchestration",
    implemented: false,
    icon: Users2,
  },
  {
    href: "/tasks",
    label: "Tasks",
    description: "Operator action queue",
    implemented: false,
    icon: SquareKanban,
  },
  {
    href: "/signals",
    label: "Signals",
    description: "Signal ingestion overview",
    implemented: false,
    icon: Radar,
  },
  {
    href: "/routing-simulator",
    label: "Routing Simulator",
    description: "Policy simulation workspace",
    implemented: true,
    icon: Route,
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Rules and workspace defaults",
    implemented: false,
    icon: Settings,
  },
];

const EXPLICIT_META: Record<string, RouteMeta> = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "Monitor routed demand, SLA health, and the accounts most likely to convert.",
  },
  "/accounts": {
    title: "Accounts",
    subtitle: "Inspect account fit, ownership, and signal recency across the active portfolio.",
  },
  "/unmatched": {
    title: "Unmatched Queue",
    subtitle: "Review signals that could not be matched to a known account or contact.",
  },
  "/leads": {
    title: "Leads",
    subtitle: "Queue management for working, urgent, and newly-routed leads.",
  },
  "/tasks": {
    title: "Tasks",
    subtitle: "Operator action queue for follow-up, enrichment, and escalation work.",
  },
  "/signals": {
    title: "Signals",
    subtitle: "Unified intake view for web, product, marketing, and rep-generated signals.",
  },
  "/routing-simulator": {
    title: "Routing Simulator",
    subtitle: "Test policy outcomes before changes reach the working queue.",
  },
  "/settings": {
    title: "Settings",
    subtitle: "Read-only workspace controls for routing and scoring defaults.",
  },
};

export function getRouteMeta(pathname: string): RouteMeta {
  if (pathname.startsWith("/accounts/")) {
    return {
      title: "Account Detail",
      subtitle: "Review timeline context, score rationale, contacts, and open follow-up work.",
    };
  }

  return (
    EXPLICIT_META[pathname] ?? {
      title: "GTM Signal Orchestrator",
      subtitle: "Production-style GTM operations workspace.",
    }
  );
}
