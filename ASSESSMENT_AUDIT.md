# Assessment requirement audit (FS-AI-INTERVIEW-01)

Generated during final validation. Status reflects the repository implementation.

| Requirement | Implementation | Tests | Status |
|---|---|---|---|
| Auth register/login/logout + sessions | `apps/server/src/auth.ts` | ownership integration | Pass |
| Ownership isolation | kit routes scoped by `userId` | IDOR 404 in live flow | Pass |
| JD + company URL + days input | create UI + `POST /api/kits` | live flow | Pass |
| Batch upload of pairs | create UI batch mode + `POST /api/kits/batch` | schema validation | Pass |
| Crawl + link ranking (not fixed paths only) | `packages/core/src/research/crawl.ts` | pipeline integration | Pass |
| robots.txt / rate limit / retries | crawl + `safeFetch`/`withRetry` | unit/integration | Pass |
| Public interview research (honest empty) | `interviewSearch.ts` | warnings in pipeline | Pass |
| Requirement extraction must/nice | `extract/requirements.ts` | heuristic + pipeline tests | Pass |
| Sequenced generation (not one prompt) | `pipeline/run.ts` | progress steps asserted | Pass |
| Per-category questions | `generate/content.ts` | pipeline categories | Pass |
| Deterministic coverage loop | `coverage/check.ts` + pipeline | unit + integration | Pass |
| Deterministic schedule exact N days | `schedule/allocate.ts` | 1-day/60-day unit tests | Pass |
| Appendix A exact fields | `kit/schema.ts` | validator tests | Pass |
| Builder edit/reorder/add/delete | kit page UI | live edit flow | Pass |
| Regen preserves edited/manual | `regen/merge.ts` + itemMeta | unit + live regen | Pass |
| Practice + confidence ordering | practice routes + UI | live practice flow | Pass |
| Weak spots creative feature | `weakSpots.ts` + UI tab | live weak-spots | Pass |
| `npm run evaluate -- --input --output` | root script + CLI | CLI tests + sample/edge runs | Pass |
| Partial research = ok; unreachable = failed | pipeline empty-pages fail | edge evaluate run | Pass |
| SSRF / localhost policy | `safeFetch.ts` + env flag | localhost crawl test | Pass |
| Prompt injection delimiting | LLM prompts wrap untrusted data | code review | Pass |
| README + .env.example + deploy config | README, render.yaml, Dockerfile, vercel.json | present | Pass |
| Automated tests for schedule/coverage/validator | core `*.test.ts` | 26 core + 6 server | Pass |

## Validation commands run

- `npm test` — pass
- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run build` — pass
- `npm run evaluate -- --input fixtures/sample-cases.json --output kits-output.json` — ok/ok
- `npm run evaluate -- --input fixtures/edge-cases.json --output kits-edge-output.json` — failed(COMPANY_UNREACHABLE)/ok(thin)
- Live API flow: register → create → generate → edit → regen preserve → practice → weak spots → IDOR blocked — pass
