# Separate opportunities for multiple posters

## Verified starting point

`git status --short` and `git diff` were empty before editing. Baseline: `e35383e`. The merge already constructed region-specific opportunities, but then combined them into a synthetic result and added a `Separate posters` conflict. Only the combined result reached SSE. The identity function recognized bare image hashes but not region suffixes.

## Contract and transport

`lib/poster/classification.ts` now exports:

```ts
type PosterPipelineOutput =
  | { kind: 'single'; result: OpportunityResult }
  | { kind: 'multiple'; results: OpportunityResult[] };
```

Internal diagnostics remain separate from the accepted result fields. Exactly one region yields `single`; two or more yield `multiple`. An unreadable upload still produces the existing single fallback. The synthetic combined opportunity, field prefixes and `Separate posters` conflict are deleted. Genuine within-poster conflicts remain unchanged.

Single poster images and URL sources retain:

```text
event: result
data: <OpportunityResult JSON>
```

Multiple posters use a bare array, without an object wrapper:

```text
event: results
data: <OpportunityResult[] JSON>
```

`readInvestigationStream()` handles split event names, split JSON, UTF-8 byte boundaries, LF/CRLF, and multiple events per chunk. It validates a multi-result payload atomically with `z.array(OpportunityResult).min(2)` before calling the renderer. A malformed member, singleton array, object wrapper or broken JSON throws a user-visible error; no partial array is rendered. A single `result` becomes a one-element array in page state.

## Region numbering and integrity

The first occurrence of each region in context-view records establishes 1..N. Regions absent from the context follow in first tile-record appearance order. Tile records appearing earlier in the response do not outrank context records. Labels such as `a-label` and `z-label` are never sorted or interpreted. Empty region records retain their place and produce their own card.

`orderedPosterRegionIds()` carries a `ponytail:` comment: this is the model's reported reading order, not measured geometry. No coordinate extraction or prompt change was introduced.

For multiple regions, source identifiers are `<sourceId>:region:1`, `<sourceId>:region:2`, etc. Single-poster source identifiers remain unchanged. Every public date is checked against its owning transcription line and the result's source identifier. A cross-region classification association, or a mismatched internal region association, retains the date on its transcription owner's card as `other`, with review wording and `different_poster_region`. A missing/mismatched original line fails validation rather than publishing wrongly associated evidence. Endpoints are never borrowed from another card.

## Identity and persistence

Recognized image identity format:

```text
^urn:poster:sha256:[a-f0-9]{64}(:region:[1-9]\d*)?$
```

The full valid URN is returned unchanged, independent of title or due date. Region 1 and region 2 therefore have distinct identities, and repeated saves of region 1 upsert region 1. Existing case-insensitive matching is retained. Malformed hashed-poster identifiers, including `:region:0`, throw instead of falling back to a legacy title/date key. Legacy non-hash poster identifiers retain their existing fallback.

No database migration is necessary: `identity_key` is already text. PGlite verifies two saved opportunities with independent reminder rows, one-region re-save without duplication, isolation when one save is rejected, and `monitoringEnabled=false` for both uploads. Tests never connect to a real database.

## UI behavior

`app/page.tsx` stores `results: OpportunityResult[]`. `OpportunityCards` renders existing opportunity cards with `key={result.sources[0].url}`. One result retains the existing single-card layout. Several results are stacked with a small `Poster N of M` heading. No Save-all action exists.

Each existing card still owns its custom time, reminder planning, saving lock, saved flag and messages. Each Save calls the existing save path with only that card's result. One card's save failure stays in its own message state; it does not set a global saving flag. Unique React IDs prevent a reminder label on one card from focusing another card's input. The shared saved-opportunity list continues to refresh normally.

For a Vieworks + Doosan photograph: if context records report Vieworks first, the UI shows `Poster 1 of 2` with the Vieworks opportunity, its own deadline/evidence/Save/reminders, followed by `Poster 2 of 2` with the Doosan opportunity and its independent controls. If the reported order is reversed, numbering reverses. If one has no detected date, only that card shows `No visible date detected` and manual reminder input. The other retains automatic reminders. There is no synthetic multi-poster conflict.

This describes the implemented behavior, not a live verification of those particular posters or their dates. No recorded Vieworks + Doosan TRANSCRIBE/CLASSIFY JSON was supplied or found. The user was asked for its path. The committed JSON fixture is explicitly synthetic, contains generic titles and example dates, and is not presented as recorded model output.

## Verification

- Focused multi-poster, extraction and poster-pipeline checks: **100 passed**, three test files.
- New coverage includes context-first ordering, label-spelling mutation, tile-only and empty regions, date ownership, retained ranges, cross-region review, stable identities, region-zero rejection, independent PGlite saves, dated/undated cards, two Save buttons, unique label targets, atomic SSE validation, split UTF-8 and unchanged single/URL events.
- UI checks use offline React server rendering; no browser automation or network requests.
- Standalone TypeScript: PASS before final build.
- Changed-file lint (excluding the known pre-existing reminder-component failures): PASS.
- Full offline suite: **301/301 passed in 11 files**, 95.44 seconds.
- Final production Next.js build: PASS, including generated TypeScript checks.
- Repository-wide lint: three unchanged pre-existing errors in `components/OpportunityResult.tsx` (synchronous timezone setState in an effect and two Date.now calls during render), zero warnings.

## Files changed

Production:

- `app/page.tsx`: array state and card-list rendering.
- `components/OpportunityCards.tsx`: existing cards stacked and keyed by source.
- `components/OpportunityResult.tsx`: unique heading/reminder DOM IDs only.
- `lib/agent/stream.ts`: atomic single/multiple SSE decoding.
- `lib/agent/types.ts`: `results` event and array payload type.
- `lib/openai/extract-image.ts`: discriminate and emit single/multiple output.
- `lib/poster/classification.ts`: output union, removal of synthetic aggregation, region integrity.
- `lib/poster/pipeline.ts`: carry context-first region order.
- `lib/poster/transcription.ts`: deterministic region ordering and limitation comment.
- `lib/saved-events.ts`: full region-URN identity and invalid hashed-URN rejection.

Tests/docs:

- `tests/multi-poster.test.ts`
- `tests/fixtures/multi-poster-contract.json`
- `tests/poster-pipeline.test.ts` (typed contract updates)
- `tests/extraction-evidence.test.ts` (multi-result emission)
- `docs/multi-poster-opportunities.md` (this report)

No parser, prompt, tiling, database schema/migration, enum, monitoring, URL extraction, reminder delivery, authentication, Daytona or deployment configuration changes. No dependency added. No live model calls.

Commit hash is reported in the task response. Commit locally only; nothing pushed.
