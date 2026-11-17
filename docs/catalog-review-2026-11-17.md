# November 17 complete missing-list review — online verification interrupted

Actual imported **21/30 (70.00%)**, finished **10:08:33 Beijing**. [Run43998767243](https://github.com/aaronsxzhao/neteast-spotify/actions/runs/43998767243) reports **160 requests, zero retries**. Later successful checks are not further imports. All nine missing sources were enumerated before matcher edits and their complete saved candidate previews inspected.

Local/cloud refresh credentials agreed and neither state had an active cooldown at start. The read-only review plan started with a pending backlog case (Japanese Happen Ending guest recording), followed by all nine daily sources. However, token refresh returned **HTTP502** on the first authorization request. The existing guard does not replay an ambiguous token POST: **one request, zero retries, zero candidate jobs completed**. It saved transient-backoff until **18:44:43 Beijing**. No HTTP429 occurred and the deadline was not cleared. `/me`, playlist owner/count and the previously verified US account market were **not refreshed in this pass**. Actual import counts come from cloud state and Actions logs; no fresh independent playlist count is claimed.

The whole review remains incomplete for live availability. Offline/public evidence was examined for every row; no unseen candidate or absent search result is treated as proof of catalog absence. No sync dispatched, playlist mutation, title or cover change.

| Missing source | Saved/public evidence checked | Conclusion / next action |
|---|---|---|
| GIN TONIC ~オヤジ~ — 大嶽香子 | Source Bartender soundtrack139000ms. Published soundtrack tracklist identifies track22, composer Kaoruko Otake; saved Gin Tonic candidates are LEONARDO, YANGHONGWON, Parov Stelar and others. Original/romanized composer and soundtrack public queries reviewed. | No correct Spotify recording confirmed. Planned composer-qualified API query not executed; continue with original soundtrack release metadata. No aliases to unrelated Gin Tonic performers. |
| 和月亮谈的夜晚 — 邹念慈 | 夏日美梦182318ms. Public original-title/artist/album release references reviewed; StreetVoice page uses 念慈的部落格, but this alone is insufficient to assume a Spotify artist identity. Saved 有可能的夜晚/月亮 records are different songs. | No verified candidate. Planned traditional-title/original-artist query deferred; do not infer a global artist alias from an uploader page. |
| 슈게이저 — Misty Blue | Saved `0lVJIHTB13L9HgvmyghcPV` is 슈케이저, same full artist roster, identical album and213626ms. Bugs and T world list original spelling 슈게이저; Spotify saved metadata supplies the aspirated initial variation 슈케이저. Title similarity0.714 was the sole blocker. | General corroborated Hangul spelling fix recovers offline. Direct account-market read deferred; do not claim fresh playable verification or actual import. |
| Ride The Tide — Mr.Bruce | Source AlL iS wElL249500ms. Original title/artist/album public queries and podcast program credit reviewed; no trustworthy alternate artist mapping identified. Saved Alan-K, Screamin' Cheetah Wheelies, Donnie & Joe Emerson, Dual Current are other performers. | No correct Spotify candidate. Planned artist-qualified query deferred. Same-title recordings are not substitutes; seek artist/distributor release identifiers. |
| 半口咸柠 — 王以诺 | Source130746ms. Performance organizer/news listing and JOOX artist release metadata corroborate original title/artist. Saved Tsai Chin and other recordings have neither title nor identity agreement. | No Spotify candidate confirmed. Traditional-title/artist query deferred; use release metadata rather than wrong-title similar mood. |
| 夏待 — Himawari, Aosaki | Source217299ms. Existing November6 evidence identifies creators; creator-upload search lead found. Saved If/Kagamine Rin, ROUND TABLE/Nino and AKASAKI are different performers/works. | No verified candidate. Pending full-roster original-title API query retained. No identity alias to AKASAKI or same-title covers. |
| 不能爱恋 只能暗恋 — 应昌佑 | Source charles EP277293ms. Release tracklisting confirms title and Charles Ying credit. Saved Jay Chou/Jane Zhang songs are different works. Traditional spelling and romanized performer reviewed. | Correct Spotify track unconfirmed. Pending Charles Ying query retained; do not replace with 不能說的秘密 or other 暗恋 songs. |
| Luv is True — 3Rd Coast | DJMAX Portable3 OST173000ms. Official DJMAX ARCHIVE/NEOWIZ recording credits3rd Coast, So Fly and JC; published soundtrack list gives2:53. Saved Rappin'4-Tay, PinkFantasy, Swan Lingo and other tracks fail source identity/duration. | No verified Spotify target. Planned DJMAX/artist query deferred. Composer/singer credit differences need evidence, not arbitrary roster merging. |
| 달아요 — 朴正炫 | Source Come To Where I Am224000ms. Qobuz release and Korean release reporting identify Lena Park's original2007 song; later2014 Verbal Jint duet is a remake, not automatically the source. Saved matching-title karaoke explicitly credits original singer in title, not as performer. | Correct Spotify recording not confirmed. Planned Lena Park query deferred. Karaoke remains rejected; verify any duet variant explicitly before accepting. |

## General repair

No per-song alias or ID added. For titles consisting of at least four Hangul syllables, a single plain/aspirated initial pair (ㄱ/ㅋ, ㄷ/ㅌ, ㅂ/ㅍ, ㅈ/ㅊ) may receive title evidence only when **full ordered performer roster and album name agree exactly after existing normalization**, and duration difference is at most250ms. NFD jamo comparison permits exactly one such change; vowel changes, two differences and short titles are not forgiven. Existing language/recording/version/availability checks remain in force. No global similarity threshold change.

This general rule is motivated by 슈게이저/슈케이저 and an independent synthetic pair with no learned source ID. It does not assert all close Hangul words are equivalent; recording corroboration is mandatory.

## Tests, measured scope and backlog

**429 tests pass**, zero failures. Twelve new tests retain all nine miss outcomes (one offline recovery), verify first-query completion for the real spelling case with source ID0, cover independent positive/close negatives, and replay all21 newly imported IDs. With these fixtures, **218 historical confirmed pairs** remain covered; earlier197pairs plus today's21 retain IDs.

Offline potential today: **22/30 (73.33%)**, conditional on future live availability verification. Actual remains **21/30**. One mock search/catalog query recovers the Misty Blue case; no claim of fresh provider savings, new imports or recovery of the other eight. Complete regression includes preserved artist, album, duration, roster, unavailable and instrumental rejection.

All nine sources merge into persistent backlog with per-source evidence and the unexecuted next request. Previously unresolved Happen Ending remains pending because authorization failed before it could be requested. Reliable code repair is committed as partial work; online review is explicitly unfinished. Do not replace pending rows with a new list tomorrow.

## Source metadata references

- [Bartender soundtrack tracklist](https://www.suruga-ya.jp/product/detail/120026615).
- [Bugs Misty Blue original spelling and album](https://music.bugs.co.kr/track/1950112), [T world original spelling](https://music.tworld.co.kr/deco/renew/bell_singer.do?singerId=10311).
- [StreetVoice release lead, identity not assumed](https://streetvoice.com/green_glade_74h/songs/), [Himawari creator upload search lead](https://search.bilibili.com/zh-Hans/all?keyword=himawari).
- [Wang Yinuo concert organizer](https://www.showstart.com/event/305903), [news performance report](https://www.sznews.com/news/content/mb/2026-08/30/content_32159729.htm), [Charles EP listing](https://www.cdhkonline.com/product-page/%E6%87%89%E6%98%8C%E4%BD%91-charles-avcd).
- [Official DJMAX recording credits](https://www.youtube.com/watch?v=b2MV1BicAYc), [Lena Park original album](https://www.qobuz.com/au-en/album/come-to-where-i-am-lena-park/olx8q4es2flva), [2014 remake context](https://www.osen.co.kr/article/G1109986892).
