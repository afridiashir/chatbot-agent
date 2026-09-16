"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleCheck,
  Clock,
  Inbox,
  MessageCircle,
  MessageSquareText,
  MessagesSquare,
  Minus,
  Timer,
  TrendingUp,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type {
  AdminAnalytics,
  AdminStats,
  BranchWithAgents,
  ClientToServerEvents,
  ServerToClientEvents,
} from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { AreaTrend } from "@/components/charts/AreaTrend";
import { BarList } from "@/components/charts/BarList";
import { ChartCard } from "@/components/charts/ChartCard";
import { Columns } from "@/components/charts/Columns";
import { Sparkline } from "@/components/charts/Sparkline";
import { Legend, formatNumber } from "@/components/charts/shared";
import { StatusDot } from "@/components/ui/status-dot";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { cn } from "@/lib/utils";

const RANGES = [1, 7, 14, 30, 90] as const;
type Range = (typeof RANGES)[number];

const rangeLabel = (range: Range) => (range === 1 ? "Today" : `${range}d`);

const SERIES = {
  answered: { key: "answered", name: "Answered", color: "var(--chart-1)" },
  missed: { key: "missed", name: "Missed", color: "var(--chart-2)" },
};

export default function AdminOverviewPage() {
  return (
    <AdminShell>
      {({ token, admin }) => <Overview token={token} branchName={admin.branchName} />}
    </AdminShell>
  );
}

/* --------------------------------- helpers --------------------------------- */

/** `YYYY-MM-DD` is a calendar date, so format it in UTC to avoid shifting a day. */
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const shortDay = (day: string) =>
  asDate(day).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const longDay = (day: string) =>
  asDate(day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

const rate = (answered: number, missed: number) =>
  answered + missed === 0 ? null : answered / (answered + missed);

/* --------------------------------- overview -------------------------------- */

function Overview({ token, branchName }: { token: string; branchName: string | null }) {
  const [range, setRange] = useState<Range>(7);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [branches, setBranches] = useState<BranchWithAgents[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  const refreshLive = useCallback(async () => {
    const [nextStats, nextBranches] = await Promise.all([
      api<AdminStats>("/api/admin/stats", { token }),
      api<BranchWithAgents[]>("/api/admin/branches", { token }),
    ]);
    setStats(nextStats);
    setBranches(nextBranches);
  }, [token]);

  const refreshAnalytics = useCallback(async () => {
    const params = new URLSearchParams({ days: String(range), tz: timeZone });
    setAnalytics(await api<AdminAnalytics>(`/api/admin/analytics?${params}`, { token }));
  }, [range, timeZone, token]);

  // Changing the range keeps the previous charts on screen, faded, until the
  // new numbers arrive, so nothing jumps.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([refreshAnalytics(), refreshLive()])
      .then(() => !cancelled && setError(null))
      .catch(() => !cancelled && setError("Could not load the overview"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshAnalytics, refreshLive]);

  // Availability changes anywhere in the company refresh the live figures.
  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL, {
      auth: { role: "ADMIN", token },
      transports: ["websocket", "polling"],
    });
    socket.on("agent:status", () => void refreshLive().catch(() => undefined));
    return () => {
      socket.close();
    };
  }, [token, refreshLive]);

  const rangeName = range === 1 ? "today" : `the last ${range} days`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Overview{branchName && <span className="text-muted-foreground"> · {branchName}</span>}
          </h1>
          <p className="text-sm text-muted-foreground">
            Activity for {rangeName}, in {timeZone.replaceAll("_", " ")} time.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Date range"
          className="flex w-fit rounded-lg border bg-card p-1 text-xs font-medium shadow-sm"
        >
          {RANGES.map((option) => (
            <button
              key={option}
              role="radio"
              aria-checked={range === option}
              onClick={() => setRange(option)}
              className={cn(
                "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                range === option &&
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
            >
              {rangeLabel(option)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!analytics || !stats ? (
        !error && <p className="text-sm text-muted-foreground">Loading overview…</p>
      ) : (
        <div
          className={cn("flex flex-col gap-6 transition-opacity", loading && "opacity-60")}
          aria-busy={loading}
        >
          <Kpis analytics={analytics} stats={stats} rangeDays={range} />
          <Charts analytics={analytics} rangeName={rangeName} today={range === 1} />
          <Team branches={branches} />
        </div>
      )}
    </div>
  );
}

/* ----------------------------------- KPIs ---------------------------------- */

function Kpis({
  analytics,
  stats,
  rangeDays,
}: {
  analytics: AdminAnalytics;
  stats: AdminStats;
  rangeDays: number;
}) {
  const { totals, previous, daily, hourly } = analytics;
  // A single day has only one daily point, so its conversation trend is drawn
  // by hour. Messages are not bucketed by hour, so that tile drops its line.
  const today = rangeDays === 1;
  const currentRate = rate(totals.answered, totals.missed);
  const previousRate = rate(previous.answered, previous.missed);
  const vs = today ? "vs yesterday" : `vs prior ${rangeDays} days`;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <StatTile
        label="Conversations"
        icon={MessagesSquare}
        value={formatNumber(totals.conversations)}
        delta={<Delta current={totals.conversations} previous={previous.conversations} note={vs} />}
        trend={today ? hourly.map((h) => h.conversations) : daily.map((d) => d.conversations)}
      />
      <StatTile
        label="Messages"
        icon={MessageSquareText}
        value={formatNumber(totals.messages)}
        hint={
          totals.conversations
            ? `${(totals.messages / totals.conversations).toFixed(1)} per conversation`
            : totals.messages
              ? "In conversations started earlier"
              : "No messages yet"
        }
        trend={today ? undefined : daily.map((d) => d.messages)}
      />
      <StatTile
        label="Answer rate"
        icon={CircleCheck}
        value={currentRate === null ? "—" : `${Math.round(currentRate * 100)}%`}
        hint={
          currentRate === null
            ? "No enquiries in range"
            : `${totals.answered} of ${totals.answered + totals.missed} enquiries`
        }
        delta={
          currentRate !== null && previousRate !== null ? (
            <Delta
              current={Math.round(currentRate * 100)}
              previous={Math.round(previousRate * 100)}
              unit="pts"
              note={vs}
            />
          ) : undefined
        }
      />
      <StatTile
        label="Median first reply"
        icon={Timer}
        value={formatDuration(totals.medianFirstResponseSeconds)}
        hint="Until an agent replies"
      />
      <StatTile
        label="Agents online"
        icon={Users}
        value={`${stats.agents.online}`}
        hint={`of ${stats.agents.active} active agents`}
        live
      />
      <StatTile
        label="Open chats"
        icon={MessageCircle}
        value={formatNumber(stats.conversations.active)}
        hint={`${formatNumber(stats.conversations.closed)} closed all time`}
        live
      />
    </div>
  );
}

function StatTile({
  label,
  icon: Icon,
  value,
  hint,
  delta,
  trend,
  live,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  hint?: string;
  delta?: React.ReactNode;
  trend?: number[];
  live?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      {live && (
        <span className="flex w-fit items-center gap-1 text-[10px] font-medium text-muted-foreground">
          <StatusDot online className="h-1.5 w-1.5" />
          Live
        </span>
      )}
      {delta ?? (hint && <p className="text-xs text-muted-foreground">{hint}</p>)}
      {trend && <Sparkline values={trend} />}
    </div>
  );
}

/**
 * A signed change against the previous period. Colour says whether the move is
 * good, and the arrow says which way it went, so neither carries it alone.
 */
function Delta({
  current,
  previous,
  unit,
  note,
  higherIsBetter = true,
}: {
  current: number;
  previous: number;
  unit?: "pts";
  note: string;
  higherIsBetter?: boolean;
}) {
  const diff = current - previous;
  let text: string;
  if (unit === "pts") text = `${Math.abs(diff)} pts`;
  else if (previous === 0) text = diff === 0 ? "0" : "new";
  else text = `${Math.round(Math.abs(diff / previous) * 100)}%`;

  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  const good = diff === 0 ? null : diff > 0 === higherIsBetter;

  return (
    <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
      <span
        className="flex items-center gap-0.5 font-medium"
        style={{
          color: good === null ? undefined : good ? "var(--delta-good)" : "var(--delta-bad)",
        }}
      >
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{diff > 0 ? "Up" : diff < 0 ? "Down" : "No change"}</span>
        {text}
      </span>
      {note}
    </p>
  );
}

/* ---------------------------------- charts --------------------------------- */

/** One point on the time axis: an hour for Today, a day otherwise. */
interface Bucket {
  key: string;
  label: string;
  title: string;
  conversations: number;
  answered: number;
  missed: number;
}

function Charts({
  analytics,
  rangeName,
  today,
}: {
  analytics: AdminAnalytics;
  rangeName: string;
  today: boolean;
}) {
  const { daily, hourly, agents, branches, totals } = analytics;
  const busiest = hourly.reduce(
    (best, h) => (h.conversations > (hourly[best]?.conversations ?? 0) ? h.hour : best),
    0,
  );
  const hourSpan = (hour: number) => `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;

  // Today has a single daily point, so the time series switch to hourly buckets.
  const buckets: Bucket[] = today
    ? hourly.map((h) => ({
        key: String(h.hour),
        label: hourLabel(h.hour),
        title: hourSpan(h.hour),
        conversations: h.conversations,
        answered: h.answered,
        missed: h.missed,
      }))
    : daily.map((d) => ({
        key: d.date,
        label: shortDay(d.date),
        title: longDay(d.date),
        conversations: d.conversations,
        answered: d.answered,
        missed: d.missed,
      }));
  const unit = today ? "hour" : "day";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <ChartCard
        className="lg:col-span-2"
        icon={TrendingUp}
        title={`Conversations per ${unit}`}
        description={`${formatNumber(totals.conversations)} started ${rangeName}`}
        rows={buckets}
        rowKey={(b) => b.key}
        columns={[
          { header: today ? "Hour" : "Date", cell: (b) => b.title },
          { header: "Conversations", cell: (b) => b.conversations, numeric: true },
        ]}
      >
        <AreaTrend
          seriesName="Conversations"
          empty={totals.conversations === 0 ? "No conversations in this range" : undefined}
          points={buckets.map((b) => ({
            key: b.key,
            label: b.label,
            title: b.title,
            value: b.conversations,
          }))}
        />
      </ChartCard>

      <ChartCard
        icon={Clock}
        title="Busiest hours"
        description={
          totals.conversations
            ? `Most chats start around ${hourLabel(busiest)}`
            : "Conversations started by hour of day"
        }
        rows={hourly}
        rowKey={(h) => String(h.hour)}
        columns={[
          { header: "Hour", cell: (h) => hourSpan(h.hour) },
          { header: "Conversations", cell: (h) => h.conversations, numeric: true },
        ]}
      >
        <Columns
          ariaLabel="Conversations started by hour of day"
          empty={totals.conversations === 0 ? "No conversations in this range" : undefined}
          series={[{ key: "n", name: "Conversations", color: "var(--chart-1)" }]}
          data={hourly.map((h) => ({
            key: String(h.hour),
            label: String(h.hour).padStart(2, "0"),
            title: hourSpan(h.hour),
            values: { n: h.conversations },
          }))}
        />
      </ChartCard>

      <ChartCard
        className="lg:col-span-2"
        icon={Inbox}
        title={`Enquiries per ${unit}`}
        description="Pre-chat forms that reached an agent, and those that found nobody online"
        legend={
          <Legend
            items={[
              {
                label: SERIES.answered.name,
                color: SERIES.answered.color,
                value: formatNumber(totals.answered),
              },
              {
                label: SERIES.missed.name,
                color: SERIES.missed.color,
                value: formatNumber(totals.missed),
              },
            ]}
          />
        }
        rows={buckets}
        rowKey={(b) => b.key}
        columns={[
          { header: today ? "Hour" : "Date", cell: (b) => b.title },
          { header: "Answered", cell: (b) => b.answered, numeric: true },
          { header: "Missed", cell: (b) => b.missed, numeric: true },
        ]}
      >
        <Columns
          ariaLabel={`Enquiries per ${unit}, answered and missed`}
          empty={totals.answered + totals.missed === 0 ? "No enquiries in this range" : undefined}
          series={[SERIES.answered, SERIES.missed]}
          data={buckets.map((b) => ({
            key: b.key,
            label: today ? b.label.slice(0, 2) : b.label,
            title: b.title,
            values: { answered: b.answered, missed: b.missed },
          }))}
        />
      </ChartCard>

      <ChartCard
        icon={UserRound}
        title="Agent workload"
        description={`Conversations handled ${rangeName}`}
        rows={agents}
        rowKey={(a) => a.agentId}
        columns={[
          { header: "Agent", cell: (a) => a.name },
          { header: "Branch", cell: (a) => a.branchName },
          { header: "Handled", cell: (a) => a.handled, numeric: true },
          { header: "Open now", cell: (a) => a.activeNow, numeric: true },
        ]}
      >
        <BarList
          empty="No active agents."
          items={agents.map((a) => ({
            key: a.agentId,
            label: a.name,
            sublabel: a.branchName,
            value: a.handled,
            detail: `${a.activeNow} open now`,
            leading: <StatusDot online={a.isOnline} />,
          }))}
        />
      </ChartCard>

      <ChartCard
        className="lg:col-span-3"
        icon={Building2}
        title="Branches"
        description={`Conversations per branch ${rangeName}`}
        rows={branches}
        rowKey={(b) => b.branchId}
        columns={[
          { header: "Branch", cell: (b) => b.name },
          { header: "Conversations", cell: (b) => b.conversations, numeric: true },
          { header: "Answered", cell: (b) => b.answered, numeric: true },
          { header: "Missed", cell: (b) => b.missed, numeric: true },
        ]}
      >
        <BarList
          empty="No branches yet."
          items={branches.map((b) => ({
            key: b.branchId,
            label: b.name,
            sublabel: b.isActive ? undefined : "inactive",
            value: b.conversations,
            detail: `${b.missed} missed · ${b.answered} answered`,
          }))}
        />
      </ChartCard>
    </div>
  );
}

/* ----------------------------------- team ---------------------------------- */

function Team({ branches }: { branches: BranchWithAgents[] }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Users className="size-4 text-muted-foreground" aria-hidden />
        Team right now
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">Updates live as agents go on and offline</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((branch) => (
          <div key={branch.id} className="min-w-0">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {branch.name}
              {!branch.isActive && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case">
                  inactive
                </span>
              )}
            </h3>
            <div className="overflow-hidden rounded-lg border">
              {branch.agents.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No agents yet.</p>
              ) : (
                branch.agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <StatusDot online={agent.isOnline && agent.isActive} />
                      <span
                        className={cn(
                          "truncate",
                          !agent.isActive && "text-muted-foreground line-through",
                        )}
                      >
                        {agent.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {!agent.isActive
                        ? "deactivated"
                        : agent.isOnline
                          ? `${agent.activeConversationCount} active`
                          : "offline"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
