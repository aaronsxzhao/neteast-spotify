# November 16 daily review and backlog repair

Actual imported **27/31 (87.10%)**, completed **09:15:52 Beijing**. [Run43783994508](https://github.com/aaronsxzhao/neteast-spotify/actions/runs/43783994508) reports **118 requests, zero retries**, one alternate version. Fresh `/me` and playlist-owner checks verify AaronZ and NetEase Daily items.total=27. Account market previously verified US; this review uses the same AaronZ user authorization with no market override. Local/cloud refresh credentials agree; no active stored cooldown before requests.

Today's read-only review: **11 HTTP requests** (refresh, identity, playlist owner/count, eight planned candidate/search reads), **zero retries**, no429, minimum8-second spacing. No playlist writes or sync dispatch.

## All four daily misses, reviewed before edits

| Source | Evidence / checked scope | Result and next action |
|---|---|---|
| 別れ1940 — 深津絵里 | Saved original/translated-title queries, 毒苺 release, actor/stage-character credit. Official Sheena Ringo discography identifies ICHIGO ICHIE and track1. Fresh 別れ1940 ICHIGO ICHIE search returns unrelated recordings. | Correct Spotify candidate remains unconfirmed. Do not infer absence or alias actor to arbitrary artists. Continue on new distributor/catalog evidence instead of repeating identical queries. |
| 你不要那样看着我的眼睛 — 蔡琴 | Saved simplified/traditional title, original album and other-performer candidates. Fresh traditional-title/Tsai Chin query returned Tsai Chin's 你的眼神、最後一夜、讀你 and unrelated songs; original 1992 release metadata reviewed. | Same artist's other songs and same-title covers cannot substitute. No verified correct candidate; seek original-release catalog metadata. |
| Deeper and Deeper — CAGNET, Anna McMurphy | Direct reads `5ElzKkLs6ZQ1Sp2YEkzHm9` and `3e6Z2h3LsACpW7vqKawOVn` both explicitly return is_playable=false/restrictions.reason=market. Source duration288925ms; targets288866/289040. | Both checked releases are unavailable for AaronZ's market. This is not evidence that all releases are unavailable. No global identity/availability relaxation or Madonna substitution. |
| Off Shore — 角松敏生 | Source ON THE CITY SHORE312733ms. Saved Debris of Titan near-duration same title is a different artist; same-name 角松 敏生's Forgotten shores is a different song. Original album/track release reviewed; supplemental Off Shore Toshiki Kadomatsu search returns Fly-By-Day/Sea Line. Supplemental album-filtered track search returned no source recording. Public user playlist lists title but provides no verified track identity. | Correct Spotify recording remains unconfirmed; no forced near-duration or artist-string substitution. Further source/label track IDs may resolve it. |

## Backlog-first work

Resumed the two previously pending direct availability checks, using saved original release evidence before querying. Neither is a daily miss, so these recoveries must not inflate today's27/31 result.

- **ずっとずっとずっと — 大橋トリオ**: official [artist announcement](https://ohashi-trio.com/news/detail.php?id=1115771) identifies tribute performance; direct `3wBVPyrHeUoyCV2SVX7lQb` confirms Ohashi Trio, same tribute album,262754ms versus262755, explicitly playable.
- **グッドバイ・デイ — 来生たかお**: [Universal official Goodbye Day release](https://www.universal-music.co.jp/kisugi-takao/products/h00k-20154/) establishes title/performer; direct `2lz7CkVTDjtHamN6zaQJZj` confirms Takao Kisugi319000ms versus323996, playable. Reviewed as an acceptable same-song same-primary release; not proof of the identical compilation master.

Both now use the existing full-fingerprint reviewed-recording mechanism. These two additions are **curated evidence rows**, not a new general translation algorithm. Fresh live metadata must continue to match the saved source/target fingerprints and normal availability/version checks. Their full candidate fixtures now run alongside wrong artist, changed source/target fingerprint, instrumental and unplayable negatives. Each finishes in one catalog query, zero searches in offline adapter replay.

## General implementation change

Actual Off Shore query trace exposed a redundant use of the two-slot free-text stage: original credit, then bare title, despite a known verified English primary alias. The stage now interleaves original primary and its first verified alias before bare title or extra permutations. This affects all known aliases, with independent regression on Hikaru Utada and a no-alias fallback case. No new alias, query limit increase or identity-threshold relaxation is introduced by this rule. Artist names remain retrieval hints and do not override scoring.

Measured planning difference: the first two slots now include two artist-qualified probes instead of one qualified probe and one bare-title probe for the Off Shore case. This **does not yet recover Off Shore**: the fresh alias query still did not find the recording. No unsupported claim of live request savings or increased daily match rate. The two backlog evidence rows do have one-query recovery regression coverage.

## Validation and state

**417 tests pass**, zero failures. Added tests preserve all four daily rejection outcomes, alias slot ordering on two independent artists/no-alias fallback, and all27 imported daily IDs. Existing historical replay covers170 earlier pairs; with today's fixture there are **197 historical confirmed pairs**. Evidence-row regressions cover both backlog recoveries with positives/negatives and one-query limits.

Persistent backlog merges today's new Off Shore source without dropping previous unresolved entries. Today's four have checked scope and next action; two older availability-unknown entries now have fresh playable evidence and regression coverage. Old unresolved rows were not all re-searched again in this pass; the complete41-source bounded pass from earlier today remains their evidence baseline. No claim that the backlog is fully solved.

Actual imported remains **27/31**. Newly verified/recoverable backlog cases: **2**, not imported. New recoveries among today's4: **0**. No automatic rerun, title, cover or schedule changes.

Supporting sources: [official 毒苺 track listing](https://www.kronekodow.com/disc_other.php?id=901), [ON THE CITY SHORE release listing](https://tower.jp/item/477086), [public playlist, not recording proof](https://open.spotify.com/playlist/04GizIbe7rQdbKEqJoV2ZX), [original Tsai Chin release listing](https://music.douban.com/subject/2980040/).
