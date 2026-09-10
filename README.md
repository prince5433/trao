# AI Interview Prep Kit (Trao Prep)

Turn a job description + company website into a personalised interview preparation kit: company brief, role requirements, categorised questions, flashcards, coverage-checked gaps, and a deterministic N-day schedule. Edit anything, regenerate sections without losing manual work, and practise flashcards with confidence tracking.

## Features

- Secure register / login / logout (session cookies)
- Kit creation from pasted JD + company URL (+ batch JSON upload)
- Genuine multi-step research & generation pipeline (not one giant prompt)
- Intelligent site crawl + link ranking (not a hard-coded `/careers` list)
- Public interview discussion search (honest when nothing is found)
- Must vs nice requirement extraction from JD phrasing
- Per-category question generation + flashcards
- Deterministic coverage loop with gap fill
- Deterministic schedule allocation for exactly N days
- Builder: edit / reorder / add / delete / regenerate with edit preservation
- Practice mode with confidence-weighted ordering
- **Creative feature:** Interview Weak Spots report
- Mandatory batch entry point: `npm run evaluate -- --input … --output …`

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14 + Tailwind CSS + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Database | MongoDB + Mongoose |
| Validation | Zod |
| Scraping | `fetch` + Cheerio + robots.txt |
| LLM | Env-configurable OpenAI-compatible client (default **Groq** `llama-3.1-8b-instant`) |

### Why these technologies

- Matches the assessment preferred stack.
- TypeScript shared `@prep/core` package keeps the **web app and batch CLI on the same pipeline**.
- Groq free tier is fast enough for sequential generation with retries/backoff under TPM limits.
- Cheerio avoids heavy browser automation while still ranking and following relative links.

## Architecture

```
apps/web          Next.js UI
apps/server       Express API + evaluate CLI
packages/core     Shared pipeline: crawl, extract, generate, coverage, schedule, validate
```

Web and CLI both call `runPipeline()` from `@prep/core`. There is no separate batch implementation.

## Data flow

1. User (or CLI) submits JD + company URL + days  
2. Validate URL / SSRF policy  
3. robots.txt → homepage → discover & rank links → fetch top pages  
4. Optional public interview search  
5. LLM company brief (grounded in crawled text)  
6. LLM + heuristic JD requirement extraction (`r1…`) with must/nice  
7. Separate LLM calls per question category  
8. Flashcards  
9. Deterministic coverage → gap questions → re-check (max 3 passes)  
10. Deterministic schedule for exactly N days  
11. Sanitize invalid `requirement_ids` on questions/flashcards  
12. Zod validate Appendix A → persist / write JSON  

## Research strategy

- Start at the provided company URL (including **localhost** when `ALLOW_LOCALHOST_FETCH=true` for evaluation fixtures).
- Parse anchors, resolve relative URLs, normalize, dedupe.
- Rank by keyword signals: careers, jobs, hiring, interview, engineering, handbook, about, culture, recruiting, teams, etc.
- Fetch a bounded number of top pages with rate limiting, retries, size/content-type limits.
- Skip failed pages; missing hiring/about pages are warnings, not kit failures.
- Respect robots.txt.

Sources used: company site pages discovered by crawl; DuckDuckGo HTML results for public interview discussion (when reachable).

## LLM provider / model

Configured via environment:

- `LLM_PROVIDER` (default `groq`)
- `LLM_API_KEY`
- `LLM_MODEL` (default `llama-3.1-8b-instant`)
- optional `LLM_BASE_URL` for any OpenAI-compatible endpoint

Untrusted JD/crawl text is wrapped in `<untrusted_data>` and never placed in the system role as instructions. Model JSON is schema-validated with repair/retry.

## Why scheduling & coverage are application code

Allocating topics across N days and deciding which requirements lack questions is arithmetic/set logic. Handing it to an LLM would be non-deterministic and unverifiable. The model only generates content; the app decides coverage and schedule.

## Coverage algorithm

```
covered = ∪ question.requirement_ids ∩ known requirement ids
uncovered_must = must requirements with no covering question
```

Gap generation targets uncovered must-haves only, then coverage runs again.

### Second-pass strategy

`COVERAGE_MAX_PASSES` defaults to **3** (initial generation counts as pass 1, then up to 2 gap fills). We stop early when uncovered must-haves are empty. Remaining gaps (if any after max passes) are recorded honestly in `coverage.uncovered_requirement_ids`.

## Generated / edited / pinned state

Each item id (`q*`, `f*`, `company_brief`) has metadata:

| origin | meaning |
|--------|---------|
| `generated` | Pipeline output; may be replaced on regen |
| `edited` | User changed content; **survives** category regen |
| `manual` | User-added; treated as pinned |

`pinned: true` also survives regeneration.

Regenerating technical questions keeps edited/pinned technical items, replaces other technical generated items, and leaves other categories untouched. Schedule regen never rewrites question text. Brief regen does not touch role/questions/flashcards.

## Practice mode

Flashcards are ordered by ascending confidence (null/unseen first), then uncovered. Confidence scale: 1 low, 2 medium, 3 high. State persists on the kit document.

## Creative feature: Weak Spots

Uses practice confidence to surface weakest requirements, categories, low-confidence cards, and recommended focus areas — a practical next-study guide for candidates.

## Retry / backoff

- HTTP fetch: retries with exponential backoff  
- LLM: retries on 429/5xx with backoff / Retry-After  
- Crawl: rate delay between pages; failed sources skipped  

## Security / SSRF

- Only `http:` / `https:`  
- Production blocks private/loopback/link-local after DNS lookup  
- `ALLOW_LOCALHOST_FETCH=true` for local batch fixtures  
- Response size, timeout, redirect hop limits  
- Secrets only in server env — never `NEXT_PUBLIC_*` for keys  

## Environment variables

See [`.env.example`](.env.example). Copy to `.env` and set `LLM_API_KEY` and `MONGODB_URI`.

## Local setup

```bash
cp .env.example .env
# edit .env — set MONGODB_URI, SESSION_SECRET, LLM_API_KEY

npm install
npm run dev
```

- Web: http://localhost:3000  
- API: http://localhost:4000  

Requires a running MongoDB (local or Atlas).

## Tests

```bash
npm run test:unit          # schedule, coverage, validator, regen merge
npm run test -w @prep/server
npm run typecheck
```

## Batch evaluator (mandatory)

```bash
npm run evaluate -- --input fixtures/sample-cases.json --output kits-output.json
```

- Root script builds `@prep/core` first so a clean clone works without a prior `npm run build`  
- Same `runPipeline` as the web app  
- Continues after individual failures  
- Appendix B output shape (`version`, `generated_at`, `kits[]` with `status` ok|failed)  
- Partial research → `ok`; only unproducible kits → `failed`  
- Localhost company URLs supported when `ALLOW_LOCALHOST_FETCH=true`  

Target: five cases within fifteen minutes with serial LLM calls and backoff.

## Production setup / deployment

1. Create MongoDB Atlas free cluster; set `MONGODB_URI`.  
2. Deploy API (Render blueprint [`render.yaml`](render.yaml) or Railway): set `SESSION_SECRET`, `CLIENT_ORIGIN`, `LLM_*`, `ALLOW_LOCALHOST_FETCH=false`.  
3. Deploy `apps/web` to Vercel; set `NEXT_PUBLIC_API_URL` to the public API URL.  
4. Ensure API CORS `CLIENT_ORIGIN` matches the Vercel domain; cookies use `sameSite=none; secure` in production.

## Design decisions & trade-offs

- **Shared core package** over duplicating CLI logic — correctness for automated scoring.  
- **Serial category LLM calls** over parallelism — survives free-tier TPM limits.  
- **Heuristic fallbacks** when the model fails JSON — thin/honest kits instead of hard failure when possible.  
- **Polling for progress** in the browser (SSE available server-side) for reliable cross-origin cookies.  

## Known limitations

- DuckDuckGo HTML search may be rate-limited or empty; kits remain valid with an honest warning.  
- Free-tier LLM quality varies; structured validation + fallbacks keep kits schema-valid.  
- Crawl depth is intentionally bounded (`CRAWL_MAX_PAGES`) for latency.  
- Public deployment requires your own free-tier keys and Atlas URI (not committed).  

## Assessment checklist (implementation map)

| Requirement | Location |
|-------------|----------|
| Appendix A kit structure | `packages/core/src/kit/schema.ts` |
| Coverage + second pass | `packages/core/src/coverage`, `pipeline/run.ts` |
| Schedule | `packages/core/src/schedule/allocate.ts` |
| Crawl + ranking | `packages/core/src/research/crawl.ts` |
| Evaluate CLI | `apps/server/src/cli/evaluate.ts` + root `npm run evaluate` |
| Auth + ownership | `apps/server/src/auth.ts`, kit routes |
| Builder + regen | `apps/web/.../kits/[id]`, `packages/core/src/regen` |
| Practice + weak spots | practice routes + UI tabs |
| Tests | `*.test.ts` under core and server |
