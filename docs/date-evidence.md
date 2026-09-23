# Shared date evidence

The old image and URL validators looked for the candidate's literal four-digit year in sourceText. They discarded valid two-digit/contextual dates while failing to compare printed month/day. Both pipelines now use pure functions in `lib/dates/evidence.ts` with no clock, network, parser dependency, or organization/layout-specific rules.

## Algorithm

1. Parse bounded visible tokens, retaining token spans and all valid numeric interpretations.
2. Check the structured candidate's calendar validity and match year/month/day. An inline four-digit year is strongest; an inline two-digit year must match the candidate's final two year digits. Exactly one numeric interpretation must match; indistinguishable matches are rejected.
3. For a yearless token, require separately preserved contextual evidence with one non-conflicting year, or inherit a printed range-start year. URL context must occur verbatim in the exact 15,000-character model slice. Only sourceText and yearContextText participate in contextual conflict checks, never the rest of the page. Image visibleYears must be supported by its context transcription; unsupported years are ignored and diagnosed.
4. A yearless end inherits only within a contiguous, labeled range. A December-to-January rollover can add one year, provided the end follows the start, no conflicting year is present, and the range is at most 370 days. Unrelated dates never inherit each other's years.
5. Shared local labels map application ranges to application_open/deadline and event ranges to event_start/event_end. The normalizer now also parses each grounded application-period quote independently of candidate count, completes missing endpoints, and deduplicates equivalent dates. See [range completion](range-completion.md). A standalone period label does not establish a deadline. Judging/interview/announcement evidence cannot become an application cutoff without explicit application wording.
6. Weekdays are diagnostic: mismatch sets weak=true and lowers confidence, without discarding a supported date. Without a printed time, output remains date_only. Existing explicitly marked URL inference remains opt-in and low confidence; images never invent a year.

## Supported formats

- Four- and two-digit year-first numeric dates: YYYY-M-D / YY-M-D with `-`, `.`, or `/`, including zero-padded variants.
- Month-first numeric dates: M/D/YY and M/D/YYYY, including zero-padded variants. Numeric alternatives are compared with the candidate, not selected by locale preference.
- Korean: YYYY년 M월 D일, YY년 M월 D일, and M월 D일 with validated context.
- Yearless M.D / MM.DD / M/D / MM/DD with validated context or a printed year inherited from the same range.
- English full month names and abbreviations (including Sep/Sept), month-first or day-first, optional ordinal suffixes, comma and abbreviation periods: September 27, 2026; Sep 27th; 27 September 2026; 27 Sept. Yearless forms require context or explicitly allowed inference.
- Ranges joined with `~`, `-`, `–`, `—`, `to`, `through`, `부터`, or `에서` (including a trailing `까지`).
- Korean weekday suffixes `(월)` through `(일)` and English weekday abbreviations/full suffix names. A weekday alone never supplies a date or year.
- Printed colon times, AM/PM, and Korean 시/분 are retained for supported date_time candidates with an explicit ISO offset. A date_time candidate without visible time is reduced to date_only.

Unrecognized or contradictory evidence is rejected with a reason; unsupported formats are not guessed. This is not a general natural-language date parser. Implicit-month shorthand such as `September 1–27` is not currently resolved.

## Internal contract and diagnostics

The internal extraction schema requires yearContextText (nullable string) and visibleYears (array). This follows OpenAI's [required nullable field convention](https://developers.openai.com/api/docs/guides/structured-outputs). The persisted OpportunityResult schema is unchanged; internal evidence fields are stripped after validation. Verbatim sourceText is never rewritten or translated.

The pure validator returns candidateValue, accepted, normalizedValue, precision, yearResolution, yearSource, weak, reasons, matchedToken, tokens and normalized kind. Tests/debug callers can inspect decisions. No source image, full poster text, API credential, or database URL is logged. Contextual URL years stay explicit but cap overall confidence at medium; image-only evidence retains its conservative cap.

## Hyundai example and provenance limitation

`tests/fixtures/hyundai-request-example.json` preserves the exact sample evidence supplied in the request:

- Date quote: 모집기간 26.09.01(화) ~ 26.09.27(일)
- Context quote: 2026년 하반기 HD현대삼호 신입사원 채용

It produces:

| Kind | Value | Precision | Public year resolution | Internal year source |
| --- | --- | --- | --- | --- |
| application_open | 2026-09-01 | date_only | explicit | inline_two_digit |
| deadline | 2026-09-27 | date_only | explicit | inline_two_digit |

The fixture is explicitly reconstructed from the request, NOT a recorded vision response. Its unrelated fields are empty. The original image and recorded model JSON were not supplied or found in the project. That exact-image regression remains unverified until the recorded response is provided; no vision/API calls were made to fabricate one.

## Verification and remaining ambiguity

Tests use offline evidence and mocked API responses, including original-byte/high-detail image transport, strict internal schemas, exact URL slice boundaries, conflicting/unsupported years, footer isolation, numeric ambiguity, range rollover, shared labels and confidence. Existing monitoring, database, reminder and Daytona tests remain unchanged.

Image context is still a vision transcription, not independently OCR-verified. No text-only algorithm can prove that a model took a year from the correct physical poster when its transcription omits the neighboring conflicting evidence. The prompt limits evidence to the dominant poster, and the validator rejects conflicting validated years. Wide/portrait/angled image quality still depends on the vision model; there are no crops, coordinates, resizing or layout-specific patches.

## Initial shared-validator verification and changed files

- Baseline: 37 existing tests passed in 5 files.
- Final: 138 tests passed, 0 failed, in 7 files (101 new cases plus all 37 existing cases).
- TypeScript: 0 errors. Production build: PASS.
- ESLint: 3 pre-existing errors in OpportunityResult.tsx, 0 warnings; no new lint errors.
- All API integration tests use mocks. No real OpenAI/vision calls were made.

Changed files:

- `lib/dates/evidence.ts`: pure token parsing, evidence validation and shared labels.
- `lib/openai/extraction-draft.ts`: internal context schema and shared extraction instructions.
- `lib/openai/extract-image.ts`: shared normalization and conservative image confidence.
- `lib/openai/extract-text.ts`: retain internal evidence until grounding.
- `lib/agent/grounding.ts`: verify quotes and call the shared normalizer.
- `lib/agent/confidence.ts` and `lib/agent/orchestrator.ts`: propagate the contextual-year confidence cap.
- `tests/date-evidence.test.ts` and `tests/extraction-evidence.test.ts`: offline format, provenance and pipeline tests.
- `tests/fixtures/hyundai-request-example.json`: explicitly labeled reconstructed example and expected public result.
- `README.md` and this document: current behavior, supported formats, verification and limitations.

No public schema, migration, reminder scheduler, Daytona lifecycle, deployment configuration, notification delivery or UI code was changed.
