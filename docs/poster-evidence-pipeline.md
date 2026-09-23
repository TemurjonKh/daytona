# Evidence-first poster extraction review

Status: offline implementation verified; live unseen-image acceptance blocked by missing inputs. Local commit only, no push. Work starts from `4c69d94`.

## Root failure and former production path

`InputCard -> streamInvestigation -> POST /api/investigate -> investigateImage` formerly sent the original upload to one combined vision extraction prompt. That task simultaneously transcribed, interpreted dates and summarized content. A date line omitted by that task never reached `normalizeDateCandidates`, so endpoint completion could not help. It also sent up to 10 MB to a route behind a smaller platform body limit, without browser orientation or controlled image views.

## Architecture and exact call behavior

1. Browser decodes with `createImageBitmap(file, {imageOrientation: 'from-image'})`, preserves aspect ratio, limits the long side to 4096 without enlargement, and encodes a JPEG from the decoded original.
2. Route validates prepared MIME/signature/size and safe metadata. Server applies `sharp().rotate()`, flattens transparency, and keeps oriented raw pixels as the source of every view.
3. Geometry creates context plus up to four overlapping tiles.
4. **TRANSCRIBE** receives all views, with a compact `{views:[{viewId,posterRegionId,lines:string[]}]}` schema and **24,000** output tokens. No interpretation or translation is requested.
5. Code detects non-stop finish reasons, invalid/incomplete JSON and missing view records. `length` always means `transcription_truncated`, even for parseable JSON. Complete records/line strings survive partial JSON; incomplete strings are never repaired or invented.
6. Code assigns line IDs, deduplicates within regions, discovers every date/time-bearing line, and parses candidates in `lib/dates/evidence.ts`.
7. **CLASSIFY** receives only the context image, ordered transcription, all evidence/candidate IDs and contextual years. Its output limit is **8,000**. It produces English summaries and ID-only role/label mappings; it cannot supply date values or rewrite quotes.
8. Code validates references, retains grounded range endpoints despite missing/null/wrong mappings, retains unclassified dates as `other`, separates regions, deduplicates dates, detects conflicts, and computes confidence.

A normal accepted upload uses exactly two model calls. No semantic retry, schema retry, model fallback, OCR provider, or third call exists. Invalid images/model setup fail before model calls; a failed first transport terminates the operation. Failure or invalid output of the second call retains parsed transcription evidence with low confidence. SDK retries are disabled.

The exact production prompts are in [lib/poster/prompts.ts](../lib/poster/prompts.ts). Their full text, rather than a second drifting copy, is the review source for TRANSCRIBE and CLASSIFY.

## Bounds, orientation, tiling and effective image resolution

- Accepted browser originals: JPEG/PNG/WebP, up to 30 MB; decoded pixel guard: 60 million. Smaller images are not enlarged.
- Prepared upload: at most **3,800,000 bytes**, leaving multipart/metadata headroom; route content-length guard: 4,000,000 bytes. Goal text is capped at 1,000 characters.
- Browser quality trials: 94%, 86%, 76%, 66%, stopping on the first fitting JPEG. Every trial uses the same original-pixel canvas, never the preceding JPEG. No hidden thumbnail substitute or resolution-reduction loop.
- EXIF is applied before browser canvas re-encoding strips metadata. Server rotation remains a safeguard for direct uploads.
- At or below 1024px long side: context only. Otherwise portrait/ordinary landscape use full-width horizontal strips: four rows for height/width >1.5, three otherwise.
- Aspect >2.5: three columns; >4: four columns. Adjacent tile overlap is approximately 10%, with integer rounding. No fixture-specific coordinates or text-density detector.
- Each view is JPEG <=1,500,000 bytes, encoded from oriented raw pixels. At most five images means <=7.5 MB binary / approximately 10 MB base64 in TRANSCRIBE; CLASSIFY uses one image.

Local OPENAI_MODEL is unset, so the existing default remains `gpt-4.1-mini`. Views are pre-sized to the documented high-detail bounds for the configured family. Unknown families fail explicitly instead of silently guessing. Per-view diagnostics report uploaded view dimensions, effective width/height, bytes, geometry and sizing rule.

Representative geometry (not live poster measurements):

| Oriented source | Context effective size, gpt-4.1-mini | Tiles | Tile effective size |
| --- | --- | --- | --- |
| 1200 x 2200 | 1117 x 2048 | Four horizontal strips | 1200 x 595 |
| 4096 x 900 | 2048 x 450 | Four columns | 1108 x 900 |
| 600 x 800 | 600 x 800 | None | N/A |

The checked [OpenAI image sizing table](https://developers.openai.com/api/docs/guides/images-vision#model-sizing-behavior) specifies a 2048px maximum dimension and 6144-patch budget for gpt-4.1-mini. The 2048/768 long/short-side rule belongs to the tile-based families, not this default model. The implementation also handles the documented 2500-patch high-detail families. Reported effective sizes are calculated from those rules, not telemetry returned by the model.

## Evidence, reading order, parsing and survival

- Normalized text is comparison-only; displayed quotes remain exact original transcription strings.
- A shorter normalized substring is absorbed into each applicable longer line within the same poster region. Its view/observation references are retained, but it cannot create its own partial date.
- Corroboration requires the same normalized full line in two distinct views, including a tile. Substring support alone does not corroborate a longer quote. Agreement is a confidence signal, not pixel verification or proof of authenticity.
- Context reading order is authoritative. Tile-only lines are inserted between same-tile context anchors. Without anchors, source rectangle plus within-view ordinal supplies a positional estimate. This is not a measured line bounding box.
- nearbyLabel uses only the same or immediately preceding non-date line within the region; unknown labels remain available. It never searches distant lines for an application label.
- Shared application/event vocabulary lives in `lib/dates/evidence.ts`. URL grounding already used the shared module at the baseline; there was no independent cutoff regex left to remove.
- Grounded contextual years are region-specific; conflicting years preserve unresolved evidence rather than inventing a year. Obvious copyright lines are excluded as context. A two-digit year without a grounded century stays unresolved; the computer clock never supplies it.
- Full numeric, Korean, English/month-name/ordinal and abbreviated same-month ranges are supported. Labelled contiguous rollover is bounded to 370 days. Weekday mismatch lowers confidence without deleting the date.
- Printed times without a usable timezone retain the date and exact printed quote. Explicit UTC/GMT/KST/JST/numeric offsets support timed values; other unhandled timezone forms conservatively stay date-only.
- Missing, null, duplicate, invented or cross-region classification references cannot remove discovered evidence. Invalid/ambiguous date parses remain visible with null values and internal rejection reasons.
- Multiple application closing dates trigger review rather than silently selecting a track. Separate poster results remain separate internally and use separate source URNs/labels in the existing aggregate public result. Multiple posters have no combined application URL and require review before a reminder selection.
- Confidence is computed in code and never exceeds medium for images. Missing mappings, unreadable/truncated text, unknown dates, weekday errors and conflicts lower it.

## Public UI and compatibility

Only upload limits, source-region display names and date-review copy changed. The result distinguishes no visible date, unreadable/incomplete transcription, uncertain dates, conflicting evidence and event dates. Exact quotes remain in Source evidence. Uncertain grounded dates are shown under Other important dates.

`ImportantDateKind`, `OpportunityResult`, saved-event/accepted schemas, database schema/migrations, authentication, storage, reminders, monitoring comparison/fingerprints and Daytona lifecycle are unchanged. Internal parser/transcription/diagnostic fields do not enter the stored public schema. URL extraction remains the existing exact 15,000-character path, with existing contextual-year confidence rules.

## Verification and fixture provenance

- Final production Next.js build: PASS, including TypeScript. Secret scan: no credential-like values found in tracked/proposed files; `.env.local` remains ignored.
- Final full offline suite: **256/256 passed in nine files (47.87 seconds)**.
- Focused extraction/date suite: 219/219 passed in four files.
- New poster suite contains 70 cases: geometry/overlap/tile cap, EXIF, sizing, browser quality trials, truncation recovery, context order, substring dedupe, tile-only date, conflicts, separate regions, all endpoint omission forms, date/time formats, non-deadline events, absent dates, low-resolution state, ID validation, title/language/dimension mutations, public schema compatibility, and two-call transport behavior.
- Existing monitoring/persistence tests passed in the full suite; no semantics were rewritten.
- Changed pipeline/parser/transport test lint: PASS. Repository lint remains blocked by three pre-existing errors in `components/OpportunityResult.tsx`: synchronous timezone setState in an effect and two Date.now calls during render. These reminder behaviors were not changed.
- Existing reconstructed Samsung and Hyundai fixtures were retained. No IBK/LIG/Inha/YBM fixture files were present in this checkout; no replacements were invented.
- No recorded two-call model responses were supplied. New offline responses are explicitly labelled simulations. They are not presented as recorded/live OCR output.

## Live acceptance, latency, cost and timeout

Inventory: `fixtures/unseen/` is absent; filenames: none. No previously failing local poster image was present either. Per the stop instruction, no web replacement images or paid live acceptance calls were used. The unseen folder is ignored to prevent accidental commits of private/unlicensed originals. No unseen image was committed.

| Requested measurement | Before | After |
| --- | --- | --- |
| Same-poster live latency | Not available | Not measured |
| TRANSCRIBE tokens/latency | N/A (combined call) | Not measured live |
| CLASSIFY tokens/latency | N/A (combined call) | Not measured live |
| Total input/output tokens | Not available | Not measured live |
| Actual API cost / cost multiplier | Not available | Not measured; no multiplier claimed |
| Slowest live test / measured runtime safety margin | Not available | Not available |

Safe runtime metrics now record browser/server preparation, transcription, classification, normalization and total time; per-call input/output/cached tokens; image count, dimensions and bytes. They never log images, base64, quotes, API keys or arbitrary environment contents. Original dimensions are browser-decoded, orientation-corrected dimensions. Browser metadata is client-reported, not trusted for server validation. The reported total is browser preparation plus server processing; network upload/download time is not measured. Pipeline return values expose evidence/candidates/mappings for a local acceptance harness without logging them in production.

Cost estimation is available for the default gpt-4.1-mini family using [documented pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini): $0.40/M input, $0.10/M cached input and $1.60/M output. Unknown pricing yields null, not a guess. Mock token assertions validate arithmetic only, not actual cost.

Previous `/api/investigate` route duration: not explicitly configured; its model call timeout was 45 seconds. New route duration: **120 seconds**, comprising two individually bounded **45-second** calls plus 30 seconds of preparation/response budget. This is a provisional finite budget, not a measurement-tuned production claim. The [Vercel limits](https://vercel.com/docs/functions/limitations) document 300 seconds for Node on Hobby Fluid Compute and a 4.5 MB body cap, which accommodate these configured bounds. The actual project's deployment mode/limits and live headroom remain unverified. No Vercel dashboard or deployment was changed.

## Files and remaining limits

Production changes: `lib/poster/{views,prepare-upload,preprocess,transcription,prompts,classification,presentation,pipeline}.ts`, `lib/dates/evidence.ts`, `lib/openai/extract-image.ts`, `lib/agent/stream.ts`, `app/api/investigate/route.ts`, `components/{InputCard,OpportunityResult,EvidenceList}.tsx`, `package.json`, `package-lock.json` (direct sharp dependency), and `.gitignore`. Tests: `tests/poster-pipeline.test.ts`, updated obsolete single-call mock in `tests/extraction-evidence.test.ts`. This report is the only new documentation file.

This pass cannot establish unseen-poster accuracy or real latency/cost without the supplied images. Vision can still omit/misread lines; cross-view agreement is not independent OCR. Region identity is model-transcribed. Tile-only placement without shared anchors is approximate. A century with no full-year evidence remains unknown. A timeout/refusal before any transcription cannot recover invisible evidence. No third call or external OCR was added to mask these limitations.

Commit hash is reported in the task's final response. Nothing is pushed; stop for review after the local commit.
