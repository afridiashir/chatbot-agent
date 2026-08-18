# Multi-Branch Chat Agent

Real-time customer support chat. A visitor picks a branch, the backend assigns
the online agent in that branch with the fewest active conversations, and the
two talk over a Socket.IO room backed by PostgreSQL.

## Structure

```
apps/
  server/      Express + Socket.IO — REST API, routing, realtime      :4000
  web/         Next.js company website (hosts the widget)             :3000
  widget/      Vite React embeddable chat widget                      :3002
  dashboard/   Next.js agent inbox + admin branch view                :3003
packages/
  db/          Prisma schema, client and seed
  types/       Shared domain types and Socket.IO event contracts
  validation/  Zod request/payload schemas
```

`apps/server` exists because Socket.IO needs a long-lived Node HTTP server to
attach to; Next.js route handlers cannot host one cleanly. Keeping the REST API
beside it means there is exactly one backend rather than two half-backends.

`apps/widget` uses Vite rather than Next because an embeddable widget has to
build to a single self-mounting `widget.js`. It renders into a shadow root so
neither its styles nor the host page's can reach across.

## Prerequisites

- Node 20+ (developed on 24)
- pnpm (`corepack enable pnpm`)
- Docker, for PostgreSQL

## Setup

```bash
cp .env.example .env          # then fill in JWT_SECRET and AGENT_PASSWORD
docker compose up -d          # starts PostgreSQL on :5432
pnpm install
pnpm db:generate
pnpm dev
```

Generate a secret with `openssl rand -hex 32`.

## Scripts

| Command | Effect |
| --- | --- |
| `pnpm dev` | Runs all four apps via Turborepo |
| `pnpm build` | Builds every workspace |
| `pnpm typecheck` | `tsc --noEmit` everywhere |
| `pnpm db:migrate` | Creates/applies a Prisma migration |
| `pnpm db:seed` | Loads the demo company, branches and agents |
| `pnpm db:studio` | Opens Prisma Studio |
| `pnpm db:reset` | Drops, re-migrates and re-seeds |

## Database notes

The compose file pins **postgres:17-alpine**. `postgres:18-alpine` was tried
first but extracted with every binary at 0 bytes on this machine even after a
clean re-pull — a local Docker image-store fault, not a project constraint.
Nothing in the schema needs 18.

Re-running `pnpm db:seed` restores the exact state this README describes.
Conversations, visitors and leads are rebuilt, and any branch or agent created
outside the seed — by an admin, or by a test run — is removed, so "seeded" is
not gradually diluted by everything that has happened since.

## Ports

The dashboard runs on **3003** rather than the more usual 3001, which was
already occupied on this machine. Change it in `apps/dashboard/package.json`
and in `CORS_ORIGINS` if you prefer another.

## API

All endpoints answer with the same envelope:

```jsonc
{ "ok": true,  "data": ... }
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "details": {} } }
```

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/api/branches` | Branch picker for the widget |
| GET | `/api/branches/:branchId/agents` | Agents with live counts **(agent auth)** |
| GET | `/api/branches/overview` | Every branch with its agents **(agent auth)** |
| POST | `/api/auth/login` | Email + shared password, returns a 7-day bearer token |
| GET | `/api/auth/me` | Revalidates a stored token on dashboard load |
| PATCH | `/api/agents/:agentId/status` | Online/offline toggle (own account only) |
| GET | `/api/agents/:agentId/conversations` | Agent inbox, `?status=ACTIVE\|CLOSED` |
| POST | `/api/conversations` | Assign an agent and open the chat |
| GET | `/api/conversations/:id` | Full transcript |
| POST | `/api/conversations/:id/messages` | Persist one message |
| POST | `/api/conversations/:id/close` | ACTIVE -> CLOSED (assigned agent only) |

### Admin API (separate `Admin` account)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/admin/auth/login` | Admin sign in |
| GET | `/api/admin/auth/me` | Revalidate an admin token |
| GET | `/api/admin/stats` | Counts for the overview |
| GET | `/api/admin/branches` | Every branch with agents, **including inactive** |
| POST | `/api/admin/branches` | Create a branch |
| PATCH | `/api/admin/branches/:id` | Rename / activate / deactivate |
| POST | `/api/admin/agents` | Create an agent with an initial password |
| PATCH | `/api/admin/agents/:id` | Rename, move branch, reset password, deactivate |
| GET | `/api/admin/conversations` | Every agent's chats, filter by branch/agent/status |
| GET | `/api/admin/conversations/:id` | Read-only transcript |

### Status codes on `POST /api/conversations`

| Outcome | Status | Body |
| --- | --- | --- |
| New conversation | 201 | `{ available: true, conversation, resumed: false }` |
| Resumed after refresh | 200 | `{ available: true, conversation, resumed: true }` |
| Nobody online | 200 | `{ available: false, message }` |

"No agents available" is a normal answer, not a failure, so it stays inside a
successful envelope rather than becoming an HTTP error.

### Who can touch a conversation

Either the assigned agent (bearer token) or the visitor who started it (the id
from localStorage). Everyone else gets 403. `senderType` must match the caller,
so neither side can post as the other, and a CLOSED conversation rejects new
messages with 409.

### Authentication

There are two account types, in two tables, with two login endpoints:

| | Table | Login | Can do |
| --- | --- | --- | --- |
| Agent | `Agent` | `POST /api/auth/login` | Answer and close their own chats, set availability |
| Admin | `Admin` | `POST /api/admin/auth/login` | Manage branches and agents, read every conversation |

Each account holds its **own** password, hashed with scrypt from `node:crypto`
(no dependency needed). The stored format is
`scrypt$N$r$p$salt$hash`, so the cost parameters can be raised later without
invalidating existing hashes.

Tokens are JWTs carrying a `role` claim, so an agent token can never satisfy an
admin route just because both are signed with the same secret. A login against a
missing account still verifies against a dummy hash, so "no such account" and
"wrong password" take the same time and cannot be told apart from outside.

Remaining limitation: tokens are not revocable before their 7-day expiry.

Going offline does **not** close an agent's existing conversations; they keep
them, and only stop receiving new ones.

## Agent routing

`assignAgent()` in `apps/server/src/services/routing.ts` runs the whole decision
inside one transaction that starts by taking `FOR UPDATE` row locks on the
branch's online agents:

1. resume an existing ACTIVE conversation for this visitor, if any;
2. lock the branch's online agents, ordered by `id`;
3. count each one's ACTIVE conversations;
4. take the lowest, breaking ties on `createdAt` then `id`;
5. create the conversation inside the same transaction.

A second visitor hitting the same branch blocks on those locks until the first
has committed, so it reads the updated load rather than a stale count. Locking
in `id` order means two such transactions cannot deadlock. READ COMMITTED is
enough precisely because the locks are explicit, so there are no serialization
failures to retry.

Verify with `pnpm --filter @repo/server check:routing` (rewrites the Karachi
branch; run `pnpm db:seed` afterwards). Nine simultaneous visitors against three
online agents distribute 3/3/3. The same test with the lock removed puts 6-8 of
the 9 on a single agent.

### Known limitations

- Locks are held for the length of the transaction, so assignments **within one
  branch** are serialised. At 4-5 agents per branch this is irrelevant; it would
  matter at a far larger scale.
- An agent who comes online *during* an in-flight assignment is not considered
  by that assignment. They are picked up by the next one.
- Load is measured as a raw count of ACTIVE conversations. It does not know
  which chats are actually busy.

## Realtime

Socket.IO is attached to the same HTTP server as the REST API.

**Handshake auth** mirrors the REST rules: a visitor presents its localStorage
id, an agent presents the login token. The resolved caller lands on
`socket.data` as the same `Actor` the HTTP routes use, so ownership checks are
written once.

**Rooms**

| Room | Members | Carries |
| --- | --- | --- |
| `conversation:{id}` | the visitor + assigned agent, after an access check | `message:new`, `conversation:closed` |
| `agent:{agentId}` | that agent, joined automatically | `conversation:assigned`, `conversation:closed` |
| `branch:{branchId}` | agents of the branch | reserved for branch-wide notices |
| `admin` | any authenticated agent | `agent:status` |

Visitors join **no** room automatically — only conversation rooms they own, and
`conversation:join` runs the same ownership check as `GET /api/conversations/:id`.

### Typing indicators

`typing` is the one event that is **never persisted** — it is pure socket
traffic, so a lost notice costs nothing and it is deliberately unacknowledged.

The sender announces once when typing starts, re-announces every 1.5s while it
continues, and announces a stop 2s after the last keystroke. The receiver hides
the indicator if nothing arrives within 4s. That pairing is what makes a closed
tab or a dropped connection clear the indicator on its own — no stop notice is
ever sent in those cases. The shared timings live in `TYPING` in
`@repo/types` so both ends cannot drift apart.

The server broadcasts with `socket.to(room)` rather than `io.to(room)`, so the
sender never watches themselves type, and it only forwards for sockets already
in the room — membership was access-checked at `conversation:join`, so no
database round trip is needed on a per-keystroke event.

**Messages are persisted before they are broadcast.** The socket handler calls
the same `addMessage` service the REST endpoint does, so PostgreSQL is the
record of what was said and Socket.IO only reports what is already stored. A
reply sent over REST reaches the room exactly like one sent over the socket.

Verify with `pnpm --filter @repo/server check:realtime` (needs the API running;
run `pnpm db:seed` afterwards).

## The dashboard

`apps/dashboard` is a client-rendered Next app that talks to the API like any
other consumer — it holds no database connection of its own.

| Route | Purpose |
| --- | --- |
| `/login` | Email + shared password, token stored in localStorage |
| `/` | Availability toggle, live inbox, transcript, close |
| `/admin` | Read-only view of every branch and agent |

A stored token is always revalidated against `/api/auth/me` on load rather than
trusted, so an expired or revoked session lands on `/login`.

### Leads

Every pre-chat form submission is recorded as a `Lead`, **whether or not an
agent was available** — an enquiry that reached nobody is exactly the one worth
following up, so losing it is the worst outcome.

Leads are deduplicated on **email within a company**. `Lead` is deliberately a
separate table from `Visitor`: a Visitor is one *browser* (its id is the value
in localStorage, and conversations are owned by it), while a Lead is a *person*,
who may reach you from several devices over time. Enquiring again from a new
phone updates the one lead row rather than creating a second, and the most
recent name and number win, because people correct their own typos.

### The history, kept over time

Deduplicating the person must not flatten *when* they got in touch, so every
submission is also written as its own `Enquiry` row: its own timestamp, the
branch that was asked for, whether anyone answered, and a link to the chat when
one opened. Opening a lead in `/admin/leads` shows that timeline.

`enquiryCount` and `missedCount` are **derived** from those rows rather than
stored as columns — the same rule the routing code follows for agent load, and
for the same reason: a stored counter is a second source of truth that can
drift. The list aggregates them in the database (`groupBy`) rather than loading
every enquiry, so a lead with hundreds of approaches still costs two queries.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/leads` | Filter by branch, `missedOnly`, or a name/email/phone search |
| GET | `/api/admin/leads/:leadId` | One lead with its full enquiry history |

**`pnpm db:seed` no longer clears leads.** Conversations and visitors are demo
traffic and get rebuilt, but leads are a record of real people who got in touch
and are meant to accumulate. Use `pnpm db:reset` for a genuinely empty database.

### Surviving a lost connection

Messages have always been persisted server-side. What the agent dashboard adds
is that nothing is lost on the **client** either:

| | Behaviour |
| --- | --- |
| Draft replies | Saved per conversation in localStorage; restored on reload, flagged as `Draft:` in the list |
| Sending while offline | The composer stays enabled. The message is queued, shown as pending with a clock, and delivered on reconnect |
| Reload or crash mid-outage | The queue lives in localStorage, so it is still there afterwards |
| Messages received during the outage | The transcript is refetched on reconnect — anything said while the socket was down was never broadcast to it |

**Retries cannot duplicate.** Each queued message carries a `clientId`
generated before the first attempt and stored on `Message.clientId` behind a
unique index. Re-delivering the same key returns the stored row instead of
inserting again, and the server only broadcasts when it actually created
something. That covers the nasty case: the send succeeded but the ack never
made it back, so the client retries.

Two supporting changes make this behave the way a user expects:

- Socket.IO's defaults leave a dead connection undetected for up to 45 seconds.
  The heartbeat is tuned to `pingInterval: 10s` / `pingTimeout: 5s`.
- The clients also listen to the browser's own `online`/`offline` events, which
  fire the instant the network drops rather than waiting for a missed heartbeat.

### Look and feel

The agent inbox is laid out like a desktop chat client: a contact list on the
left with avatar, last message and relative time, and a conversation panel on
the right with a tinted canvas, asymmetric bubbles, in-bubble timestamps and
day separators.

**Avatars are generated, never stored.** The colour comes from a hash of the
row id and the initials from the name, so the same person looks identical on
every screen and every reload with no extra column, no upload flow and no
off-origin request — which also keeps the widget's strict CSP happy if this is
ever reused there. Every palette colour is dark enough for white text to clear
WCAG AA. If you later want real photographs, add an `avatarUrl` column and fall
back to this component when it is null.

Chat colours live as CSS tokens (`--chat-bg`, `--chat-bubble-in`,
`--chat-bubble-out`, …) defined for both themes, so the panel, bubbles and the
presence ring on avatars stay in step.

The inbox joins the room of **every** active conversation, not just the open
one, so list previews stay live for chats the agent is not currently reading.
Closing is driven entirely by the `conversation:closed` broadcast — the button
does not optimistically remove the row, so what the agent sees is what the
server actually recorded.

**Note:** `GET /api/branches/:branchId/agents` now requires agent authentication.
It exposes staff names and email addresses, and those emails are login
identifiers. The widget never calls it — it only needs `GET /api/branches`.

## The admin dashboard

Lives in `apps/dashboard` under `/admin`, behind its own login, and never shares
a session with the agent side (the two tokens are stored under separate keys).

| Route | Purpose |
| --- | --- |
| `/admin/login` | Administrator sign in |
| `/admin` | Counts, plus every branch and agent with live status |
| `/admin/branches` | Add, rename, deactivate, reactivate |
| `/admin/agents` | Add with an initial password, move between branches, deactivate |
| `/admin/conversations` | Every agent's chats, filterable by branch and status |

**Admin visibility into conversations is read-only.** Replying and closing stay
with the assigned agent — over HTTP and over the socket.

### Soft delete

Nothing is ever hard-deleted, so history survives.

*Deactivating a branch* hides it from the widget and stops new chats routing
there. Existing conversations continue, so nobody is cut off mid-chat.

*Deactivating an agent* forces them offline, blocks them from signing in, and
**closes their open conversations** — a deactivated agent cannot reply, and
leaving visitors waiting on a silent chat would be worse than ending it. Each
closure is broadcast, so visitors are told in real time rather than discovering
it later. The response reports how many were closed.

## The widget

### Pre-chat form

The widget opens with a short form — **name, phone number, email and branch** —
and only assigns an agent once it validates. Whoever picks the chat up therefore
knows who they are talking to, and can still reach them by phone or email if the
connection drops.

Those details live in their own `Visitor` table keyed by the id the widget keeps
in localStorage, not as columns on `Conversation`. A returning visitor has one
set of details rather than a copy per chat, and correcting a typo on a later
chat updates the one record. Returning visitors are not asked again — a resumed
conversation goes straight back to the transcript.

Validation runs in the widget for fast feedback and again on the server, which
is the authority. Phone numbers are only loosely checked: they vary far too much
between countries to validate strictly.

`apps/widget` builds to a single self-mounting `dist/widget.js` (254 KB, 79 KB
gzipped). `apps/web` copies it into `public/` at build time via
`scripts/sync-widget.mjs` and includes it with one tag:

```html
<script src="/widget.js" data-acme-chat data-api-url="http://localhost:4000"></script>
```

Only public values are passed. `data-company-id`, `data-website-id` and
`data-widget-id` are already read by `readConfig()` and ignored by the backend —
the hook for multi-tenant work, without any of it built yet.

It renders into a **shadow root**, so Tailwind's preflight cannot restyle the
customer's page and their CSS cannot reach into ours.

### Developing on the widget

| Goal | Command |
| --- | --- |
| Iterate on the widget alone, with HMR | open `http://localhost:3002` |
| See it embedded on the company site | `pnpm --filter @repo/widget build`, then reload `:3000` |

The company site cannot load the widget straight from the Vite dev server:
`@vitejs/plugin-react` needs a Fast Refresh preamble that only exists in HTML
Vite itself renders, so the module throws when a Next-rendered page loads it.
Serving the built bundle from the site's own origin is also what a real
embedding customer does, so development and production stay identical.

## Tests

Three suites, all driven through the public API — no direct database access, so
authentication and authorisation are exercised too.

```bash
pnpm --filter @repo/server check:routing   # 12 — routing rules + the race (no server needed)
pnpm --filter @repo/server check:flow      # 25 — the full scenario end to end
pnpm --filter @repo/server check:realtime  # 26 — sockets, typing, idempotent re-delivery
pnpm --filter @repo/server check:admin     # 65 — admin CRUD, soft delete, leads, history
pnpm check                                 # all three, then re-seeds
```

`check:flow` and `check:realtime` need the API running (`pnpm dev`), and
`AGENT_PASSWORD` must be exported or present in `.env`. Each rearranges the
Karachi branch and finishes by telling you to re-seed; `pnpm check` does that
for you.

`check:flow` builds each load figure using only the public API — it brings one
agent online at a time so routing has nowhere else to put a chat — then asserts
the spec scenario:

| State | Expected | Result |
| --- | --- | --- |
| Ahmed 2 / Bilal 1 / Usman offline / Hamza 3 | Bilal | pass |
| Ahmed 2 / Bilal 2 / Hamza 3 | Ahmed (tie-break) | pass |
| Ahmed 2 / Bilal offline / Hamza 3 | Ahmed | pass |
| All four offline | `available: false`, nothing created | pass |

It then runs one conversation through its whole life: open, real-time exchange
both ways, persistence check, refresh-and-resume, close, load returns to zero,
further messages refused, and a new chat can start.

## Build status

- [x] Step 1 — Turborepo, four apps, three packages, `pnpm dev` and `pnpm build` green
- [x] Step 2 — Prisma models, migration, seed (17 agents across 4 branches)
- [x] Step 3 — Branch/agent APIs
- [x] Step 4 — Agent online/offline + MVP auth
- [x] Step 5 — `assignAgent(branchId)` routing, race-safe
- [x] Step 6 — Conversations and messages
- [x] Step 7 — Socket.IO realtime
- [x] Step 8 — Customer widget
- [x] Step 9 — Agent dashboard + admin view
- [x] Step 10 — Full flow test
- [x] Admin dashboard — branch/agent management, company-wide conversation visibility
- [x] Pre-chat form — visitor name/phone/email/branch captured before assignment
- [x] Typing indicators — both directions, self-clearing, never persisted
- [x] Chat-client styling for the agent inbox, with generated avatars
- [x] Offline resilience — persisted drafts, queued sends, reconnect resync
- [x] Lead capture — every enquiry saved and deduplicated, answered or not
- [x] Enquiry history — each approach kept as a dated row, counts derived
