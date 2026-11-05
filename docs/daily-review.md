# Daily review procedure

Review every source track missing from the latest successful report for the Beijing date. First verify the report date, playlist ID and account identity. If no successful report exists, diagnose that run before calling anything a catalog miss.

Complete evidence gathering for the entire missing-track list before editing the matcher. Reuse saved candidates first. For each source, check original and translated titles, credited artists and aliases, official releases, album track lists and acceptable recordings by the same primary artist. A public catalog entry does not establish availability for AaronZ.

Record one conclusion per source, with candidate IDs and supporting evidence where available. Distinguish verified recording identity, verified unavailability, unresolved retrieval and checks deferred by rate limits. Do not infer catalog absence from an empty search, or mark the whole review complete with unexamined tracks remaining.

Use existing request safety for any authenticated check. Verify `/me`, inspect local and cloud cooldown state, set a small explicit request cap, retain pacing and stop on 429. Do not use a browser account of unknown identity. Do not relax identity or language/version checks to improve the reported match rate.

After every miss has a documented conclusion, implement only supported fixes as one review batch. Add positive and negative regressions, replay all previously confirmed songs and run the full suite. Stage only related files, commit and push normally to main, then verify the remote SHA. If there is no matching change justified by evidence, say so; do not manufacture aliases or pointers. Retain useful evidence and regression coverage. Report failures or conflicts without forcing a push.

Report actual imported count separately from candidate recovery or offline test coverage. Include every unresolved song and the checked scope. The review does not trigger a sync or change the playlist title or custom cover. Re-running sync requires a separate instruction.
