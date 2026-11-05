# November 5 catalog review

## Completed four-track follow-up

All four remaining tracks received official-release, alternate-credit, public-catalog and bounded authenticated-search review. `/me` confirmed AaronZ before catalog requests; local and cloud refresh credentials agreed, and neither stored state had an active cooldown. This pass used 10 HTTP requests total (token refresh, identity, eight track searches), at least 8 seconds apart, with zero retries and no 429. It did not write the playlist or dispatch a sync.

| Source | Two additional API queries | Unique returned candidates | Conclusion |
| --- | --- | --- | --- |
| Sincerely — 浜田朱里 | `Sincerely 浜田 朱里`; `Sincerely Juri Hamada` | 15 | TRUE, Haruomi Hosono, Yuri Kil and other unrelated artists. No correct target verified. |
| 別れ1940 — 深津絵里 | `別れ1940`; `album:毒苺` | 17 | Other songs containing 別れ/1940 and unrelated Toxic Candy Drop / 陳昱睿 releases. No correct target verified. |
| 新宿午前3时25分 — 北野武 | `新宿午前3時25分`; `新宿 ビートたけし` | 16 | Goro Noguchi's 新宿午前四時 and other unrelated titles/artists. No correct target verified. |
| 一枚の写真 — 石田ひかり | `一枚の写真 石田ひかり`; `Ichimai no Shashin Hikari Ishida` | 20 | Unrelated artists and songs; earlier exact-title previews were also other artists. No correct target verified. |

All 68 per-source unique candidates were rejected in both normal and alternate-version offline scoring. Search ranking is bounded, so this is a completed review of the documented evidence, not proof of global catalog absence or regional unavailability. There is no supported additional matching repair for these four in this pass. Existing five recording fixes remain intact. Four regression cases now retain representative false positives so later recall changes cannot silently substitute these unrelated recordings.

Official release evidence checked for all four

- [Sony's 浜田朱里 album listing](https://www.110107.com/s/oto/discography/DYCL-395) identifies Sincerely on 瞳・センチメンタル.
- [NODA MAP's original release notice](https://www.nodamap.com/site/news/253) identifies ICHIGO ICHIE's 毒苺 and 深津絵里 as the singer; the production discography below lists 別れ1940.
- [Victor's original compilation listing](https://www.jvcmusic.co.jp/-/Discography/-/VICL-63423.html) lists 新宿午前３時２５分 on disc 2, track 17. This confirms the recording, not Spotify availability.
- [Teichiku's TWIN VERY BEST COLLECTION](https://www.teichiku.co.jp/chronicle/catalog/TECH-30367.html) lists 一枚の写真 on disc 2. This is a different release from the Spotify GOLDEN BEST already inspected.

The daily review automation now requires all misses to be reviewed before applying and committing the supported fixes. It retains the 18:30 Beijing schedule and explicitly does not dispatch a sync. See [daily review procedure](daily-review.md).

## Follow-up verification

The initial six unresolved cases were not six proven catalog absences. Further album-level inspection recovered two more public candidates.

- `417859225`, SISTAR's `해볼래`, is [Say! Yes](https://open.spotify.com/track/5gDxhjgpRoClBFrOcNGiEQ), 188835 ms, exactly equal to the source. The title mapping is independently listed in [the bilingual release lyrics](https://popgasa.com/2016/06/24/sistar-say-yes-%ED%95%B4%EB%B3%BC%EB%9E%98/). The public Spotify embed confirms the artist and duration. Added a source-scoped English title and direct catalog pointer.
- `487280`, 小田和正's `ソー・ロング・マイ・ラヴ`, is [so long my love](https://open.spotify.com/track/0lM08CHxy1DQ4RdvfGPGGT), found by traversing [the same-name single](https://open.spotify.com/album/25umzMP591FMAEkeiGKTuy) from its B-side. Public metadata credits Kazumasa Oda and gives 349666 ms versus 352000 ms. Added a source-scoped English title and direct pointer; the artist alias already existed.

Follow-up tests cover both positives plus wrong primary artist, karaoke, different-language recording, unavailable recording and source-ID isolation. These are public metadata tests, not account-market availability checks. Together with the original three fixes, potential coverage is now 28/32 (87.5%). Actual import remains unverified at this new count; no sync was dispatched.

Four cases remain unresolved after the follow-up.

- `Sincerely`: checked Japanese and romanized artist/title searches and the official [Sony album listing](https://www.110107.com/s/oto/discography/DYCL-395). The recording exists, but no Spotify target was verified. Do not confuse 浜田朱里 with 浜田麻里.
- `別れ1940`: the [official production discography](https://www.kronekodow.com/disc_other.php?id=901) identifies the 2012 limited-release stage album 毒苺 under ICHIGO ICHIE. Searches under that credit did not establish a Spotify target.
- `新宿午前3时25分`: checked ビートたけし, ビートたけし&たけし軍団, Takeshi Kitano, the public group top tracks and the full [浅草キッド album](https://open.spotify.com/album/4NjbRIaoCRcTzFxBhmyE92). No target appeared in those inspected records. This is not an exhaustive account-market catalog result.
- `一枚の写真`: inspected all 12 entries in [石田ひかり ゴールデン★ベスト](https://open.spotify.com/album/0m1bkcflCGUmZZbZHLtVRL) and title/artist/White Virgin searches. The target was not in that inspected album and no Spotify pointer was found. Search results mixing a physical single's B-side with Spotify's A-side are not valid track evidence.

The following sections preserve the initial review evidence and counts.

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
