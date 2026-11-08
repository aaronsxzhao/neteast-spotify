# November 8 complete missing-track review

Actual imported result: **27/32 (84.375%)**, including one alternate version. Completed at **07:52:31 Beijing**. [Run 42426162560](https://github.com/aaronsxzhao/neteast-spotify/actions/runs/42426162560) recorded 137 requests, zero retries. Public playlist independently showed **AaronZ / NetEase Daily / 27 tracks** at `4BI0KArIAsnQGHZRY8DSIE`. Later successful workflow checks are not additional imports.

All five misses were reviewed before changes. Local/cloud credentials agreed and neither had an active saved cooldown. `/me` verified AaronZ (`fnota8o1ant1zer1670tsgx0w`). Review used 12 HTTP requests: five direct track reads, four searches, two identity checks and one token refresh. Eight-second minimum spacing, zero retries, no 429. No playlist writes or sync dispatch.

| Source | Complete review finding | Outcome |
| --- | --- | --- |
| Deeper and Deeper — CAGNET, Anna McMurphy | Saved pointer `5ElzKkLs6ZQ1Sp2YEkzHm9` has the right identity/duration; fresh AaronZ read explicitly returns market restriction. Public original soundtrack exposes another recording `3e6Z2h3LsACpW7vqKawOVn`, credited Cagnet / アンナ・マクマーフィ; it also returns market restriction. Filtered Cagnet/title search returned no playable result. | Both checked releases unavailable in this account market; no scoring relaxation or claim that every release is unavailable. |
| PLANET — ラムジ | Saved pointer `5Zy4OB1HiZA1FSpoOKKfPo` has exact title, album and 243400 ms. Fresh read returns market restriction. Reviewed saved alternate candidates, public title/artist queries and authenticated title/Labmsey search (empty). Others are covers/different artists. | Known release unavailable; no verified playable alternative. Not a global catalog-absence claim. |
| 我会好好的 — 伍佰 & China Blue | `7tC6ami9OxhNYP6ykcKAct`, Wu Bai, 我會好好的 (I’ll Be Fine), 詩情搖滾, exact 285053 ms, freshly verified playable. Avex identifies the source album as Wu Bai's own performances of songs written for other singers. Cyndi Wang's same-title recording must not substitute. | Recording-scoped roster mapping requires exact source ID/title/credit, tight album/title/duration and exactly Wu Bai on target. No global band-to-member alias. Direct pointer avoids repeated searches. |
| 人质 — 张惠妹 | Three saved A-Mei Chang releases share title and 232853 ms, 3680 ms longer than source compilation. Warner confirms Zhang Hui-mei's original song. `2yGDozozwXW9y6Pmgilkfo` freshly verified playable. | Verified artist alias and source-scoped pointer. Single fetched candidate passes existing strict tolerance; full saved set uses existing flagged competing-version fallback. Other singers remain rejected. |
| 雨上がり — ari | Checked saved Japanese/Chinese titles and candidates, Apple original album listing, CDJournal artist/release history, public Japanese/romanized catalog searches and two authenticated searches (雨上がり ari / Ameagari ari). Returned Kitri, Niningashi, MIZUKAMI, arie and unrelated songs. No evidence links ari to those artists. | Spotify candidate remains unconfirmed. Close duration of Jeff Chang's 雨後 does not establish identity. No arbitrary alias or claim that Spotify lacks the recording. |

## Evidence

- [Cagnet source release](https://open.spotify.com/track/5ElzKkLs6ZQ1Sp2YEkzHm9), [original soundtrack alternative](https://open.spotify.com/track/3e6Z2h3LsACpW7vqKawOVn), [label catalog](https://www.hyperdisc.com/english/hyperdisc/catalog.html). Public pages do not prove account playability.
- [PLANET known release](https://open.spotify.com/track/5Zy4OB1HiZA1FSpoOKKfPo).
- [Avex artist/album information](https://www.avex.com.tw/artist/artist.asp?ArtistCode=WUBAIT), [source tracklist](https://www.wubaicn.com/albums/), [Wu Bai candidate](https://open.spotify.com/track/7tC6ami9OxhNYP6ykcKAct).
- [Warner official original album and 人質 tracklist](https://www.warnermusic.com.tw/products/chang-hui-mei-i-want-happinesscddvd5), [A-Mei Chang candidate](https://open.spotify.com/track/2yGDozozwXW9y6Pmgilkfo).
- [ari original album listing](https://music.apple.com/jp/album/%E9%9B%A8%E4%B8%8A%E3%81%8C%E3%82%8A/419281896), [CDJournal identification/history](https://www.cdjournal.com/research/-/1679).

## Validation and limits

Fixtures include all five saved candidate sets, fresh direct metadata including all three blocked releases, ari's supplemental search candidates, and all 27 imported IDs. Tests reject unrelated singers, instruments, unavailable tracks, unreviewed band mappings, wrong album/duration and added guests. Both repaired direct-pointer paths need one catalog query and no search. Full suite: 329 passing tests; all 27 imported IDs survive replay.

Two songs recover offline: **29/32 (90.625%) potential**, versus **27/32 actual imported**. Two songs have checked market-restricted releases; one remains unresolved. No sync was dispatched. Title, custom cover, schedule, request budgets and pacing are unchanged.
