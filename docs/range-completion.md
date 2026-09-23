# Evidence-derived application range completion

## Trace and provenance

No recorded Samsung raw structured model response was supplied or found in project fixtures or saved work files. The retained opening date alone cannot establish whether the actual model omitted the deadline, returned null, or returned a value later removed. That real-run diagnosis remains unverified. The existing Hyundai fixture is also explicitly reconstructed from the user's example, not a recorded model response.

Before this change, normalizeDateCandidates iterated only over supplied candidates; no code could create a missing endpoint. Its application labels also omitted 지원 모집 / 지원모집. For the provided source quote, a deadline candidate could therefore fail the cutoff check even when its month/day and contextual year were valid. These are confirmed code-path defects, not proof of which occurred in the missing recorded response.

The new Samsung fixture is labeled `recordedModelResponse: null` and contains a simulated omission plus exact request evidence. Tests separately exercise omitted, null, valid-but-old-validator-rejected, incorrect, both-null, end-only and mislabeled inputs. No model calls are used.

## Algorithm

- Validate raw candidates and keep candidateDecisions for diagnosis.
- Group only the same sourceUrl and whitespace-equivalent sourceText, retaining an original verbatim quote. Do not borrow context from another quote or poster.
- Parse contiguous ranges with a clear application-period label. Reject unresolved numeric alternatives, reversed/chained ranges, invalid dates and conflicting contextual years.
- Resolve both years from printed evidence, validated context, or the existing bounded range-year inheritance rule. For printed two-digit years without a full-year anchor, only a validated same-quote candidate may anchor the century. Never use the current year; yearless dates cannot borrow candidate years.
- Emit structured `rangeType: application`, normalized start/end decisions, verbatim sourceText and sourceUrl.
- Merge canonical English application_open/deadline entries. Replace null or wrongly labeled endpoint placeholders. Deduplicate by sourceUrl, role, normalized value and whitespace-normalized evidence fingerprint.
- Compute confidence from final decisions, while retaining raw validation decisions separately. Context-year URLs cap at medium; image evidence keeps its existing conservative cap.

Generated counterparts use date_only with timezone=null. A validated existing timed candidate is retained only if the quote visibly contains a timezone. Thus 17:00 remains in the original evidence without manufacturing KST, UTC, midnight or 23:59. An ordinary URL path does not count as an IANA timezone.

The parser requires at least one grounded range quote. If extraction returns no date evidence at all, the normalizer does not invent or search neighboring poster text. Event ranges do not generate application entries. Evidence with an unknown or generic cutoff-only label does not trigger completion.

## Fixture inputs and outputs

These are offline request examples, NOT captured raw model responses. Complete simulated drafts and expected public results are in the JSON fixtures.

### Context-year example

Quote: `지원 모집 : 09.08(화) ~ 09.15(화) 17:00`

Context: `2026년 하반기`, validated visibleYears `[2026]`.

| Simulated raw importantDates | Final normalized importantDates |
| --- | --- |
| application_open=2026-09-08; end omitted | application_open=2026-09-08; deadline=2026-09-15 |
| application_open=2026-09-08; deadline=null | same complete pair |
| application_open=2026-09-08; deadline=2026-09-15 (old literal-year check rejected this) | same complete pair |
| application_open=2026-09-08; deadline=2026-09-16 (incorrect candidate) | same evidence-supported pair |
| both values null, or only the end supplied | same complete pair |

Both final entries are date_only / explicit, with internal yearSource contextual_four_digit, timezone=null and the unchanged Korean quote. Generated labels are Applications open and Application deadline. The unmodified selectReminderTarget function chooses September 15 as primary.

### Two-digit-year example

Quote: `모집기간 26.09.01(화) ~ 26.09.27(일)`

Context: `2026년 하반기 HD현대삼호 신입사원 채용`.

Simulated raw importantDates: application_open=2026-09-01 and deadline=2026-09-27.

Final: the same two dates, date_only / explicit / inline_two_digit; no duplicate entries. Both fixtures pass the real normalizeImageResult and groundResult production functions, with no API calls.

## Files and scope

- `lib/dates/evidence.ts`: shared range parsing, flexible labels, safe completion, final confidence decisions and deduplication.
- `tests/range-completion.test.ts`: range-completion and safety cases through production normalization.
- `tests/fixtures/samsung-range-request-example.json`: explicitly simulated input and expected output.
- `tests/date-evidence.test.ts`: locate the deadline by kind rather than assuming it remains the first item after its missing opening is recovered.
- `docs/date-evidence.md` and this document: behavior, provenance and results.

No database, reminder, Daytona lifecycle, Vercel, notification, API schema or UI files are changed. The exact recorded Samsung and Hyundai raw responses remain required for real-run provenance verification.

## Verification

- `npm test`: 186 passed, 0 failed, across 8 files. This includes all 138 prior cases and 48 new range-completion cases.
- `npm run build`: PASS.
- `npx tsc --noEmit`: PASS, 0 diagnostics.
- ESLint: 3 unchanged pre-existing errors, 0 warnings.
- Both fixture shapes pass image and URL production normalization. The recovered deadline is selected by the existing reminder-target function.
- No live OpenAI/vision calls were made. Actual recorded-model provenance for both named examples remains unverified.
