"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Card } from "@/components/shared/Card";
import type {
  RoutingSimulationInputContract,
  RoutingSimulationResultContract,
  PublicRoutingApiErrorResponseContract,
} from "@/lib/contracts/routing";

import { EmptyStateCard } from "./EmptyStateCard";
import { SimulationResultCard } from "./SimulationResultCard";
import { SimulatorInputForm, type SimulatorFormState } from "./SimulatorInputForm";

type UiState = "idle" | "loading" | "error" | "result";

const INITIAL_FORM: SimulatorFormState = {
  accountDomain: "",
  leadSource: "",
  leadSourceType: "",
  segment: "",
  geography: "",
  accountTier: "",
  namedAccount: false,
  temperature: "",
  triggerSignalType: "",
  capacityScenario: "",
};

function buildInput(state: SimulatorFormState): RoutingSimulationInputContract {
  return {
    accountDomain: state.accountDomain.trim() || null,
    leadSource: state.leadSource.trim() || null,
    leadSourceType:
      (state.leadSourceType as RoutingSimulationInputContract["leadSourceType"]) ||
      undefined,
    segment: state.segment || null,
    geography: state.geography || null,
    accountTier: state.accountTier || null,
    namedAccount: state.namedAccount || undefined,
    temperature: state.temperature || null,
    triggerSignalType: state.triggerSignalType || null,
    capacityScenario:
      (state.capacityScenario as RoutingSimulationInputContract["capacityScenario"]) ||
      undefined,
  };
}

function LoadingSkeleton() {
  return (
    <Card
      className="p-6"
      role="status"
      aria-label="Loading simulation result"
    >
      <div className="animate-pulse space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-2xl bg-panel-muted/80" />
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-panel-muted/80" />
            <div className="h-5 w-40 rounded bg-panel-muted/80" />
          </div>
        </div>
        <div className="h-px bg-panel-muted/80" />
        <div className="space-y-2">
          <div className="h-14 rounded-2xl bg-panel-muted/80" />
          <div className="h-10 rounded-xl bg-panel-muted/80" />
          <div className="h-10 rounded-xl bg-panel-muted/80" />
        </div>
        <div className="h-px bg-panel-muted/80" />
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-panel-muted/80" />
          <div className="h-4 w-2/3 rounded bg-panel-muted/80" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-1/3 rounded bg-panel-muted/80" />
          <div className="h-5 w-1/2 rounded bg-panel-muted/80" />
          <div className="h-14 rounded-2xl bg-panel-muted/80" />
          <div className="h-14 rounded-2xl bg-panel-muted/80" />
          <div className="h-14 rounded-2xl bg-panel-muted/80" />
        </div>
      </div>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card
      className="p-6 border-danger/25 bg-danger/5"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="size-5 shrink-0 text-danger" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">Simulation failed</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </Card>
  );
}

export function RoutingSimulatorClientView() {
  const [formState, setFormState] = useState<SimulatorFormState>(INITIAL_FORM);
  const [uiState, setUiState] = useState<UiState>("idle");
  const [result, setResult] = useState<RoutingSimulationResultContract | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleChange(
    field: keyof SimulatorFormState,
    value: string | boolean,
  ) {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setUiState("loading");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/routing/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildInput(formState)),
      });
      if (!res.ok) {
        const err: PublicRoutingApiErrorResponseContract = await res.json();
        setErrorMessage(
          err.message + (err.error ? ` — ${err.error}` : ""),
        );
        setUiState("error");
        return;
      }
      const data: RoutingSimulationResultContract = await res.json();
      setResult(data);
      setUiState("result");
    } catch {
      setErrorMessage(
        "Network error — could not reach the simulation endpoint.",
      );
      setUiState("error");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      {/* Left: input form */}
      <SimulatorInputForm
        formState={formState}
        onChange={handleChange}
        onSubmit={handleSubmit}
        isLoading={uiState === "loading"}
      />

      {/* Right: result area */}
      <div aria-live="polite">
        {uiState === "idle" && <EmptyStateCard />}
        {uiState === "loading" && <LoadingSkeleton />}
        {uiState === "error" && (
          <ErrorCard message={errorMessage ?? "An unexpected error occurred."} />
        )}
        {uiState === "result" && result && (
          <SimulationResultCard result={result} />
        )}
      </div>
    </div>
  );
}
