# Sensei — Master Plan

*(working name: Sensei — AI-powered Fantasy Premier League coach)*

## 1. Overview

Sensei is a personal web app that acts as an AI-powered Fantasy Premier
League (FPL) manager coach. The user enters their FPL manager ID; the app
pulls their squad, price trends, upcoming fixtures, and history from the
official FPL API, then produces a written, coach-style report: transfer
suggestions, captain/vice-captain pick, chip strategy, and price change
alerts.

The report is not templated boilerplate. Raw stats are computed first,
then handed to an LLM to reason over and write up in natural language —
the "coach voice." The LLM never sees raw API JSON; it sees a clean,
pre-digested summary so its output stays grounded in real numbers.

Sensei is also conversational: after the report loads, the user can ask
follow-up questions ("why not captain X instead", "is my defense weak
this run", "what if I take a hit to fix my attack") and get an answer
grounded in the same underlying data, not a generic chatbot reply.

## 2. Goals (v1)

- Enter a manager ID, get a squad view for the current gameweek.
- Get written recommendations covering:
  - Transfers: who to sell, who to bring in, why.
  - Captaincy: best captain + vice-captain pick for the upcoming gameweek.
  - Chips: whether to hold or play Wildcard / Bench Boost / Free Hit /
    Triple Captain, including double/blank gameweek detection.
  - Price alerts: players owned (or optionally watchlisted) at risk of a
    price rise or fall.
- A chat panel where the user can ask Sensei follow-up questions after
  the report loads, and get answers grounded in the same squad/fixture/
  form data the report used (not a bare, context-free chatbot).
- Deployed as a small, free-tier Vercel app with a shareable URL.

## 3. Non-goals (v1)

- No login/auth — manager ID is public data, no account system needed.
- No automatic transfers (FPL doesn't expose write access without the
  user's session cookie; out of scope and legally grey — read-only only).
- No mini-league features, no historical season-over-season analytics.
- No mobile app — responsive web page is enough.

These are natural v2 candidates, not ruled out permanently.

## 4. User flow

1. User opens the app, enters their manager ID (and optionally picks a
   gameweek; defaults to the current one).
2. Frontend calls `POST /api/coach` with `{ managerId, event? }`.
3. Serverless function:
   - Fetches `bootstrap-static` (cached — see §8) for all player/team/event data.
   - Fetches the manager's entry info, current picks, and history.
   - Fetches fixtures (cached) for difficulty ratings and double/blank
     gameweek detection.
   - Fetches per-player fixture data (`element-summary`) for each squad
     member, capped to what's needed for the next N gameweeks.
   - Runs the analysis modules (§6) to produce a structured, numeric
     summary — no prose yet.
   - Sends that summary to the LLM with a system prompt defining the
     "experienced FPL manager" persona and a required output shape.
   - Returns the structured report (JSON) to the frontend.
4. Frontend renders the squad and the written sections.
5. From there, the user can type a question into a chat panel. Each
   message is sent to `POST /api/chat` along with the same analysis
   summary from step 3 and the running conversation history (kept
   client-side — see §7a). Sensei answers using that grounding data
   instead of guessing.

## 5. Architecture

```
Browser (static HTML/TS)
   │  POST /api/coach { managerId }         POST /api/chat { message, analysisSummary, history }
   ▼                                         ▼
Vercel serverless functions
   ├── lib/fpl-client   → fetches from fantasy.premierleague.com/api/*
   │                      (server-side only — FPL API has no CORS
   │                      support for arbitrary origins, and this also
   │                      keeps the app from being blocked as a client-
   │                      side scraper)
   ├── lib/analysis/*   → pure functions, numeric analysis only
   ├── lib/persona.ts   → Sensei's shared system-prompt persona, used by
   │                      both endpoints below (single source of truth —
   │                      the report and the chat must sound like the
   │                      same coach)
   ├── lib/coach-prompt → builds the one-shot report LLM request
   └── lib/chat-prompt  → builds a follow-up chat LLM request from the
                           analysis summary + conversation history
                          │
                          ▼
                    Anthropic API (Claude)
```

Why a backend at all, instead of a pure static site: the FPL API does not
allow direct browser calls (no CORS headers for third-party origins), and
the LLM API key must never be shipped to the client. Both requirements
push the fetching and reasoning server-side.

`/api/chat` is deliberately stateless — no server-side session store. The
browser resends the analysis summary and recent message history with
every question; the backend never persists a conversation. This keeps
the whole app free-tier-friendly (no database) and means a page refresh
is the only "reset" a user needs.

## 6. Analysis modules (pure, unit-testable, no I/O)

Each module takes already-fetched data and returns plain numeric/struct
data — no strings meant for display, no LLM calls. This keeps them cheap
to test and keeps "the math" separate from "the writing."

- **`transfers.ts`** — scores each squad player on recent form, next-N
  fixture difficulty, minutes/rotation risk (`chance_of_playing_*`), and
  price trend; flags the weakest 1-5 and proposes replacement candidates
  within budget (squad value + bank) from the full player pool. How many
  of those are actually *recommended* this gameweek isn't fixed at one —
  it weighs each suggestion's projected `ep_next` gain against the
  manager's free transfers (simulated from `/entry/{id}/history/`, since
  FPL's public API never exposes the live count) and the standard -4
  point cost of a hit, so it can land on zero, one, or several transfers
  depending on what's actually worth it that week.
- **`captaincy.ts`** — ranks squad players by FPL's own `ep_next`
  (expected points, next gameweek) blended with fixture difficulty and
  double-gameweek status; returns top captain + vice candidates.
- **`chips.ts`** — detects double gameweeks (a team appears twice in one
  `event` in the fixtures list) and blank gameweeks (a team missing a
  fixture in a given `event`); combines this with squad fixture spread to
  suggest chip timing. Chip suggestions are explicitly framed as
  "worth considering" — this is a heuristic, not certainty.
- **`price-alerts.ts`** — flags players already changed today
  (`cost_change_event`) and estimates rise/fall risk from net transfer
  momentum (`transfers_in_event` vs `transfers_out_event`). This mirrors
  the community heuristic; FPL's actual algorithm is undisclosed, so
  alerts are always labeled as predictions, never guarantees.

## 7. LLM integration

- Provider: Anthropic API. Model chosen for cost/speed (configurable via
  `ANTHROPIC_MODEL` env var, not hardcoded — model names change).
- Input: a compact JSON object built by `coach-prompt.ts` from the
  analysis modules' output — never the raw FPL payloads.
- System prompt fixes the persona ("a sharp, experienced FPL manager who
  explains their reasoning plainly") and the required output structure
  (sections: summary, transfers, captaincy, chips, price alerts).
- Output: parsed back into structured JSON so the frontend can render
  consistent sections rather than an unstructured blob.
- Fallback: if no API key is configured, the app should still work using
  a plain rule-based writer over the same analysis output, so the app
  isn't dead in the water without an LLM key. This also isolates and
  proves the analysis logic independent of the LLM.

### 7a. Chat mode

- Same model, same persona (`lib/persona.ts`), different prompt builder
  (`lib/chat-prompt.ts`).
- Every chat request includes: the current analysis summary (so Sensei
  can reference "your defense" or "the transfer I suggested" correctly),
  the last N messages of history (client-sent, capped to keep token use
  sane — e.g. last 10 turns), and the new user question.
- Sensei answers only from what's grounded in the data it has. If asked
  something it has no basis for (e.g. next season's fixtures, a player
  not in the dataset), it should say so rather than invent an answer.
- No LLM key configured → chat is simply disabled in the UI with an
  explanatory message, rather than falling back to a generic ungrounded
  chatbot (a fallback here would defeat the point of the feature).

## 8. Data sources (official, public, no key required)

| Endpoint | Purpose | Notes |
|---|---|---|
| `/api/bootstrap-static/` | All players, teams, current event | Large (~1-2MB), changes rarely — cache 10 min |
| `/api/entry/{id}/` | Manager info, team name, overall rank | |
| `/api/entry/{id}/event/{gw}/picks/` | Current squad, captain, bench for a gameweek | |
| `/api/entry/{id}/history/` | Past gameweek points, chip usage | |
| `/api/fixtures/` | All fixtures + difficulty ratings | Cache 10 min |
| `/api/element-summary/{player_id}/` | Per-player fixture history/upcoming | Fetch only for squad players |

This is an unofficial-but-public API with no key or auth for read access.
Requests should carry a normal `User-Agent` and be cached where noted —
be a polite consumer, not a scraper.

## 9. Tech stack

- **Language:** TypeScript everywhere (frontend + serverless functions).
- **Hosting:** Vercel (Hobby/free tier — static hosting + serverless
  functions, no framework required for v1).
- **Frontend:** Vanilla TS + minimal DOM rendering. No framework needed
  at this scope; revisit only if the UI grows real complexity.
- **LLM:** Anthropic API, model set via env var.
- **Testing:** Vitest for the analysis modules (pure functions — cheap
  to cover well).

## 10. Project structure

```
sensei/
├── api/
│   ├── coach.ts             # POST /api/coach — orchestrates fetch → analyze → LLM → respond
│   └── chat.ts              # POST /api/chat — follow-up Q&A, grounded in the same analysis
├── lib/
│   ├── fpl-client.ts        # typed fetch wrappers per FPL endpoint, with caching
│   ├── fpl-types.ts         # TS interfaces for FPL API responses
│   ├── analysis/
│   │   ├── transfers.ts
│   │   ├── captaincy.ts
│   │   ├── chips.ts
│   │   └── price-alerts.ts
│   ├── persona.ts           # Sensei's shared system-prompt persona (single source of truth)
│   ├── coach-prompt.ts      # builds the one-shot report LLM request
│   ├── chat-prompt.ts       # builds a follow-up chat LLM request
│   └── fallback-writer.ts   # rule-based writer used when no LLM key set (report only)
├── public/
│   ├── index.html
│   ├── app.ts               # squad view + report rendering
│   ├── chat.ts              # chat panel UI + client-side history
│   └── styles.css
├── test/
│   └── analysis/*.test.ts
├── .env.example
├── package.json
├── tsconfig.json
├── vercel.json
└── MASTER.md
```

## 11. Environment variables

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | No (fallback writer used if absent) | LLM calls |
| `ANTHROPIC_MODEL` | No, has default | Which Claude model to call |

No FPL credentials needed — everything used is public read-only data.

## 12. Open decisions (need your input before/while building)

- **Ownership:** whose project is this — solo or shared? Affects where
  it lives (personal Vercel account/team) and whether the account is
  shared account or personal.
- **Vercel target:** existing account/project, or brand new?
- **API key:** do you have an `ANTHROPIC_API_KEY` ready to set as an
  environment variable on Vercel, or should v1 ship with the fallback
  rule-based writer until you add one?

## 13. Roadmap

- **Phase 1:** Scaffold repo, FPL client + caching, confirm live data
  fetch works end-to-end for a real manager ID.
- **Phase 2:** Build and unit-test the four analysis modules against
  real fetched data.
- **Phase 3:** Wire fallback writer (ships without needing an LLM key),
  then LLM integration on top of it for the report.
- **Phase 4:** Frontend UI (squad + report), deploy to Vercel, end-to-end
  test with a real manager ID.
- **Phase 5:** Chat panel — `/api/chat`, `lib/chat-prompt.ts`, shared
  `lib/persona.ts`, client-side conversation history.
- **Phase 6 (later):** polish — caching tuning, watchlist for price
  alerts beyond just owned players, saved manager ID (localStorage).