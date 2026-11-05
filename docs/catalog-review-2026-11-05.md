# November 5 catalog review

The successful sync finished at 11:10 Beijing, with 23/32 tracks (71.9%), including three alternate versions. Run [41957948815](https://github.com/aaronsxzhao/neteast-spotify/actions/runs/41957948815) recorded 181 HTTP requests and zero retries. The public embed for AaronZ's `NetEase Daily` playlist `4BI0KArIAsnQGHZRY8DSIE` also returned 23 tracks.

## Reviewed fixes

| Source | Evidence and change | Validation level |
| --- | --- | --- |
| 秋风 — 徐化文（四熹丸子） | Saved candidate `7ue8efKMQnnr9f4FeEJnl4` credits 四熹丸子; identical title, album and 200955 ms. Add a recording-scoped artist alias and direct lookup hint. | Existing candidate replay |
| 우리 얘기 좀 해 — Lillo, 제이형, 지현 | Saved candidate `6dYwVgEs2zyCZJgtzBXT91` is `Can we just talk?`, Lillo / J-Hyung / 엄지현, 230001 ms versus 230063 ms. Add a scoped title and lookup hint. | Existing candidate replay; multiple equivalent catalog editions exist |
| 우주를 줄게 — 脸红的思春期 | Public Spotify embed `15c7KZTrsCUxCQcOdUVELc` gives `Galaxy`, BOL4, 213853 ms versus 215120 ms. Add verified artist aliases, scoped title and lookup hint. | Public metadata fixture; not yet checked for account-market playability |

Sources checked on November 5

- [秋风 on Spotify](https://open.spotify.com/track/7ue8efKMQnnr9f4FeEJnl4)
- [Lillo Korean release and complete collaborators](https://music.bugs.co.kr/album/439531)
- [Lillo English release and lyrics](https://www.shazam.com/song/1652682129/can-we-just-talk-feat-jhyung-um-jihyun)
- [Lillo complete-credit Spotify release](https://open.spotify.com/track/6dYwVgEs2zyCZJgtzBXT91)
- [Galaxy public embed](https://open.spotify.com/embed/track/15c7KZTrsCUxCQcOdUVELc)
- [Apple Music identifies 脸红的思春期 as BOL4](https://music.apple.com/us/playlist/bol4-essentials/pl.ad438862d465416e856ed74e1c489154?l=zh-Hans-CN)

All pointers still require a fresh available candidate and normal scoring. Tests reject unrelated primary artists, karaoke, different-language editions and unavailable tracks. Source ID/title guards prevent aliases leaking to other recordings. Each successful known lookup consumes one catalog query and avoids search fallback. Request pacing and cooldown behavior are unchanged.

## Remaining six

| Source | Saved candidates and unresolved issue |
| --- | --- |
| Sincerely — 浜田朱里 | Same-name songs by Yuri Kil, TRUE and others; none establishes the source artist. |
| 別れ1940 — 深津絵里 | No matching recording among previews; unrelated titles/artists. A stage-character credit may explain retrieval, but no verified Spotify pointer. |
| 新宿午前3时25分 — 北野武 | Other artists' songs containing 新宿. No matching recording established. |
| 一枚の写真 — 石田ひかり | Junko Akimoto, QWAI and Natsuko Godai recordings are different artists. |
| 해볼래 — Sistar | Same-name songs by other artists; translated catalog title needs a verified Spotify recording. |
| ソー・ロング・マイ・ラヴ — 小田和正 | Unrelated ソー・ロング results. Sony lists `so long my love`, but no matching Spotify candidate was verified during this review. |

Missing candidates do not prove catalog absence. No thresholds were relaxed for these six.

## Outcome boundary

All 23 previously confirmed matches retain their Spotify IDs in offline replay. Two misses recover from saved previews, and the additional public Galaxy fixture passes. Potential coverage is 26/32 (81.3%); actual imported coverage remains 23/32 until a later sync verifies availability and writes the playlist. This review does not dispatch a sync or send authenticated Spotify API requests.
