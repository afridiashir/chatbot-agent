import { Prisma, prisma } from "@repo/db";
import type { AdminAnalytics, AnalyticsDay, AnalyticsHour } from "@repo/types";
import type { AnalyticsQuery } from "@repo/validation";
import { sqlInBranch } from "../lib/admin-scope.js";
import type { AdminTokenPayload } from "../lib/auth.js";

interface Bounds {
  from: Date;
  to: Date;
  previousFrom: Date;
  days: string[];
}

/**
 * The range is whole local days ending today: `days = 7` means today and the
 * six before it. Computed in PostgreSQL so it agrees exactly with the grouping.
 */
async function rangeBounds(days: number, tz: string): Promise<Bounds> {
  const [row] = await prisma.$queryRaw<
    Array<{ from: Date; to: Date; previousFrom: Date; days: string[] }>
  >`
    WITH today AS (
      SELECT date_trunc('day', now() AT TIME ZONE ${tz}) AS start
    ), span AS (
      SELECT start - make_interval(days => ${days - 1}::int) AS first_day, start FROM today
    )
    SELECT
      first_day AT TIME ZONE ${tz} AT TIME ZONE 'UTC' AS "from",
      (start + interval '1 day') AT TIME ZONE ${tz} AT TIME ZONE 'UTC' AS "to",
      (first_day - make_interval(days => ${days}::int)) AT TIME ZONE ${tz} AT TIME ZONE 'UTC' AS "previousFrom",
      ARRAY(
        SELECT to_char(d, 'YYYY-MM-DD')
        FROM generate_series(first_day, start, interval '1 day') AS d
      ) AS days
    FROM span
  `;
  return row!;
}

export async function getAnalytics(
  query: AnalyticsQuery,
  actor: AdminTokenPayload,
): Promise<AdminAnalytics> {
  const { days, tz } = query;
  const companyId = actor.companyId;
  // A branch admin's charts cover their branch only; empty for a company admin.
  const inBranch = sqlInBranch(actor, Prisma.sql`b.id`);
  const enquiryInBranch = sqlInBranch(actor, Prisma.sql`e."branchId"`);
  const { from, to, previousFrom, days: dayLabels } = await rangeBounds(days, tz);

  const [
    conversationsByDay,
    messagesByDay,
    enquiriesByDay,
    hourlyRows,
    enquiriesByHour,
    previousRows,
    responseRows,
    branchRows,
    agentRows,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ day: string; n: number }>>`
      SELECT to_char((c."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day, count(*)::int AS n
       FROM "Conversation" c
       JOIN "Agent" a ON a.id = c."agentId"
       JOIN "Branch" b ON b.id = a."branchId"
       WHERE b."companyId" = ${companyId} ${inBranch} AND c."createdAt" >= ${from} AND c."createdAt" < ${to}
       GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ day: string; n: number }>>`
      SELECT to_char((m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day, count(*)::int AS n
       FROM "Message" m
       JOIN "Conversation" c ON c.id = m."conversationId"
       JOIN "Agent" a ON a.id = c."agentId"
       JOIN "Branch" b ON b.id = a."branchId"
       WHERE b."companyId" = ${companyId} ${inBranch} AND m."createdAt" >= ${from} AND m."createdAt" < ${to}
       GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ day: string; answered: number; missed: number }>>`
      SELECT to_char((e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day,
              count(*) FILTER (WHERE e.answered)::int AS answered,
              count(*) FILTER (WHERE NOT e.answered)::int AS missed
       FROM "Enquiry" e
       JOIN "Lead" l ON l.id = e."leadId"
       WHERE l."companyId" = ${companyId} ${enquiryInBranch} AND e."createdAt" >= ${from} AND e."createdAt" < ${to}
       GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ hour: number; n: number }>>`
      SELECT extract(hour FROM (c."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}))::int AS hour, count(*)::int AS n
       FROM "Conversation" c
       JOIN "Agent" a ON a.id = c."agentId"
       JOIN "Branch" b ON b.id = a."branchId"
       WHERE b."companyId" = ${companyId} ${inBranch} AND c."createdAt" >= ${from} AND c."createdAt" < ${to}
       GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ hour: number; answered: number; missed: number }>>`
      SELECT extract(hour FROM (e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}))::int AS hour,
              count(*) FILTER (WHERE e.answered)::int AS answered,
              count(*) FILTER (WHERE NOT e.answered)::int AS missed
       FROM "Enquiry" e
       JOIN "Lead" l ON l.id = e."leadId"
       WHERE l."companyId" = ${companyId} ${enquiryInBranch} AND e."createdAt" >= ${from} AND e."createdAt" < ${to}
       GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ conversations: number; answered: number; missed: number }>>`
      SELECT
        (SELECT count(*)::int
         FROM "Conversation" c
         JOIN "Agent" a ON a.id = c."agentId"
         JOIN "Branch" b ON b.id = a."branchId"
         WHERE b."companyId" = ${companyId} ${inBranch}
           AND c."createdAt" >= ${previousFrom} AND c."createdAt" < ${from}) AS conversations,
        count(*) FILTER (WHERE e.answered)::int AS answered,
        count(*) FILTER (WHERE NOT e.answered)::int AS missed
      FROM "Enquiry" e
      JOIN "Lead" l ON l.id = e."leadId"
      WHERE l."companyId" = ${companyId} ${enquiryInBranch}
        AND e."createdAt" >= ${previousFrom} AND e."createdAt" < ${from}
    `,
    // A conversation counts once both sides have spoken; the reply must come
    // after the visitor's first message, not before it.
    prisma.$queryRaw<Array<{ median: number | null }>>`
      WITH firsts AS (
        SELECT
          min(m."createdAt") FILTER (WHERE m."senderType" = 'VISITOR') AS visitor_at,
          min(m."createdAt") FILTER (WHERE m."senderType" = 'AGENT') AS agent_at
        FROM "Conversation" c
        JOIN "Agent" a ON a.id = c."agentId"
        JOIN "Branch" b ON b.id = a."branchId"
        JOIN "Message" m ON m."conversationId" = c.id
        WHERE b."companyId" = ${companyId} ${inBranch}
          AND c."createdAt" >= ${from} AND c."createdAt" < ${to}
        GROUP BY c.id
      )
      SELECT percentile_cont(0.5) WITHIN GROUP (
        ORDER BY extract(epoch FROM agent_at - visitor_at)
      )::float8 AS median
      FROM firsts
      WHERE visitor_at IS NOT NULL AND agent_at IS NOT NULL AND agent_at >= visitor_at
    `,
    prisma.$queryRaw<
      Array<{
        branchId: string;
        name: string;
        isActive: boolean;
        conversations: number;
        answered: number;
        missed: number;
      }>
    >`
      SELECT
        b.id AS "branchId", b.name, b."isActive",
        (SELECT count(*)::int
         FROM "Conversation" c JOIN "Agent" a ON a.id = c."agentId"
         WHERE a."branchId" = b.id
           AND c."createdAt" >= ${from} AND c."createdAt" < ${to}) AS conversations,
        (SELECT count(*)::int FROM "Enquiry" e
         WHERE e."branchId" = b.id AND e.answered
           AND e."createdAt" >= ${from} AND e."createdAt" < ${to}) AS answered,
        (SELECT count(*)::int FROM "Enquiry" e
         WHERE e."branchId" = b.id AND NOT e.answered
           AND e."createdAt" >= ${from} AND e."createdAt" < ${to}) AS missed
      FROM "Branch" b
      WHERE b."companyId" = ${companyId} ${inBranch}
      ORDER BY b.name
    `,
    prisma.$queryRaw<
      Array<{
        agentId: string;
        name: string;
        branchName: string;
        isOnline: boolean;
        activeNow: number;
        handled: number;
      }>
    >`
      SELECT
        a.id AS "agentId", a.name, b.name AS "branchName", a."isOnline",
        count(c.id) FILTER (WHERE c.status = 'ACTIVE')::int AS "activeNow",
        count(c.id) FILTER (
          WHERE c."createdAt" >= ${from} AND c."createdAt" < ${to}
        )::int AS handled
      FROM "Agent" a
      JOIN "Branch" b ON b.id = a."branchId"
      LEFT JOIN "Conversation" c ON c."agentId" = a.id
      WHERE b."companyId" = ${companyId} ${inBranch} AND a."isActive"
      GROUP BY a.id, b.name
      ORDER BY handled DESC, a.name
    `,
  ]);

  const byDay = new Map<string, AnalyticsDay>(
    dayLabels.map((date) => [
      date,
      { date, conversations: 0, messages: 0, answered: 0, missed: 0 },
    ]),
  );
  for (const row of conversationsByDay) {
    const day = byDay.get(row.day);
    if (day) day.conversations = row.n;
  }
  for (const row of messagesByDay) {
    const day = byDay.get(row.day);
    if (day) day.messages = row.n;
  }
  for (const row of enquiriesByDay) {
    const day = byDay.get(row.day);
    if (day) {
      day.answered = row.answered;
      day.missed = row.missed;
    }
  }
  const daily = [...byDay.values()];

  const hourly: AnalyticsHour[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    conversations: 0,
    answered: 0,
    missed: 0,
  }));
  for (const row of hourlyRows) hourly[row.hour]!.conversations = row.n;
  for (const row of enquiriesByHour) {
    hourly[row.hour]!.answered = row.answered;
    hourly[row.hour]!.missed = row.missed;
  }

  const sum = (key: keyof Omit<AnalyticsDay, "date">) =>
    daily.reduce((total, day) => total + day[key], 0);

  const previous = previousRows[0] ?? { conversations: 0, answered: 0, missed: 0 };

  return {
    range: { days, timeZone: tz, from: from.toISOString(), to: to.toISOString() },
    totals: {
      conversations: sum("conversations"),
      messages: sum("messages"),
      answered: sum("answered"),
      missed: sum("missed"),
      medianFirstResponseSeconds: responseRows[0]?.median ?? null,
    },
    previous,
    daily,
    hourly,
    branches: branchRows,
    agents: agentRows,
  };
}
