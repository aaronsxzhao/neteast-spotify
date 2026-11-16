# November 16 connection repair and bounded backlog pass

Native HTTPS/IPv4 verified AaronZ and playlist ownership. Connection smoke: 3 requests, zero retries. Backlog batch: 44 requests (2 identity/owner +42 catalog), zero retries, no 429; 41/41 sources received their planned check. No playlist writes or sync dispatch. 399 tests pass, including 170 historical confirmed pairs.

All planned checks finished, but some identities/availability remain unresolved; the backlog remains open. This is not 41 recovered songs or new imports. Confirmed playable metadata includes 今天是我的, 行走的鱼, いとしのエリー and Come Back To Me; Chotto Matteyo additionally verified against prior bilingual release evidence. 真夏の果実 retains uncertain source provenance.

|Source|Result|Next scope|
|---|---|---|
|夜の海 — 桑名晴子|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|夏待 — Himawari, Aosaki|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|泡になった — Monolog, 市川愛|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|HEARTでふりむいて — 和田加奈子|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|空を見上げて — 河合その子|verified-recording-availability-limited|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|香港街燈 — 角松敏生|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|你不要那样看着我的眼睛 — 蔡琴|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|异心引力 — 银河快递|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|Deeper and Deeper — CAGNET, Anna McMurphy|verified-recording-availability-limited|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|PLANET — ラムジ|verified-recording-availability-limited|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|雨上がり — ari|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|Dear — lecca|verified-recording-availability-limited|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|ひとり上手 — 中島みゆき|verified-recording-availability-limited|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|Do You Love Me — 国分友里恵|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|Baby if, — Fayray|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|RAINY WALK — 山下達郎|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|ミライのテーマ — 山下達郎|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|新宿午前3时25分 — 北野武|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|Sincerely — 浜田朱里|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|今天是我的 — 汪晨蕊|verified-playable|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|ハーフムーン・セレナーデ — 河合奈保子|verified-recording-availability-limited|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|ソー・ロング・マイ・ラヴ — 小田和正|verified-recording-availability-limited|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|Plastic Love (TARA Bootleg) — TARA|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|一枚の写真 — 石田ひかり|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|Jack Rabbit Slim's Twist Contest / You Never Can Tell — Jerome Patrick Hoban, Uma Thurman, Chuck Berry|structural-one-to-many|Both dialogue and song components were read and are playable. Neither alone equals the combined source; one-to-many mapping remains unimplemented.|
|誰にもわからない私の痛み — 宇都美慶子|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|TV in Black & White — Lana Del Rey|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|行走的鱼 — 徐佳莹|verified-playable|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|ちょっと待ってよ — never young beach|verified-playable-needs-title-retrieval|Chotto Matteyo / ちょっと待ってよ verified against prior Apple/TuneCore release evidence, identical artist and album, 14 ms difference. Search result explicitly playable. Automatic title transliteration remains unsupported; no forced fuzzy match.|
|ずっとずっとずっと — 大橋トリオ|verified-recording-availability-limited|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|真夏の果実 — 桑田佳祐|source-recording-identity-unresolved|Southern All Stars track is playable, but solo-source attribution still requires provenance. A cross-language score is insufficient to confirm the source recording.|
|最愛(Remaster) — 中島みゆき|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|無人の島 — TRUE|verified-recording-availability-limited|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|いとしのエリー — サザンオールスターズ|verified-playable|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|HAPPEN ENDING [JAPANESE MIX] — EPIK HIGH, 李遐怡|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|グッドバイ・デイ — 来生たかお|verified-recording-availability-limited|Official Universal Goodbye Day identity and Spotify single metadata agree with Takao Kisugi; 4996 ms difference. Album response omits availability: direct track read remains pending.|
|誘魚灯 — 伊藤美奈子|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|世界中の誰よりきっと — 德永英明|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|日和 — Canappeco|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|
|Come Back To Me — 宇多田ヒカル|verified-playable|Recording metadata passes existing identity/title/version/duration rules; availability recorded separately.|
|別れ1940 — 深津絵里|searched-no-confirmed-recording|All returned candidates reviewed; no safe match under existing identity/title/version/duration rules. Not proof of catalog absence.|

Evidence: each source row in review-backlog.json retains query/album/track ID, check timestamp, returned candidate IDs and original release evidence file. Native transport tests cover token bodies, cancellation, redirects, body timeout, provider status/Retry-After and no hidden retries. The exact underlying fetch/network interaction remains unproven; native HTTPS solves the reproduced failure path and passed the full live batch.
