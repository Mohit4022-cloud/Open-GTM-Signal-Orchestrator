import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Mail,
  Phone,
  Radar,
  ScrollText,
  Sparkles,
  TrendingUp,
  UserX,
  UsersRound,
} from "lucide-react";
import { notFound } from "next/navigation";

import { AccountHeader } from "@/components/accounts/AccountHeader";
import { SectionCard } from "@/components/accounts/SectionCard";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { cn } from "@/lib/utils";
import { getAccountDetail } from "@/lib/queries/accounts";
import type {
  AuditLogItem,
  ContactCard,
  ScoreBreakdownItem,
  TaskListItem,
  TimelineEvent,
} from "@/lib/types";

type AccountDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AccountDetailPage({ params }: AccountDetailPageProps) {
  const { id } = await params;
  const account = await getAccountDetail(id);

  if (!account) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div>
        <Link
          href="/accounts"
          aria-label="Back to accounts list"
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border bg-panel px-3 text-sm font-medium text-muted-foreground hover:bg-panel-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to accounts
        </Link>
      </div>

      {/* Account header — all 8 required fields */}
      <AccountHeader
        name={account.name}
        domain={account.domain}
        industry={account.industry}
        geography={account.geography}
        lifecycleStage={account.lifecycleStage}
        segment={account.segment}
        status={account.status}
        score={account.score}
        fitScore={account.fitScore}
        owner={account.owner}
        ownerRole={account.ownerRole}
        tier={account.tier}
      />

      {/* AI-ready summary */}
      <SectionCard
        icon={Sparkles}
        eyebrow="AI-ready summary"
        title="Deterministic briefing"
        iconTone="accent"
      >
        <p className="text-sm leading-7 text-foreground">{account.summary}</p>
      </SectionCard>

      {/* Two-column grid */}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        {/* Left column */}
        <div className="space-y-6">
          {/* Signal timeline */}
          <SectionCard
            icon={Radar}
            eyebrow="Signal timeline"
            title="Recent account activity"
            count={account.timeline.length}
          >
            {account.timeline.length === 0 ? (
              <EmptyState
                icon={Activity}
                heading="No signals recorded"
                description="No activity has been captured for this account yet."
              />
            ) : (
              <VerticalTimeline events={account.timeline} />
            )}
          </SectionCard>

          {/* Contacts */}
          <SectionCard
            icon={UsersRound}
            eyebrow="Contacts"
            title="Active buying committee"
            count={account.contacts.length}
          >
            {account.contacts.length === 0 ? (
              <EmptyState
                icon={UserX}
                heading="No contacts on file"
                description="The buying committee for this account has not been populated."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {account.contacts.map((contact) => (
                  <ContactCardItem key={contact.id} contact={contact} />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Related leads — data gap state */}
          <SectionCard
            icon={TrendingUp}
            eyebrow="Related leads"
            title="Inbound lead activity"
            count={0}
          >
            <LeadsGapState />
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Open tasks */}
          <SectionCard
            icon={BriefcaseBusiness}
            eyebrow="Open tasks"
            title="Operator follow-up"
            count={account.openTasks.length}
          >
            {account.openTasks.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                heading="All caught up"
                description="There are no open tasks assigned to this account."
              />
            ) : (
              <div className="space-y-3">
                {account.openTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Score breakdown */}
          <SectionCard
            icon={BarChart3}
            eyebrow="Score breakdown"
            title="Why the score moved"
          >
            {account.scoreBreakdown.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                heading="No score history"
                description="Score component changes will appear here as activity is recorded."
              />
            ) : (
              <div className="space-y-3">
                {account.scoreBreakdown.map((item) => (
                  <ScoreRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Audit log */}
          <SectionCard
            icon={ScrollText}
            eyebrow="Audit log"
            title="Recent system decisions"
            count={account.auditLog.length}
          >
            {account.auditLog.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                heading="No audit entries"
                description="System decisions and policy traces will appear here once activity begins."
              />
            ) : (
              <div className="space-y-3">
                {account.auditLog.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function VerticalTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="relative">
      {events.map((event, index) => (
        <div key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
          {/* Left column: dot + line */}
          <div className="relative flex flex-col items-center">
            <div
              className={cn(
                "relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full border-2",
                event.status === "Unmatched"
                  ? "border-warning bg-warning/20"
                  : "border-accent bg-accent/20",
              )}
            />
            {index < events.length - 1 && (
              <div className="mt-1 w-px flex-1 bg-border" />
            )}
          </div>

          {/* Right column: content card */}
          <div className="min-w-0 flex-1 rounded-2xl border border-border bg-panel-muted/70 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold text-foreground">{event.title}</p>
              <Badge tone={event.status === "Unmatched" ? "warning" : "accent"}>
                {event.status}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-border bg-panel px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {event.sourceSystem}
              </span>
              <span className="text-xs text-muted-foreground">{event.occurredAt}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground">{event.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactCardItem({ contact }: { contact: ContactCard }) {
  return (
    <div className="rounded-2xl border border-border bg-panel-muted/70 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{contact.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{contact.title}</p>
        </div>
        <Badge tone="neutral">{contact.department}</Badge>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <a
          href={`mailto:${contact.email}`}
          aria-label={`Email ${contact.name}`}
          className="inline-flex items-center gap-2 text-foreground hover:text-accent"
        >
          <Mail className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="break-all">{contact.email}</span>
        </a>
        {contact.phone && (
          <p className="inline-flex items-center gap-2 text-muted-foreground">
            <Phone className="size-4 shrink-0" aria-hidden="true" />
            {contact.phone}
          </p>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: TaskListItem }) {
  const priorityTone =
    task.priority === "Urgent"
      ? "danger"
      : task.priority === "High"
        ? "warning"
        : "neutral";

  return (
    <div className="rounded-2xl border border-border bg-panel-muted/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-foreground">{task.title}</p>
        <Badge tone={priorityTone}>{task.priority}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{task.description}</p>
      <p className="mt-3 text-sm text-foreground">
        {task.owner} · due {task.dueAt}
      </p>
    </div>
  );
}

function ScoreRow({ item }: { item: ScoreBreakdownItem }) {
  return (
    <div className="rounded-2xl border border-border bg-panel-muted/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-foreground">{item.label}</p>
        <span className="font-mono text-lg font-semibold text-foreground">
          +{item.value}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.reasonCode}</p>
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditLogItem }) {
  return (
    <div className="rounded-2xl border border-border bg-panel-muted/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-foreground">{entry.title}</p>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {entry.createdAt}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground">{entry.explanation}</p>
      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Actor · {entry.actorName}
      </p>
    </div>
  );
}

function LeadsGapState() {
  return (
    <div className="rounded-2xl border border-dashed border-border py-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="rounded-2xl border border-border bg-panel-muted p-3 text-muted-foreground">
          <TrendingUp className="size-5" aria-hidden="true" />
        </span>
        <div className="max-w-xs px-4">
          <p className="text-sm font-semibold text-foreground">
            Leads not surfaced in view model
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            <code className="rounded bg-panel-muted px-1 py-0.5 font-mono text-xs">
              relatedLeads
            </code>{" "}
            exists in{" "}
            <code className="rounded bg-panel-muted px-1 py-0.5 font-mono text-xs">
              AccountDetailContract
            </code>{" "}
            but is not forwarded by{" "}
            <code className="rounded bg-panel-muted px-1 py-0.5 font-mono text-xs">
              getAccountDetail()
            </code>
            . No backend change has been made.
          </p>
        </div>
      </div>
    </div>
  );
}

type EmptyStateProps = {
  icon: React.ComponentType<{ className?: string }>;
  heading: string;
  description: string;
};

function EmptyState({ icon: Icon, heading, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="rounded-2xl border border-border bg-panel-muted p-3 text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{heading}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
