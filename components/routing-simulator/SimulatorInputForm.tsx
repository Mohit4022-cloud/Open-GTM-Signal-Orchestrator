import { Route } from "lucide-react";

import { Card } from "@/components/shared/Card";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { formatEnumLabel } from "@/lib/formatters/display";

export type SimulatorFormState = {
  accountDomain: string;
  leadSource: string;
  leadSourceType: string;
  segment: string;
  geography: string;
  accountTier: string;
  namedAccount: boolean;
  temperature: string;
  triggerSignalType: string;
  capacityScenario: string;
};

type SimulatorInputFormProps = {
  formState: SimulatorFormState;
  onChange: (field: keyof SimulatorFormState, value: string | boolean) => void;
  onSubmit: () => void;
  isLoading: boolean;
};

const INPUT_CLASS =
  "h-11 w-full rounded-2xl border border-border bg-panel-muted px-3 text-sm text-foreground outline-none transition-colors focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const LABEL_CLASS =
  "block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";

const SEGMENT_OPTIONS = ["SMB", "MID_MARKET", "ENTERPRISE", "STRATEGIC"];
const GEOGRAPHY_OPTIONS = ["NA_EAST", "NA_WEST", "EMEA", "APAC"];
const ACCOUNT_TIER_OPTIONS = ["TIER_3", "TIER_2", "TIER_1", "STRATEGIC"];
const TEMPERATURE_OPTIONS = ["COLD", "WARM", "HOT", "URGENT"];
const LEAD_SOURCE_TYPE_OPTIONS = ["inbound", "outbound", "signal", "unknown"];
const SIGNAL_TYPE_OPTIONS = [
  "WEBSITE_VISIT",
  "PRICING_PAGE_VISIT",
  "HIGH_INTENT_PAGE_CLUSTER_VISIT",
  "FORM_FILL",
  "WEBINAR_REGISTRATION",
  "PRODUCT_SIGNUP",
  "PRODUCT_USAGE_MILESTONE",
  "EMAIL_REPLY",
  "MEETING_BOOKED",
  "MEETING_NO_SHOW",
  "THIRD_PARTY_INTENT_EVENT",
  "MANUAL_SALES_NOTE",
  "ACCOUNT_STATUS_UPDATE",
];
const CAPACITY_SCENARIO_OPTIONS = [
  "current",
  "named_owner_overloaded",
  "existing_owner_overloaded",
  "territory_pool_overloaded",
  "all_candidates_overloaded",
];

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className={LABEL_CLASS}>{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
        aria-label={label}
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {formatEnumLabel(opt)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className={LABEL_CLASS}>{label}</span>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
        aria-label={label}
      />
    </label>
  );
}

export function SimulatorInputForm({
  formState,
  onChange,
  onSubmit,
  isLoading,
}: SimulatorInputFormProps) {
  return (
    <Card className="p-6">
      <SectionHeader
        label="Simulation inputs"
        title="Configure routing context"
        icon={Route}
        iconVariant="accent"
      />

      <form
        role="form"
        aria-label="Routing simulation inputs"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="mt-5 space-y-4"
      >
        {/* Row 1: text inputs */}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="accountDomain"
            label="Account domain"
            value={formState.accountDomain}
            placeholder="acme.com"
            onChange={(v) => onChange("accountDomain", v)}
          />
          <TextField
            id="leadSource"
            label="Lead source"
            value={formState.leadSource}
            placeholder="LinkedIn"
            onChange={(v) => onChange("leadSource", v)}
          />
        </div>

        {/* Row 2: lead source type + segment */}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="leadSourceType"
            label="Lead source type"
            value={formState.leadSourceType}
            options={LEAD_SOURCE_TYPE_OPTIONS}
            onChange={(v) => onChange("leadSourceType", v)}
          />
          <SelectField
            id="segment"
            label="Segment"
            value={formState.segment}
            options={SEGMENT_OPTIONS}
            onChange={(v) => onChange("segment", v)}
          />
        </div>

        {/* Row 3: geography + tier + temperature */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SelectField
            id="geography"
            label="Geography"
            value={formState.geography}
            options={GEOGRAPHY_OPTIONS}
            onChange={(v) => onChange("geography", v)}
          />
          <SelectField
            id="accountTier"
            label="Account tier"
            value={formState.accountTier}
            options={ACCOUNT_TIER_OPTIONS}
            onChange={(v) => onChange("accountTier", v)}
          />
          <SelectField
            id="temperature"
            label="Temperature"
            value={formState.temperature}
            options={TEMPERATURE_OPTIONS}
            onChange={(v) => onChange("temperature", v)}
          />
        </div>

        {/* Row 4: signal type + capacity scenario */}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="triggerSignalType"
            label="Trigger signal type"
            value={formState.triggerSignalType}
            options={SIGNAL_TYPE_OPTIONS}
            onChange={(v) => onChange("triggerSignalType", v)}
          />
          <SelectField
            id="capacityScenario"
            label="Capacity scenario"
            value={formState.capacityScenario}
            options={CAPACITY_SCENARIO_OPTIONS}
            onChange={(v) => onChange("capacityScenario", v)}
          />
        </div>

        {/* Row 5: named account toggle */}
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border bg-panel-muted/70 px-4 py-3">
          <div>
            <p className={LABEL_CLASS}>Named account</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Flag this account as named/strategic
            </p>
          </div>
          <div className="relative shrink-0">
            <input
              id="namedAccount"
              type="checkbox"
              checked={formState.namedAccount}
              onChange={(e) => onChange("namedAccount", e.target.checked)}
              className="peer sr-only"
              aria-label="Named account"
            />
            <div className="h-6 w-11 rounded-full border border-border bg-panel-muted transition-colors peer-checked:border-accent/50 peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent" />
            <div className="absolute left-0.5 top-0.5 size-5 rounded-full bg-panel shadow-sm transition-transform peer-checked:translate-x-5" />
          </div>
        </label>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
          aria-label={isLoading ? "Simulating…" : "Run simulation"}
          className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-foreground text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {isLoading ? (
            <>
              <span
                className="size-4 animate-spin rounded-full border-2 border-background/30 border-t-background"
                aria-hidden="true"
              />
              Simulating…
            </>
          ) : (
            <>
              <Route className="size-4" aria-hidden="true" />
              Simulate routing
            </>
          )}
        </button>
      </form>
    </Card>
  );
}
