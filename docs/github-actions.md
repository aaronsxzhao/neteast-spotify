# GitHub Actions daily sync

The `Daily Spotify Sync` workflow runs on GitHub's Ubuntu runners at approximately 07:00 Beijing time. Recovery runs at 08:00, 09:00 and 10:00 skip automatically if today's sync succeeded. The cron uses UTC: 23:00 on the preceding UTC date, then 00:00, 01:00 and 02:00. The sync date is still calculated in the configured timezone, not the UTC date. GitHub may delay or drop schedules; this is not an exact-time guarantee.

Additional checks run at minutes 05, 20, 35 and 50 of every hour. After 07:00 in the configured timezone (Beijing by default), they catch up any day that has not synced successfully, including missed morning schedules and ordinary failed attempts. They skip an already successful day and do not start a new day's sync before 07:00. They also read the encrypted cooldown deadline and never contact either music provider while it is active. After expiry, a pending recovery can run even before 07:00 or after an earlier same-day success; success clears the cooldown. If another long rate limit occurs, the new deadline is saved. Other failures remain eligible for the next check. Manual force cannot override an active provider cooldown. Waiting/skipped checks finish successfully with a clear reason; only a `Synced ...` summary means the playlist was updated. GitHub can delay or drop these checks too; a 15-minute schedule is not an exact recovery-time guarantee.

## Request safety and resumable sync

### Matching and limited retrieval

- Artist display names with cross-script parentheses (such as `歌手 (Artist Name)`) are compared as explicit bilingual names; CJK spacing is normalized. Reviewed artist identities can immediately verify an already-retrieved candidate. Additional manual-alias queries and translated manual titles remain fallbacks, not permission to accept another singer's cover.
- Splitting comma/ampersand credits is a search aid, not proof of artist identity. `Cold Diamond & Mink` cannot identify solo artist `mink`. A combined credit can match a structured multi-artist roster only if every component independently agrees on both sides; a shared guest alone is insufficient. Bilingual display names remain supported.
- Translation fields are still used, but TV/movie theme-song notes and distribution notes such as `iTunes Store限定パッケージ` are excluded from title searches. The original title is never removed by this filter.
- If ordinary track searches fail, the matcher can search up to two album-name variants, select at most two strongly matching albums, and read at most two pages of 50 tracks per album. This avoids relying exclusively on the first ten search results. `Vol.1`/`Vol.I` are comparable, but conflicting volume numbers are not. Album membership and similar duration alone never prove a track's title or artist.
- Every song has a shared maximum of 18 logical catalog lookups, including up to one known-ID verification when a reviewed pointer exists. Initial stage ceilings are metadata 3, title-only 2, free-text 2, album-filtered track search 1, album traversal 3, manual aliases 4, and second pass 3; the shared ceiling always takes precedence. After these stages, unused slots may fund unexecuted queries, prioritizing artist/album-guided fallbacks. There is no additional recovery budget. Counts conservatively include cached lookups, but exclude token refreshes, playlist writes and automatic transient HTTP retries; the separate 300-request safety budget still counts actual requests.
- Original and bilingual standalone titles are prioritized before punctuation variants; title/artist combinations are interleaved rather than exhausting one title's variants first. Two consecutive responses with no new or changed candidates end that stage and move to the next strategy, not declare the song unavailable.
- Cross-stage deduplication uses only actually executed queries, not the full planned query list. Queries skipped by earlier limits remain eligible in a later strategy. Reviewed artist spellings and genuine manual title translations get priority in the fallback stage. Clearly delimited game/movie theme annotations can generate short retrieval titles (e.g. `月の明り`); this does not weaken full-title scoring. Album subtitle shortening supplies an additional bounded search hint, without relaxing album identity checks.
- Reviewed public pointers currently cover [恋人たちの地平線](https://open.spotify.com/track/5qhVC29ZJ5uiAyKp6bYDJM) and [風の大陸](https://open.spotify.com/track/3moDJDcuCTlCVpxWmu2aWR). They are source-ID/title/artist scoped, not blind playlist mappings. A fresh account-authenticated lookup must explicitly report playable, then normal title/artist/duration checks still apply. Missing or restricted recordings continue through bounded reissue/search fallback. Unknown availability is distinguished from explicit unplayability in diagnostics; a subsequent search lacking availability cannot erase that ID's rejection. Only HTTP 404 is treated as a missing pointer; authentication, 429 and other failures propagate normally.
- Album lookup shares the same Spotify authorization, serialized pacing, request budget and persisted 429 deadline. It consumes at most three of the song's 18 lookups, returning any tracks collected before that limit. Successful pages are cached in the encrypted current-song checkpoint, including when the next page fails; a run-local cache avoids duplicate album reads and is cleared at the next sync.
- Matched and unmatched reports retain catalog totals, per-stage counts, the budget and stage-stop reasons. Bounded actual-query traces stay in encrypted state, not public logs. Limited coverage is recorded as `queryLimitsApplied`; unresolved limited searches are marked `reviewRequired`, with `reviewReasons` distinguishing limited retrieval, known-recording availability and unresolved artist identity. `albumTraversalChecked` records whether the album path was attempted. Neither `no-results` nor a limited search proves unavailability: deeper catalog entries may still be missed. Same-song/same-artist alternate versions remain eligible; a singer and their band are not treated as universal aliases.
- Regression fixtures distinguish offline candidate-selection tests from live account-region validation. Finding a public Spotify page does not establish availability for the connected account. No periodic unlimited re-search of misses is enabled by these changes.

API references: [Spotify search](https://developer.spotify.com/documentation/web-api/reference/search), [track lookup and account-market behavior](https://developer.spotify.com/documentation/web-api/reference/get-track), [album tracks](https://developer.spotify.com/documentation/web-api/reference/get-an-albums-tracks).

### Pacing and recovery

- Spotify requests are serialized, at least 6 seconds apart, with at most 5 requests per rolling 30 seconds. A short pacing wait continues inside the run; the old 60/hour hard pause is retired. A 300-request per-run safety ceiling saves progress and pauses for 15 minutes. Authorization, search, and playlist writes all count. Reservations are encrypted before sending and survive runner restarts. These application limits are not Spotify's published quota or a guarantee against 429; see [Spotify rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits).
- On upgrade, only the legacy `request-budget` local deadline is retired. Real Spotify cooldowns, network backoff, request reservations and matching checkpoints remain intact. An expected safety pause exits cleanly with an explicit pending summary, not a misleading generic error; only a completed playlist update records a successful sync date. Recovery checks every 15 minutes resume eligible pending work.
- Every 429 (including short waits and token-endpoint responses) persists `Retry-After` and stops immediately. No in-process 429 retry. Seconds and HTTP-date headers are supported; an absent/invalid header defaults to 60 seconds. The next scheduled check still observes the full saved deadline.
- Read-only GET/HEAD requests retry a 5xx or network failure at most twice within the same run, with 2s/8s base waits (also subject to normal pacing). The deadline is persisted before waiting. A server-supplied wait above 60s stops instead; no Retry-After is shortened. Persistent failures then use the existing 15-minute exponential backoff, capped at 4 hours. Token authorization and playlist writes are not automatically replayed because their outcome may be ambiguous. A 429 always stops immediately, including after a failed read retry. Force cannot bypass saved pauses or budgets.
- A unique strict match with title similarity at least 0.98, verified same primary artist and duration within 2.5s permits an early stop after checking the full retrieved result pool; a compilation album name need not match. This early stop excludes inferred cross-language artist matches. After artist-filtered and title-only retrieval, a verified same-song/same-primary-artist alternate can also finish early, but the existing pool is first re-scored with reviewed identities to prefer a closer recording. Uncertain results proceed through the bounded remaining stages; existing query caches and checkpoints are retained.
- Completed songs and the current song's successful query results (including empty results) are saved encrypted. A later runner resumes them; a changed source list, date, destination, or repair selection invalidates the checkpoint. The query cache is cleared after each completed song and all progress is cleared after successful playlist publication. Fresh days are never served yesterday's recommendations.
- Budget exhaustion pauses without publishing an incomplete playlist. Large recommendation sets can take multiple runs. Playlist write retries reuse completed matches; replacement uses idempotent PUT for the normal daily playlist (up to 100 tracks).
- Public logs show request/cache-hit counts, a coarse operation category, last HTTP status, and completed-song count. Each completed match attempt also logs its logical track/album/total query counts, query budget, matched/unmatched result and whether coverage was limited. Detailed per-stage breakdowns remain encrypted. Secrets, search text, full provider responses, and private track metadata remain out of public logs. Do not repeatedly rerun a paused workflow.

## One-time setup

1. Connect both accounts in the local dashboard and sync once to create the target playlist.
2. Run `node scripts/export-cloud-secrets.js`. It writes two owner-only files inside the ignored `.data/` folder without printing their contents. The existing encryption key is reused, not regenerated.
3. In your repository, open Settings → Secrets and variables → Actions. Create these **repository secrets**, copying each corresponding file's contents:
   - `DAILY_RELAY_CONFIG`: Spotify Client ID, refresh token, NetEase cookie, existing playlist ID and settings, as JSON.
   - `DAILY_RELAY_STATE_KEY`: 32 random bytes encoded as 64 hex characters.
4. Push the workflow and source to the default branch. The workflow requests `contents: write` for its encrypted state branch; repository or organization rules must permit that.
5. Open Actions → Daily Spotify Sync → Run workflow. Select the default branch. Enable `force` only to repeat an already successful day. Check for a green run and the matched-track count.
6. After the first successful cloud run, turn off **Update automatically every day** in the local dashboard and save setup. Use GitHub's Run workflow button for subsequent manual runs so local/cloud writers do not race or reuse an old refresh token.

The existing Spotify playlist ID is mandatory. Cloud runs never create replacement playlists when the configured target is missing, and never clear the playlist when zero confident matches are found. Existing custom cover artwork is retained because only tracks and playlist details are changed.

## State, privacy, and credentials

`daily-relay-state` is a dedicated branch containing AES-256-GCM encrypted `state.enc`. It records the latest refresh token, playlist reference, last successful date, and the latest successful per-track report (including up to five candidate summaries per unmatched track). This report enables private review of omissions and wrong matches. The encryption key stays in GitHub Secrets. Token rotation is saved immediately, including before a later sync failure. This avoids relying on temporary runners or expiring caches. The branch is initialized from the workflow commit; its code snapshot is not used to execute future runs.

State is saved before external sync operations to check write permission, and after meaningful changes. Concurrent cloud runs are serialized. A wrong encryption key aborts rather than discarding state and falling back to a potentially expired seed token. Keep a backup of the key in a secure location. Access tokens, NetEase cookies, raw provider errors, and plaintext track reports are never uploaded as artifacts or committed. Public logs contain only aggregate counts and sanitized failures; per-track results exist only in encrypted state. GitHub Actions can access the stored secrets; repository collaborators with workflow-editing access must be trusted.

If an account authorization expires, reconnect in the local app, rerun the export, and update `DAILY_RELAY_CONFIG`. Its changed configuration causes the new seed credentials to replace the old encrypted credentials. Keep `DAILY_RELAY_STATE_KEY` unchanged. Local playlist/schedule settings are not automatically copied to GitHub after setup.

## Limits and troubleshooting

- Spotify currently requires user reauthorization after six months for Developer Dashboard apps; renewing access tokens does not extend that lifetime. NetEase sessions can also expire or be rejected by remote IP checks. Those require a fresh login, not repeated automated attempts.
- GitHub schedules may run late. Public repositories without activity for 60 days can have schedules disabled; inspect the Actions page if runs stop. Encrypted state updates are repository activity, but should not be treated as an uptime guarantee.
- Workflow failures appear in Actions; notification delivery follows your GitHub Actions notification preferences.
- No matching tracks: check catalog availability and account region. The existing playlist is kept.
- State-storage HTTP 403: check workflow permissions and rules protecting `daily-relay-state`.
- NetEase may not accept a GitHub-hosted runner's region/IP. If first-run testing shows that, use a trusted self-hosted runner or server in a supported region; do not assume the local success proves cloud connectivity.
- To pause cloud syncing, disable this workflow on the Actions page. To change the times, edit its UTC cron expression.

References: [GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [workflow token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token), [Spotify refresh tokens](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens).

## 排查“没有按时同步”

现有工作流输出 `DAILY_RELAY_AUDIT` 结构化日志，不引入外部调度器，也不新增音乐接口请求。每条带 UTC 时间，任务入口另带北京时间、实际触发方式、命中的完整 cron、运行 ID 和代码版本。

| 证据 | 含义 |
| --- | --- |
| 对应时段没有 Actions run | 当前没有可见的运行记录；应用日志无法证明 GitHub 内部是否丢弃或延迟了触发 |
| 有 run，但 queued / pending 或 job skipped | 已创建运行，但尚未启动执行，或 job 条件不满足；查 Actions 状态和时间 |
| `workflow-start`，没有 `app-start` | runner 已启动，但同步程序没进入；`workflow-end.steps` 标明 checkout、安装、测试是否失败或跳过 |
| `app-start`、`policy-decision` 为 skipped | 已启动并明确跳过：`already-synced`（当天完成）、`before-daily-window`（未到窗口）、`provider-cooldown`（Spotify 冷却）或本地安全暂停 |
| `app-stage` 后 `app-end` 为 failed | 程序已启动并失败；phase 标出状态读取、网易云获取、匹配、进度保存、歌单写入等阶段；status 仅输出数值状态码 |
| `app-result` / `app-end` 为 paused | 本次未完成，保存进度等待后续检查；不是同步成功 |
| `app-result` / `app-end` 为 success | 已完成歌单写入并保存成功状态，附歌曲数量 |

`request-metrics` 显示请求、缓存和重试计数。日志不输出 Cookie、令牌、完整状态或供应商错误正文。绿色 Actions 只表示步骤正常退出，**不等于已同步**，须看 app-result。取消、超时或 runner 被强制终止可能来不及写结束日志；这时结合 Actions conclusion 和最后一个阶段判断，不能把缺少结束日志当成“从未启动”。完整 cron 只能说明触发规则，不代表 GitHub 提供了该事件原本计划执行的精确时刻。历史运行不能补写这些新日志。
