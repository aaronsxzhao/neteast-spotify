# Daily review procedure

Review every source track missing from the latest successful report for the Beijing date. First verify the report date, playlist ID and account identity. If no successful report exists, diagnose that run before calling anything a catalog miss.

Complete evidence gathering for the entire missing-track list before editing the matcher. Reuse saved candidates first. For each source, check original and translated titles, credited artists and aliases, official releases, album track lists and acceptable recordings by the same primary artist. A public catalog entry does not establish availability for AaronZ.

Record one conclusion per source, with candidate IDs and supporting evidence where available. Distinguish verified recording identity, verified unavailability, unresolved retrieval and checks deferred by rate limits. Do not infer catalog absence from an empty search, or mark the whole review complete with unexamined tracks remaining.

Use existing request safety for any authenticated check. Verify `/me`, inspect local and cloud cooldown state, set a small explicit request cap, retain pacing and stop on 429. Do not use a browser account of unknown identity. Do not relax identity or language/version checks to improve the reported match rate.

After every miss has a documented conclusion, implement only supported fixes as one review batch. Add positive and negative regressions, replay all previously confirmed songs and run the full suite. Stage only related files, commit and push normally to main, then verify the remote SHA. If there is no matching change justified by evidence, say so; do not manufacture aliases or pointers. Retain useful evidence and regression coverage. Report failures or conflicts without forcing a push.

Report actual imported count separately from candidate recovery or offline test coverage. Include every unresolved song and the checked scope. The review does not trigger a sync or change the playlist title or custom cover. Re-running sync requires a separate instruction.

## Carry unfinished work forward

`docs/review-backlog.json` is the persistent source-ID queue. Merge today's misses into it instead of replacing yesterday's list. Keep source metadata, dates, evidence, recording-identity result, account-market result, blocking deadline and next action. A cached offline match does not close an entry. A public album link is a release lead, not a verified track. Checked unavailable releases do not prove all releases unavailable.

For a bounded read-only batch, prepare a plan with `accountId`, `playlistId` and `jobs` (`track`, `album`, `search`). Run `node scripts/review-catalog.js PLAN.json PROGRESS.json`. Store private operational files under `.data/catalog-review/`. The runner checks `/me` and playlist ownership, uses the normal persistent request guard, caps each run at 50 HTTP requests with eight-second spacing, and atomically saves completed request evidence. It never writes a playlist or dispatches sync. Resume the same plan/progress after a permitted deadline to avoid repeating completed requests. Preserve original `checkedAt` timestamps; cached availability is not fresh availability. An album with more than its embedded first page remains in `albumPagesPending` and requires explicit follow-up. `requestPlanComplete` means only that the planned requests finished; it is never a claim that every source has a correct candidate.

Network failures must retain a controlled error code and endpoint category from `spotify.lastNetworkError`. Distinguish DNS, connect/body timeout, certificate, authentication, HTTP5xx and Spotify429. Never save raw exception messages, headers, tokens or full request URLs. Diagnose connectivity before spending more catalog budget. Do not erase cooldown or backoff. When blocked, retain partial work and explicitly mark the overall review incomplete; resume the pending work rather than starting a new list.

## Measure general repairs

Group verified failures by retrieval, title metadata, artist identity, edition/language, availability or source/target structure. Prefer rules that work across unrelated songs. Add a real motivating case, a second independent/synthetic positive case, and near-miss negatives. Measure request counts with bounded mock retrieval and replay all saved confirmed fixtures. Report general algorithm changes separately from individual artist aliases or catalog pointers. Never claim an offline test or a request-completed flag is an actual import.

Commit and push only after the scoped full regression passes. If verification is interrupted, reliable partial changes can be retained, but do not call the entire review complete. For an explicitly requested full backlog batch, finish that batch or clearly retain its pending status and continuation; do not silently downgrade the task to a daily spot check.
