# November 9 complete missing-track review

Actual import: **25/32 (78.125%)**, completed **08:09:36 Beijing**, including four alternate versions. [Run 42537461827](https://github.com/aaronsxzhao/neteast-spotify/actions/runs/42537461827) used 140 requests, zero retries. Later successful workflow checks are not extra imports. Public embed returned a page-level 500; authenticated playlist read instead verified **AaronZ / NetEase Daily / items.total=25**, ID `4BI0KArIAsnQGHZRY8DSIE`.

All seven misses were reviewed before edits. Local/cloud credentials agreed, no saved cooldown was active, and `/me` verified AaronZ (`fnota8o1ant1zer1670tsgx0w`). Review used 15 API HTTP requests: five direct track reads, four searches, three identity checks, two playlist metadata reads and one token refresh. The first playlist read used the old tracks field; the second used items.total. Minimum spacing eight seconds; zero retries, no 429. Public web research is separate from these API counts. No sync dispatch or playlist write.

| Source | Evidence and diagnosis | Outcome |
| --- | --- | --- |
| Dear — lecca | Known `6UdNAO674yXHaZroB8PkS7` exactly matches source title/album/duration but fresh account read explicitly reports market restriction. Saved candidates, public catalogs and authenticated title/lecca search were checked. Only playable same-artist result was `Dear - lecca NON STOP MEGA MIX`, 130026 ms versus source 264080 ms. | No verified playable full-song alternative. Keep restricted release and megamix rejected; do not claim every release is unavailable. |
| 森の小さなレストラン — 手嶌葵 | Victor confirms the original single and performer. Public Spotify identified `37XYyITs3EVTmU5eNrimEd`; fresh read confirms Aoi Teshima, exact 153033 ms, playable. Saved candidates were other performers, including composer Naotaro Moriyama. | Verified artist alias and source-guarded direct pointer. No composer/singer substitution. |
| ひとり上手 — 中島みゆき | Known `7oSAzD9RTyiPHOM16noKMl` is the correct singer/song, fresh account read explicitly market-blocked. Reviewed official discography, public catalog results, saved covers and authenticated title/Miyuki Nakajima search (empty). | No verified playable alternative. Reject Fuyumi Sakamoto and other performers. Market finding applies to the checked release. |
| Do You Love Me — 国分友里恵 | Release tracklist confirms title, performer and approximately 4:35 source duration. Reviewed original/romanized names and public catalogs; authenticated title/Yurie Kokubu query returned Easy Love, I wanna Be With You, Just a Joke and unrelated performers. | Correct Spotify candidate remains unconfirmed. Other songs by correct singer are not substitutes. |
| 喜欢两个人 — 彭佳慧 | Sony confirms Julia Peng identity and song. Saved multiple reissues were ambiguous without artist alias. `72K8evix8Y6R4oiwLw7EHG` freshly confirmed playable, title identical after script normalization, 266 ms difference. | Artist alias and direct pointer. Existing flagged competing-version fallback handles full saved set; a single fresh pointer passes strict matching. |
| CITY HUNTER ~愛よ消えないで~ — 小比類巻かほる | Sony confirms singer and recording. Saved results included Kahoru Kohiruimaki reissues plus Shoko Nakagawa cover with only 1947 ms difference. `76X2KY7pDefceL4VDaeCJo` freshly confirmed playable, 293 ms difference. | Artist alias separates correct singer from cover; source-guarded pointer. No global relaxation of cross-script identity. |
| Baby if, — Fayray | Sony original single confirms Fayray. Reviewed source Genuine, alternative 白い花 release listing, public title/artist catalog queries and authenticated filtered search (empty). Saved Mika Nakashima records are another performer. | Correct Spotify candidate remains unconfirmed. No inferred alias to Mika Nakashima and no global catalog-absence claim. |

## Evidence

- [Dear known release](https://open.spotify.com/track/6UdNAO674yXHaZroB8PkS7).
- [Victor official original release](https://www.jvcmusic.co.jp/-/News/A024306/122.html), [Aoi Teshima candidate](https://open.spotify.com/track/37XYyITs3EVTmU5eNrimEd).
- [Miyuki official single](https://www.miyuki.jp/s/y10/discography/S10A-0194), [restricted Spotify release](https://open.spotify.com/track/7oSAzD9RTyiPHOM16noKMl).
- [Yurie Kokubu source tracklist and label release information](https://tower.jp/item/5557383), [original release tracklist](https://musicbrainz.org/release/bf989ab8-ceb5-4704-911d-f7fd6b61c7ba).
- [Sony Julia Peng identity/song](https://sonymusic.com.tw/album/julia-peng-ultimate-julia-peng-2cddvd/), [verified candidate](https://open.spotify.com/track/72K8evix8Y6R4oiwLw7EHG).
- [Sony City Hunter performer and release](https://www.sonymusic.co.jp/artist/KahoruKohiruimaki/discography/ESCL-2362), [verified candidate](https://open.spotify.com/track/76X2KY7pDefceL4VDaeCJo).
- [Sony Fayray original single](https://www.sonymusic.co.jp/artist/Fayray/discography/buy/ARCJ-173).

## Tests and outcome

Fixtures preserve all seven saved candidate sets, five fresh direct reads, supplemental Kokubu search results, and all 25 imported tracks. Three verified candidates recover offline; every imported ID survives replay. Negative cases reject unrelated singers, Shoko Nakagawa's close-duration cover, instrumentals, unavailable releases, wrong pointer source identities and the Dear megamix. Each repaired pointer requires one catalog query and no further search. **339 tests pass**.

Offline potential: **28/32 (87.5%)**. Actual imported: **25/32**. Two checked releases are market-blocked and two songs remain unconfirmed after this bounded review. No rerun, playlist-title, cover, schedule or request-budget changes. A future sync must revalidate all candidate availability; offline recovery is not an import.
