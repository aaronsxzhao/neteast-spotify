# November 10 complete missing-track review

Actual import: **26/31 (83.87%)**, completed **07:39:12 Beijing**. [Run 42720498683](https://github.com/aaronsxzhao/neteast-spotify/actions/runs/42720498683) used 121 requests, zero retries. Subsequent successful workflow checks are not extra imports. Authenticated playlist metadata independently confirms AaronZ / NetEase Daily / items.total=26, ID `4BI0KArIAsnQGHZRY8DSIE`.

All five misses were reviewed before edits. Local/cloud credentials agreed; no saved cooldown was active. `/me` confirmed AaronZ (`fnota8o1ant1zer1670tsgx0w`). Review used ten API HTTP requests: identity, token refresh, playlist metadata, three direct track reads and four searches. Minimum eight-second spacing; zero retries, no 429. No playlist write or sync dispatch.

| Missing track | Evidence / cause | Outcome |
| --- | --- | --- |
| RAINY WALK — 山下達郎 | Official discography confirms MOONGLOW. Reviewed saved candidates, public title/artist/catalog searches and authenticated exact English-artist plus Japanese free-text searches. Exact search returned empty; free text returned MTA acoustic guitar cover and different songs/artists. | Correct Spotify recording remains unconfirmed. Do not replace with MTA or similarly named recordings; no global absence claim. |
| Lily feat. Rachel — 鈴木真海子, Rachel | Saved `4nCHNiMsnSYT0am8S2ifI1` has exact album and 147750 ms. Label smartlink identifies Mamiko Suzuki / Rachel. Direct AaronZ read confirms playable. Previously only the guest matched, correctly triggering guest-only rejection. | Add verified main-artist alias and complete-roster pointer. Keep shared-guest, solo and changed-guest candidates rejected. |
| 緩りらら — 笠原瑠斗 | TuneCore's Japanese and English versions of the same release identify 緩りらら / Yururirara and 笠原瑠斗 / Ryuto Kasahara. Saved `0EeDQLRSNWsZzNsyKsJ402` has exact 240506 ms and is freshly verified playable. | Verified artist alias, source-scoped romanized title, direct pointer. Full candidate replay selects original over compilation/mixed candidate. |
| Rule (Kimini Muchuu) (Live 2023) — 宇多田ヒカル | Sony official event release lists Rule (君に夢中) - Live 2023, same Metropolis album. Saved `47NaTEPlCpA9owkdsn6ok7` differs by 68 ms; direct read confirms playable. Romanized parenthetical title blocked matching despite known artist. | Source-scoped full title mapping and pointer. Live/version checks remain active; do not globally strip parenthetical subtitles. |
| ミライのテーマ — 山下達郎 | Official single discography confirms original release. Reviewed saved candidates, original/translated/romanized public queries and two authenticated searches. Exact title/artist search empty; romanized search returned orchestral/music-box covers plus 山下達郎's different song キスカ. | Correct Spotify recording remains unconfirmed. Historical Sony radio commentary describes SOFTLY not being streamed at that time, but this is not proof of current global availability. No forced cover substitution. |

## Evidence

- [Yamashita official album discography](https://www.tatsuro.co.jp/discography/), [single discography](https://www.tatsuro.co.jp/discography/single.php).
- [Label Deep green release](https://ultravybe.lnk.to/deepgreen), [Lily candidate](https://open.spotify.com/track/4nCHNiMsnSYT0am8S2ifI1).
- [TuneCore Japanese release](https://linkco.re/AYbyTf6f?lang=ja), [same release in English](https://linkco.re/AYbyTf6f?lang=en), [Yururirara candidate](https://open.spotify.com/track/0EeDQLRSNWsZzNsyKsJ402).
- [Sony official Rule live release](https://www.sonymusic.co.jp/Music/Info/utadahikaru/40iroiro/), [official artist-channel recording](https://www.youtube.com/watch?v=MOw2c2YQp50), [Spotify candidate](https://open.spotify.com/track/47NaTEPlCpA9owkdsn6ok7).
- [Historical Sony radio commentary, not a current catalog guarantee](https://www.110107.com/s/oto/diary/otonano_radio2/list?cd=otonano_radio2&id=8698&ima=0000&oto=ROBO004&page=21).

## Validation and outcome

Fixtures contain all five saved candidate sets, the three fresh direct reads, supplemental candidates for both Yamashita tracks, and all 26 imported tracks. Tests cover incorrect performers, incomplete Lily roster, guest-only identity, unavailable tracks, instrumentals, title-map scope, and Rule's live recording checks. Three direct pointers each finish in one catalog query without search. All 26 previously imported IDs survive replay. **348 tests pass**.

Offline potential: **29/31 (93.55%)**. Actual imported result remains **26/31**. Two tracks remain unconfirmed after this bounded review; no claim that the catalog lacks them or that future algorithm changes cannot recover them. A future sync must recheck availability. No automatic rerun, playlist-title, custom-cover, schedule, pacing or request-budget changes.
