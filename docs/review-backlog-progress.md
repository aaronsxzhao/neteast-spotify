# November 15 backlog repair — in progress

User authorization: repair connection failures, review all accumulated misses, implement general matcher improvements with regression tests, commit/push after validation, update the daily schedule. Do not rerun sync or alter title/cover.

## Current state

- Base remote/main: `f8548a3e25700df63852667ec508d5192bc9f2d5`. All current work is uncommitted, not pushed.
- `docs/review-backlog.json`: 41 songs = 39 unresolved November 5–15 source IDs plus two offline-only recoveries awaiting account playback verification. Latest candidates for 59 historical sources were replayed; 別れ1940 was added from the November 5 unresolved test.
- Private bounded plan `.data/catalog-review/backlog-plan.json`: 42 catalog reads plus account/playlist checks. Uses only known catalog IDs or explicit searches; no playlist mutation.
- Latest successful actual import is November 15 **22/31**, with three alternate versions. No new imports in this task.

## Connection investigation

Unauthenticated accounts.spotify.com HTTP returned 200 through curl and Node fetch. DNS resolves both families. IPv4 TCP and TLS handshakes to accounts.spotify.com and api.spotify.com succeed; IPv6 gives EHOSTUNREACH. System HTTP proxy is not configured; no curlrc; Node v24.19.0, auto-select-family true, attempt timeout250ms. This does not prove IPv6 is the root cause of authenticated API failure.

A paced `/me` attempt through the old request guard failed before account verification. The old catch block discarded the underlying exception, so the historic root cause cannot be recovered from that error. Existing local transient-backoff is now until **2026-11-15 22:30:38 Beijing** (`1794753038864`). Do not clear it or bypass it. Local/cloud refresh credentials agreed before the attempt. Cloud state should be refreshed and cooldowns rechecked before continuing.

New transport buffers the response body under a 30-second deadline; diagnostics preserve only an allowlisted network code, operation and timestamp. Retry count, interval, provider cooldown and request caps remain intact. Successful responses reset accumulated historical transient failure count; otherwise old independent failures caused exponentially larger backoffs indefinitely. No claim yet that the real connection failure is fixed: verify with the updated transport after the deadline and inspect `spotify.lastNetworkError` on failure.

## General changes prepared

1. Exclude concept-collection promotional notes in alias fields from title searches while retaining actual song names and real translations.
2. Treat Japanese/English/Korean/etc. `Mix` as a language edition alongside `Version`; normalize equivalent language labels but reject different-language/unlabelled recordings. No stripping arbitrary remix names.
3. Album traversal is breadth-first across the two eligible editions. With three total calls, album search + first page of both editions can find a target previously starved by a long first compilation. Strict matching/market checks are unchanged.
4. Read-only resumable catalog review runner saves per-job results and blocking state. Account and owner are verified on every run. It does not mark a song resolved just because a request returned.
5. Installer dependency allowlist includes the credential-free review module required by its tests.

## Continue

After checking fresh local/cloud deadlines, run:

```sh
node scripts/review-catalog.js .data/catalog-review/backlog-plan.json .data/catalog-review/backlog-progress.json
```

Then review all returned candidates against their saved source and official evidence; use explicit bounded follow-ups for unresolved album pages/identities. Update every queue row with checked scope and conclusion. Availability and recording identity are separate facts. Do not add unverified aliases to inflate recovery. Full regression must include all historical confirmed fixture pairs and request-cost checks. Only then stage relevant changes, commit/push normally and verify remote SHA. Current full suite: 394 tests passing, including replay of all 170 historical confirmed fixture pairs; rerun after subsequent edits.

Daily `netease-daily` schedule updated through the app, still 18:30 Beijing. A one-time continuation heartbeat `netease` is scheduled for 22:35 Beijing, November 15, to resume this task after backoff; delete it after the continuation, not the main daily task.

## 22:35 continuation result

Fresh local/cloud refs were checked; backoff had expired and cloud had no pause. Credentials agreed. Updated read-only runner attempted `/me`: **4 HTTP reservations, 2 read retries, 0 completed catalog jobs**. Safe diagnostic is **ETIMEDOUT**, nested unauthenticated Node test additionally reports EHOSTUNREACH. New local deadline: **22:51:24 Beijing** (`1794754284852`). All 41 queue entries preserve this block and their next action; none is claimed verified.

Credential-free curl IPv4 reached Spotify API HTTP response headers (`via: HTTP/2 edgeproxy, 1.1 google`), while Node fetch to the same API domain timed out. Earlier Node accounts-domain response and IPv4 TLS handshakes succeeded. This narrows investigation to the Node/API HTTP transport path but does not establish its exact routing/proxy cause. IPv6 failure alone is not proven causal. Do not clear backoff or replay authenticated requests through another transport during the pause. Connection recovery is **not validated**.

An additional preflight guard now checks request safety before token refresh, preventing an expired-token POST from preceding a paused read. Final full suite: **395 tests pass**, including all **170** historical confirmed fixture pairs. General changes contain no new single-song aliases or IDs. Breadth-first album regression shows three calls can reach a second matching edition, instead of spending all three on the first edition. Live recovered backlog count is **0** because account verification failed; actual import remains **22/31**. Reliable tested general changes are being committed as a partial delivery; complete backlog verification remains outstanding and must be resumed by the daily review.

This one-time continuation has been consumed; delete `netease`. Keep main `netease-daily` active, with its existing backlog-first instructions. Do not mark the backlog review complete or repeat a blind connection attempt without inspecting diagnostics and respecting the deadline.

## November 16 connection repair verified

Controlled comparison against the same API host: curl IPv4 and Node `https` with `family:4` return HTTP401 without credentials; Node `fetch` fails with ETIMEDOUT/EHOSTUNREACH. The default Spotify transport now uses native HTTPS over IPv4. It performs exactly one attempt, carries cancellation and a 30-second whole-response deadline, preserves status and Retry-After, bounds the response size, and does not follow redirects. RequestSafety continues to own pacing, retries and cooldowns. This fixes the observed fetch connection path; the underlying network's exact IPv6/route interaction is not asserted.

After fresh cloud/local deadline and credential checks, the replacement transport successfully refreshed the token, verified AaronZ and the playlist owner: **3 requests, zero retries, final HTTP200**. Full suite: **398 passing**, including historical confirmed replay. The 42-operation backlog plan is now running through the verified transport; the connection is validated but the full backlog is not yet declared complete. No sync was triggered or playlist changed.

The November 16 live backlog batch has now finished **42/42 planned catalog jobs for 41/41 sources**, 44 HTTP requests including identity and owner checks, zero retries, no 429. All per-source evidence and remaining uncertainty are saved in `review-backlog.json` and `catalog-review-2026-11-16-connection.md`. The connection repair is validated across the entire batch. Some songs still require further identity/availability or structural work; request-plan completion does not close those entries. No new imports. Final local suite: **399 tests passing**.
