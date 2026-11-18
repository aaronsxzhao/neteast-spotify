# November 18 catalog review

[The playlist-writing run](https://github.com/aaronsxzhao/neteast-spotify/actions/runs/44217326316) finished at 09:49:52 Beijing with **26/31 imported (83.87%)**, 112 Spotify requests and zero retries. The read-only check verified AaronZ and playlist ownership, then read a total of 26 tracks from NetEase Daily.

| Miss | Candidate verification | Result |
|---|---|---|
| 好・き・好・き SWEET KISS — 山下達郎 | Warner lists the track on *RARITIES*. Saved candidates include nana hatori and Eddy Kim. The fresh original-title/romanized-artist query still returned other performers. [Warner release](https://e-store.wmg.jp/shop/g/gWPC2-10001/) | Correct Spotify recording unconfirmed. |
| Give Me The Nighttime — Craig Ruhnke | Confirmed the original *True Love* release. Title-and-artist search returned zero hits. Saved candidates credit Jimmy Gennaro or Lonely Benson. No release or credit evidence ties those candidates to Ruhnke's recording. [Craig Ruhnke discography](https://www.citizenfreak.com/artists/102348-craig-ruhnke) | Correct Spotify recording unconfirmed. |
| 夜の海 — 桑名晴子 | Confirmed the *Moonlight Island* track. Saved original-script search returned other artists, including 堂本光一 and 桑名正博. The title plus Haruko Kuwana returned no results. [Moonlight Island reissue](https://citypop.onvinyl.jp/item/tjja-10038/) | Correct Spotify recording unconfirmed. |
| 雨上がり — ari | Confirmed ari's title and album on the VOZ Records release. Saved hits by Kitri and arie have different credits. Title plus album and artist returned no results. [VOZ release](https://music.apple.com/jp/album/%E9%9B%A8%E4%B8%8A%E3%81%8C%E3%82%8A/419281896) | Correct Spotify recording unconfirmed. |
| Only One (Japanese Ver.) — BoA | The 2013 Japanese single and *WHO'S BACK?* track both returned playable with ISRC `JPB601300402`. The Korean seventh-album track has ISRC `KRA301200362`. The single has the exact source duration and is preferred. Both Japanese-track titles omit the language tag. [Avex Japanese single](https://avex.jp/boa/discography/detail.php?id=1004128) · [Spotify single track](https://open.spotify.com/track/4FOIzp5aI8yIrStN19IPQu) | Correct Japanese recording verified on Spotify and recoverable offline. |

The matcher can now use verified recording-language metadata when the Spotify title omits its language and the full reviewed recording fingerprints match. The known-track lookup fetches the single again before matching. Explicit language conflicts, mismatched fingerprints, and unavailable tracks remain excluded.

The read-only review used 13 Spotify HTTP requests over two sequential passes, including identity and playlist checks, with an 8-second minimum interval within each pass, zero retries and no HTTP 429. The existing 502 diagnostic and bounded checkpoint resumption were covered by regression tests. Neither live pass encountered a 502.

The previous [eight interrupted cases](review-resume-2026-11-17.md) had already been resumed individually. Lena Park's *It's Sweet* was confirmed playable, and seven sources remain unconfirmed after the documented searches. Those conclusions stay in the backlog alongside today's four unconfirmed sources. Further evidence should come from a new release identifier or official distributor link before repeating searches. A bounded search cannot establish catalog absence.

The new tests exercise one known-track lookup for BoA, reject the Korean, instrumental, unavailable and altered-fingerprint cases, and replay the 26 tracks imported today. The historical fixture replay covers 244 matched pairs.
