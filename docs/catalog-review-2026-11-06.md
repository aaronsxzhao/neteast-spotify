# November 6 complete missing-track review

Actual imported coverage is **22/32 (68.75%)**, finished at **07:57 Beijing**. [Run 42130977668](https://github.com/aaronsxzhao/neteast-spotify/actions/runs/42130977668) used 182 requests, zero retries, and one same-artist alternate version. The public embed independently showed AaronZ's NetEase Daily with 22 tracks. Later successful workflow checks are not additional playlist imports.

All ten misses were examined before editing. Saved previews, public release evidence and seven bounded authenticated searches were reviewed. `/me` confirmed AaronZ, and local/cloud credentials agreed with no active stored cooldown. An additional direct lookup checked an alternate release of 空を見上げて. Total review traffic was 10 requests (including token refresh and identity), at least eight seconds apart, zero retries, no 429. No playlist write or sync dispatch occurred.

| Source | Finding | Action |
| --- | --- | --- |
| 再见悲哀 — 林忆莲 | Sandy Lam's `4dtGOHiORFemWpob6iNcSu` has the same title and differs by 1550 ms. Other singers were rejected. | Verified artist alias and bounded direct pointer. |
| 夜の海 — 桑名晴子 | MOONLIGHT ISLAND is the correct source release. Exact filtered search returned zero; romanized search found an MTA guitar cover. Saved 桑名正博 recordings are a different singer. | Unresolved catalog retrieval; no substitution. |
| 夏待 — Himawari, Aosaki | Artist's original upload identifies both creators. Search returned AKASAKI, ROUND TABLE and others, not this recording. | Unresolved catalog retrieval; no substitution. |
| 真夏のSequence — 菊池桃子 | `50yyhKQf0FyRw4MwcQ7p0C`, Manatsu no Sequence by Momoko Kikuchi, same album and exact 282800 ms. | Scoped romanized title and direct pointer. |
| 금요병 — Dalda | Bugs release metadata credits Cream while its release notes explicitly describe Dalda. Spotify Friday Blues `4h7cWN1SvevARfXqznXqT5` differs by 53 ms; the instrumental is rejected. | Recording-scoped title and credit mapping, no global Cream alias. |
| 泡になった — Monolog, 市川愛 | THE LIMELIGHT release track 7 confirms the collaboration. Japanese and romanized searches returned other songs/artists. | Unresolved catalog retrieval; no substitution. |
| HEARTでふりむいて — 和田加奈子 | Universal confirms the song on her singles compilation. Search returned 悲しいハートは燃えている, a different song by the correct singer, plus unrelated recordings. | Unresolved catalog retrieval; no title relaxation. |
| 空を見上げて — 河合その子 | Existing sonnet pointer is unplayable. Public Replica album contains `4KeXpqP8v8gwbdLlWMrMCL`, but authenticated lookup explicitly returned `is_playable:false`, `restrictions.reason:market`. | Availability issue for the checked releases. Do not bypass market rejection. |
| 香港街燈 — 角松敏生 | Source is あるがままに. Search returned his Fly-By-Day/Sea Line and other artists' Hong Kong titles. | Unresolved catalog retrieval; no substitution. |
| モア！ジャンプ！モア！ — ナユタン星人, MORE MORE JUMP！, 初音ミク | KARENT explicitly distinguishes songwriter ナユタン星人 from the performing group and named cast. `2l44rj2fDZDv6sTgyYMPxL` has the full identical cast title, same album, 58 ms difference. | Reviewed complete-source-roster rule. Require literal full cast title, exact target roster, tight album/title/time evidence. Reject Nayutalien's different solo version. |

## Evidence

- [Sandy Lam recording](https://open.spotify.com/track/4dtGOHiORFemWpob6iNcSu) and [Apple Music same-title release](https://music.apple.com/us/song/1013764371).
- [Manatsu no Sequence](https://open.spotify.com/track/50yyhKQf0FyRw4MwcQ7p0C); public embed confirms the saved duration.
- [금요병 release metadata and Dalda release notes](https://music.bugs.co.kr/album/20108427), [Friday Blues](https://open.spotify.com/track/4h7cWN1SvevARfXqznXqT5).
- [KARENT official release and full featured cast](https://karent.jp/webnews/889), [Spotify group recording](https://open.spotify.com/track/2l44rj2fDZDv6sTgyYMPxL).
- [Replica public tracklist](https://open.spotify.com/album/51UY6Kbsu6WktNMjVRcxUv). Public embed playability is not account-market availability.
- [桑名晴子 album release](https://citypop.onvinyl.jp/item/tjja-10038/).
- [Himawari original-upload search result](https://search.bilibili.com/all?keyword=himawari).
- [THE LIMELIGHT tracklist](https://www.cdjapan.co.jp/product/GRGAJ-6).
- [Universal's 和田加奈子 compilation](https://www.universal-music.co.jp/p/toct-11112/).
- [香港街燈 source catalog record](https://htq-fs.minpaku.ac.jp/trackInfo/P31686A04).

## Validation and outcome

All ten saved candidate sets are regression fixtures, including the unplayable flag. Four repairs recover from saved candidates; five misses remain unresolved and one has confirmed market-restricted releases. Tests cover wrong artists, instrumentals, unplayable candidates, wrong source IDs, missing/changed cast, unrelated album and incompatible duration. Full suite: 312 passing tests. All 22 previously matched Spotify IDs survive replay.

Offline potential is **26/32 (81.25%)**. Actual imported count remains **22/32**; the four repairs still require fresh availability checks on a future sync. No global catalog-absence claim is made for the five unresolved tracks. Request budgets, pacing, playlist title and custom cover are unchanged.
