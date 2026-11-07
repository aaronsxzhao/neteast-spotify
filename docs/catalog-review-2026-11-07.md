# November 7 complete missing-track review

Actual import: **26/32 (81.25%)**, completed 07:38:59 Beijing. [Run 42311708498](https://github.com/aaronsxzhao/neteast-spotify/actions/runs/42311708498) reports 140 requests, zero retries. Later successful checks are not extra imports. Public playlist embed independently confirms **AaronZ / NetEase Daily / 26 tracks**, playlist `4BI0KArIAsnQGHZRY8DSIE`.

All six misses were reviewed before editing. Local/cloud credentials agreed; both had no active cooldown. Authenticated `/me` confirmed AaronZ (`fnota8o1ant1zer1670tsgx0w`) before each probe. Review used **14 HTTP requests**: six searches, five track reads, two identity reads and one refresh. Minimum interval eight seconds; zero retries, no 429. No sync dispatch or playlist write.

| Missing source | Evidence and failure | Change / remaining uncertainty |
| --- | --- | --- |
| 花束じゃなくキミといたい feat. 玉置浩二 — 絢香, 玉置浩二 | Saved results already contained duet `4il15pZcNNkbwLMrI7dBaC` and an almost equal-length solo. Missing artist aliases made both cross-script candidates equally plausible. Official release explicitly distinguishes the new duet. Direct AaronZ read confirms duet playable, exact album and 297840 ms. | Alias ayaka / Koji Tamaki; require complete roster; direct pointer. Reject solo and changed guest in both passes. |
| 哪怕 — 莫文蔚 | Search with Chinese title/Karen Mok and romanized Na Pa did not retrieve it. Public catalog exposed two releases: `4lkCHTwVSfSd02i1IPhOz9` explicitly market-blocked, while `4HKsAa7XAvZZs1x0Betdkx` is playable, same song/artist/album and 18 ms difference. | Pointer to verified playable release, still subject to fresh availability and normal scoring. Do not bypass market restriction. |
| 你不要那样看着我的眼睛 — 蔡琴 | Reviewed saved simplified/traditional title searches, source album/tracklist, public catalog searches, plus authenticated traditional-title/Tsai Chin and romanized-title searches. Returned 黄绮珊 cover and Tsai Chin's other songs, not the requested recording. | Correct Spotify candidate remains unconfirmed. No global absence claim or forced cover substitution. |
| いかないで collaboration — 德永英明, 玉置浩二 | Saved `43JGCJZuHcqyVA2hyL4cIX` has exact source album and 69 ms difference. Universal credits “collaboration with 玉置浩二”; Spotify labels “Live at Nagoya Century Hall / 2014”. Direct read confirms playable. | Scoped composition title, Koji Tamaki alias, complete-roster pointer. Existing alternate-version path accepts and flags it because source title omits Live. Evidence indicates same concert performance; no global removal of “collaboration”. |
| 异心引力 — 银河快递 | Source aliases already include Funny. Reviewed saved candidates, source release listing, public catalog queries and authenticated Chinese title/artist plus Funny/Galaxy Express searches. Found unrelated Funny tracks, 心引力 and a different relaxation recording. | Correct Spotify candidate remains unconfirmed. Similar title/length cannot establish the band; no global Galaxy Express alias (name collision risk). |
| Where Did U Go — G.E.M.邓紫棋 | Existing candidate `0a8mmtNx7Gwa9Uav1UgAQX` is playable, G.E.M. album, 987 ms difference. Distributor confirms G.E.M. / 邓紫棋 identity. Combined credit was not recognized. | Artist alias and direct pointer. Prefer source album, reject unrelated artist, instrumental and unavailable metadata. |

## Evidence

- [Ayaka official duet announcement](https://room-ayaka.jp/20th/news/439), [duet](https://open.spotify.com/track/4il15pZcNNkbwLMrI7dBaC).
- [Karen Mok playable release](https://open.spotify.com/track/4HKsAa7XAvZZs1x0Betdkx), [restricted release](https://open.spotify.com/track/4lkCHTwVSfSd02i1IPhOz9), [Apple original title/artist](https://music.apple.com/us/song/1865433184).
- [Universal official concert album](https://www.universal-music.co.jp/p/UMCK-9686/), [Spotify duet](https://open.spotify.com/track/43JGCJZuHcqyVA2hyL4cIX).
- [G.E.M. distributor credits and tracklist](https://www.xwx.cn/album/M9jny29w), [Spotify source-album recording](https://open.spotify.com/track/0a8mmtNx7Gwa9Uav1UgAQX).
- [Tsai Chin source release/tracklist](https://musicbrainz.org/release/a0eb2759-e03d-4246-a3eb-3b46c8fa5cb3).
- [银河快递 source release listing](https://www.kugou.com/mixsong/coy21173.html).

## Validation

All six saved candidate sets, five fresh direct reads and all 26 already imported tracks are regression fixtures (catalog fields only). Four verified candidates recover offline; all 26 imported IDs survive replay. Tests also reject missing/replaced duet guests, wrong artist, instrumental, unavailable release and mismatched pointer identity. Each verified direct lookup completes in one catalog query without further search. Complete suite: **321 passing tests**.

Offline potential is **30/32 (93.75%)**, including one flagged alternate-version path. **Actual imported coverage remains 26/32**. Two songs remain unconfirmed after this review; that does not prove Spotify lacks them or that no future algorithm can recover them. No request-budget, pacing, playlist-title, cover, or schedule changes.
