# November 16 evidence-to-matcher improvements

## Confirmed causes and reusable changes

1. A correct recording may use romanized title text: ちょっと待ってよ / Chotto Matteyo, same never young beach artist, YASHINOKI HOUSE, duration difference14ms. The previous scorer does not derive a reading for 待; blindly relaxing string similarity is unsafe. A reusable reviewed-recording evidence mechanism now consumes independently checked full source/target fingerprints. It validates source ID/title/complete roster/album/duration and fresh target ID/title/complete roster/album/duration before supplying the reviewed title/identity. Normal version/language/availability checks still execute. No global romanization or artist aliases are inferred.
2. Confirmed tracks such as 今天是我的 and いとしのエリー were retrieved during review but would otherwise repeat exploratory searches. The same evidence mechanism exposes a direct lookup. Every sync reads and validates current target metadata rather than treating past playability as permanent. These are two retrieval improvements, not two newly solved title comparisons.
3. Short/common album names were searched without their artist before results were capped at ten. General album queries now spend the first slot on album+artist, keeping the unqualified fallback within the existing two-query allowance. Long tribute/compilation titles keep the unqualified query to preserve Various Artists releases; an explicit translated album retains a slot. No request cap increase.
4. Catalog campaign subtitles, e.g. 概念创作集《…》作品, are now normalized consistently during title comparison. The rule applies to unrelated source IDs and preserves language/version checks. This complements the prior query-side removal of promotional aliases. Ordinary subtitles retain their previous non-exact title score; the new rule does not remove them.

## Evidence rows versus general algorithms

`src/reviewed-recordings.js` contains the reusable fingerprint evaluator plus three explicitly reviewed evidence rows. The evaluator and query/subtitle changes are general code; the three source-to-target correspondences are curated evidence, not proof of automatic transliteration. Adding a row requires independent identity evidence, not a model score or similar duration. Unsupported source identities, different guest rosters, uncertain band/member provenance, structural split tracks and unavailable releases are not learned as correct playable substitutions.

All three seeded targets were account-verified playable in the previous live review. Source/target snapshots and bilingual/official evidence references are stored beside the evaluator and in the regression fixture. Chotto Matteyo's original/romanized identity is supported by the prior Apple/TuneCore release evidence. No new Spotify requests in this algorithm pass.

## Measured validation

- **407 tests pass**, zero failures; all **170 historical confirmed pairs** replay unchanged.
- Each of three reviewed rows completes `findTrackMatch` in **one catalog query, zero searches** in the regression harness. This is bounded adapter replay, not a fresh live sync or a measured provider-quota reduction.
- One newly recoverable cross-title comparison: ちょっと待ってよ. The other two are direct-retrieval improvements to already matchable recordings.
- Positive tests cover unrelated campaign annotations and short-album query planning. Negatives cover changed source ID/title/album/duration/roster; changed target ID/title/album/duration/roster; wrong performer, instrumentals, unavailable tracks and language editions.
- Complete previously performed live backlog plan remains 42 checks for41sources, 44requests, zero retries. This pass does not claim all unresolved identities are solved.

No sync dispatch, playlist-title or cover changes. Actual imported results are unchanged. Daily18:30review now explicitly requires evidenced defects to proceed through reproduction, reusable code repair, positive/negative tests, full historical replay, normal commit/push and remote-SHA verification. Unsupported or blocked cases retain explicit next actions instead of fabricated fixes.
