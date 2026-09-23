# Trailing-period numeric date parser correction

This is a narrow parser fix on top of `2f59935`. The proposed two regex changes were correct as written: add `\.?` before the existing numeric boundary guard in the three-part and month/day patterns. No other production code changes.

This only helps when the date line has already reached `lib/dates/evidence.ts`. It does not fix missing vision transcription. The existing two-call architecture remains intact. No live model call was made. No IBK production transcript was provided in this task, so its contents cannot be diagnosed here; if it contained no transcription text, this patch cannot affect that failure.

## Every requested table input: before and after

Notation: `token text (N)` means N valid readings. `[]` means no tokens. `(0)` is claimed-and-rejected, not accepted. Weekdays and trailing punctuation remain in token text under the existing `add()` contract.

| Input | Before | After |
| --- | --- | --- |
| `2026.8.28.(금)` | `[]` | `2026.8.28.(금) (1)` |
| `26.09.27.(일)` | `[]` | `26.09.27.(일) (1)` |
| `9.14.(월)` | `[]` | `9.14.(월) (1)` |
| `9.14. 10시` | `[]` | `9.14. (1)` |
| `26.09.01.(화) ~ 26.09.27.(일)` | `[]` | `26.09.01.(화) (1)`, `26.09.27.(일) (1)` |
| `Deadline is 2026.9.14. Apply now.` | `[]` | `2026.9.14. (1)` |
| `2026.8.28(금)` | `2026.8.28(금) (1)` | unchanged |
| `26.09.27(일)` | `26.09.27(일) (1)` | unchanged |
| `9.14(월)` | `9.14(월) (1)` | unchanged |
| `1.2.3.4` | `[]` | `[]` |
| `192.168.0.1` | `[]` | `[]` |
| `09.27.2026.5` | `[]` | `[]` |
| `version 1.2.3` | `1.2.3 (0)` | unchanged |
| `v2.6.1` | `2.6.1 (0)` | unchanged |
| `1.2.3.` | `[]` | `1.2.3. (0)` |
| `2026.13.40.` | `[]` | `2026.13.40. (0)` |

The pre-change table was captured by executing the unchanged parser with modern JavaScript iteration semantics. Post-change cases are explicitly asserted in the focused tests.

## Range, precision and evidence

For `모집일정 | 2026.8.28.(금) - 9.14.(월) 10시`, discovery now returns:

| Kind | Value | Year source | Reasons | Precision | Timezone |
| --- | --- | --- | --- | --- | --- |
| application_open | 2026-08-28 | inline_four_digit | none | date_only | null |
| deadline | 2026-09-14 | range_inherited_year | none | date_only | null |

The entire original Korean line, including `10시`, remains exact in `originalText`. The tests cover both `~` and `-`, each with and without trailing periods. No weekday mismatch occurs and no timezone is invented.

## Punctuation review before commit

The optional `\.?` can consume a sentence-ending period. That is harmless here: it includes the period in token.text while leaving date components, offsets and the complete original evidence correct. The period also lets `add()` reach a following weekday suffix. The existing negative lookahead still rejects digit/dot/slash/hyphen continuations, so four-part version/IP strings cannot become accepted three-part prefixes. Invalid three-part tokens remain claimed with zero readings, preventing two-part substring recovery. No harmful sentence-punctuation consumption was found in the required cases.

The existing behavior where zero-reading tokens create null-valued date evidence is deliberately unchanged and remains a separate follow-up.

## Tests and verification

- Focused: 19 tests passed (nine positive token cases, seven negative cases, two separator cases each checking both punctuation forms, one sentence-preservation case).
- Complete date/extraction suites: 238 tests passed across five files, including English month names, URL grounding, range completion and the poster pipeline.
- Full offline suite: **275/275 passed across ten files**, 95.46 seconds. No previously passing test failed.
- Production build: PASS. Standalone `npx tsc --noEmit` after build: PASS; no LayoutProps/typegen issue occurred.
- Changed-file lint: PASS. Repository-wide lint: three unchanged pre-existing errors in `components/OpportunityResult.tsx` (one synchronous setState in an effect, two Date.now calls during render), zero warnings. No unrelated fixes applied.
- Existing Samsung and HD Hyundai fixture files remain unchanged. No IBK, LIG, Inha or YBM fixture files exist in this checkout; no substitute fixture or success claim was invented.

## Files and scope

- `lib/dates/evidence.ts`: two regex-line edits only.
- `tests/trailing-period.test.ts`: focused offline regressions.
- `docs/trailing-period-parser.md`: this review and before/after report.

Prompts, preprocessing, tiling, storage schemas, enums, monitoring, reminders, UI, Daytona, Vercel and authentication are untouched. Local commit hash is reported in the task response. Nothing is pushed.
