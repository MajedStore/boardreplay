# BoardReplay architecture

BoardReplay organizes real university lecture photographs and writes a contextual explanation directly below each original. Its primary artifact is a photo lecture document, not a reconstructed drawing canvas. Academic text, LaTeX, code, and lists render in normal document flow. Original photos retain their proportions and remain available at high resolution.

## Main data flow

```text
Multipart photo upload
  → validate and retain original bytes
  → EXIF orientation + saved user rotation + complete-image resize
  → deterministic metrics and per-photo vision observations
  → semantic duplicate/overlap and chronology organization
  → bounded contextual per-photo explanations
  → document/source validation and atomic persistence
  → continuous lecture reading view
  → shared photo/explanation print view and browser PDF
```

`app/api/lessons/[id]/process/route.ts` claims a lesson operation, creates a saved processing run and source snapshot, prepares real images, and calls `explainLesson`. `lib/ai/photo-document.ts` is the current product pipeline. It uses `analyzeAndOrganize` from `organized-pipeline.ts`, then generates explanations directly. It does not call the retained spatial state generator.

Existing internal status values remain stable for persistence and locking. The reading UI presents analysis, repeat detection, organization, and writing explanations in plain language; internal `RECONSTRUCTING` means explanation generation in this workflow. Original inputs, completed checkpoints, and an existing document survive failed attempts.

## Original and prepared images

Original files are stored unchanged under the configured upload directory; SQLite stores opaque IDs, filenames, sequence, dimensions, rotation, and storage paths. Decoding validates MIME, dimensions, and single-frame input. Original filenames are display metadata, never chronology evidence.

Prepared images apply camera EXIF orientation, then the saved 0/90/180/270-degree user rotation. The complete result is fitted within 2200 × 2200 pixels at JPEG quality 90. Organization uses complete-image thumbnails fitted within 1120 × 1120 at quality 75. Resizing does not introduce a crop origin.

The saved `PhotoExplanation.rotation` and `imageAspectRatio` freeze the prepared view used for that generated explanation. The source image ID remains separate from its browser URL. A later source-management rotation does not silently change the orientation of an already saved document; the lesson instead indicates that an update is needed. The original file remains independently accessible.

Optional extraction source regions use normalized coordinates in the complete, oriented prepared photograph. They help source analysis or historical highlighting; they do not determine document layout. Source-region recovery runs before strict schemas. Bad boxes can be dropped while recognized content and independently verified photo references remain. Alternate coordinate units or transforms must be declared explicitly, never inferred from numeric range. Details and historical regression context are in [SOURCE_REGIONS.md](SOURCE_REGIONS.md).

## Deterministic measurements

`lib/photos/metrics.ts` records original/prepared SHA-256, decoded-pixel identity, 256-bit perceptual fingerprints, dimensions, Laplacian sharpness variance, exposure measurements, and a heuristic quality score. A bounded EXIF reader records capture time when available, distinguishing an explicit offset from unverified camera-local time.

Pairwise comparisons are bounded by the 20-photo lesson limit. Exact decoded identity can reuse observation work. Perceptual similarity supplies candidates for semantic comparison and never establishes that two photos contain identical academic information. Sharpness/exposure scores do not prove readability, glare, blankness, or that a photograph may be discarded.

## Vision observations and organization

Every distinct prepared view is analyzed by the selected vision provider. Typed observations retain mixed prose, equations, code, diagrams, corrections, unreadable passages, and visible quality/coverage/occlusion assessments. Local item identifiers are scoped to one photograph and are not cross-photo identities.

Organization receives actual overview images, observations, and deterministic measurements. It compares visible writing, meaningful additions, corrections, erased material, overlap, and coverage. Upload order, opaque IDs, labels, filenames, and timestamps alone cannot prove chronology.

`PhotoOrganization` contains independent sequences, ordered captured-state groups, selected primary views, repeat groups, source relationships, confidence, and uncertainty. A grouped state must have connected non-low same-state evidence or exact-pixel support. Unsupported grouping, hidden progression, cycles, invalid membership, and unverified source IDs are rejected or kept separate according to the organization validator.

Repeat groups distinguish `EXACT`, `SAME_STATE`, and `POSSIBLE`. A primary view is chosen for useful visible evidence; complementary views can reveal writing obscured elsewhere. A nearly identical photograph with an added equation, changed sign, corrected code line, or clearer passage may require a distinct explanation. No deduplication operation deletes an original.

Independent or weakly related groups preserve uncertainty. Display order between independent sequences is not asserted as a verified chronology, an erasure, or a spoken causal transition. The product does not recover never-photographed writing.

## Contextual explanations

The new wire schema `photoExplanationsSchema` contains one entry per requested original: image ID, optional heading, Markdown body, relation, explanatory evidence status, uncertainty, and supporting photo IDs. It has no source box, digital canvas coordinates, or drawing events.

The pipeline visits the organized sequences and their captured states. Within a state it presents the primary view and then the other originals, retaining every photo exactly once. Each call covers at most four current photos plus one preceding source photo. Context includes related observations, state/repeat evidence, earlier explanations from the same sequence, and the permitted source IDs. Earlier unrelated sequence explanations are excluded.

The explanatory prompt preserves the original lecture language by default, including Turkish, and the university level of the photographed subject. It supports differential equations, linear algebra, physics, electrical engineering, code, data structures, chemistry, prose, tables, and diagrams without assuming every board is mathematics. It asks what is visible, what is new or newly readable, how the material develops, and which prior statement is corrected. Explanations avoid repeating unchanged material; a verified redundant capture receives a brief repeat note. Overlap alone does not justify a repeat classification.

Explanatory prose is `DERIVED` commentary grounded in cited visible evidence. It must not impersonate the professor's words or invent illegible symbols, missing equations, topology, or hidden intermediate work. `UNCERTAIN` entries require a limitation, and manual corrections become `USER_EDITED`. Mathematical expressions use LaTeX and programming snippets use fenced code. Markdown/raw source code is inert; raw HTML is not executed.

Response validation requires exactly the requested photo IDs in the requested order and verified sources. Each explanation cites its own photograph. Additional citations can use current-state or earlier same-sequence evidence; future/unrelated sequence sources are excluded. Invalid generated output never acquires a replacement photo attribution. Content with valid sources can remain useful even when optional extraction boxes are unavailable.

## Document contract and persistence

`Lesson.document` stores `LectureDocument` JSON with:

- `schemaVersion: 1`, title, overview, and language.
- Saved organization and an ordered `photos` array.
- One `PhotoExplanation` per original photo: opaque entry/source IDs, sequence ID, heading, Markdown, relation, evidence status, uncertainty, supporting photo IDs, and frozen rotation/aspect.
- Review notes and unresolved information.

`validateLectureDocument` checks the persisted schema, unique entry IDs, exactly-once coverage of every current original, verified source references, and required uncertainty explanations. The processing route stamps actual prepared orientation/aspect before validation. Successful document persistence, run completion, extraction results, and previous-document revisions are committed atomically.

There are four checked-in migrations: initial data, benchmark snapshots, photo organization/checkpoints, and photo lecture document/context-refresh fields. Existing uploads and historical reconstruction JSON are retained. `ReconstructionRevision` continues as the storage table name; document revisions use an explicit `PHOTO_LECTURE` envelope. Restoring a document also saves the current one and refuses a revision whose sources are unavailable.

The result's move controls reorder `document.photos`, keeping an explanation linked to its photo. Manual order is saved and marks `explanationsNeedRefresh`. Regeneration takes that corrected order as its context. An explanation edit keeps source identity, marks the entry `USER_EDITED`, and saves the prior document. Upload/rotate/remove operations mark affected results for updating rather than quietly substituting new pixels under old explanatory claims.

## Reading, original viewing, and export

`components/lecture/LectureDocument.tsx` is shared by the reading and print routes. Each article contains its original photograph and immediately following explanation. It uses standard flow, natural text height, and a comfortable maximum reading width. Portrait and landscape photos use their own saved aspect ratio. Long mathematical expressions adapt within the reading width rather than creating nested text scrollbars.

The primary view has no spatial canvas, required player, floating academic elements, absolute text placement, or permanent three-column layout. Photo viewing supplies zoom, next/previous, browser fullscreen where available, and an original-resolution link. Editing, ordering review, AI configuration, processing history, and version history are secondary dialogs. AI Comparison Lab is a separate route.

The print route renders the same organized photograph/explanation sequence, title, course, and notes. Print styles use sensible breaks and keep a photo with its explanation where the pair reasonably fits; long material may span pages. Export uses browser Print / Save as PDF, not a separate server PDF service. The old board canvas is not exported.

## Caches, request bounds, and jobs

`lib/photos/cache.ts` persists lesson-scoped checkpoints in SQLite. Measurement keys include original hash, rotation, and metric version, with prepared-byte identity checked before reuse. Vision observation and organization keys retain their existing version/identity contract. Explanation keys add their own version, provider/model, relevant content, lecture metadata, organized context, and preceding explanations.

Passing only stable lecture metadata into generation prevents mutable status, timestamps, and the previous result from invalidating otherwise reusable checkpoints. Matching explanation retries use saved work. Corrected context generates new explanation keys without repeating compatible expensive extraction or organization. Every cached AI response undergoes current schema and semantic validation before use. `Analyze photos again` explicitly bypasses cache reads.

Processing limits are:

| Boundary | Current application guardrail |
| --- | --- |
| Uploads | 20 photos/lesson, 10 MB/file, 100 MB/request; JPG/PNG/WebP, single frame, at least 40 × 40 pixels, 40-million-pixel decode limit |
| Preparation concurrency | At most two original-image workers |
| Provider concurrency | Sequential requests |
| Explanation image batch | At most four current photos plus one preceding photo |
| Request budget | 15 MB image bytes and 120,000 prompt characters |
| Output/timeout | 16,000 SDK output tokens and 90 seconds/request |
| Transient failures | At most three total attempts |
| Structured repair | Bounded extra attempt; optional source boxes recover locally without another model request |

These are application bounds, not universal provider capacities, prices, or quality guarantees. A fresh run may use one observation call per distinct prepared view, organization, and multiple explanation batches. Costs depend on material, grouping, context, model, retries, and reusable work. Failed later stages preserve completed checkpoints and the previous document.

Node.js `after()` schedules local work and in-process operation locks protect conflicting mutations. A restart can interrupt a job; recovery marks it failed for an explicit retry. Durable checkpoints are retained, but there is no distributed queue, automatic worker resumption, or multi-machine concurrency design.

## Provider configuration and comparison boundaries

OpenAI Responses, Google Gemini, and Anthropic Claude implement the shared provider contract. Strict model-facing schemas remain, while local recovery runs before Zod parsing where optional extraction metadata needs repair. Model settings apply to future runs across the app; saved processing runs retain their returned provider/model provenance.

The local Connect/Change AI endpoint serializes atomic writes to the ignored `.env` file and updates the running process. It rejects raw newline/control input before trimming and verifies exact dotenv serialization. An omitted/blank replacement key preserves an existing configured credential; new providers require their own key. Public responses contain only provider ID, name, model, and configured state. Browser storage remembers the provider ID and theme, never API keys. Saving settings does not start a request or establish billing, quota, connectivity, or permissions.

Comparison Lab retains frozen common prompt/system/wrapper snapshots, saved source presentation, raw outputs, measured API duration, and human evaluation. Manual submissions remain manual without fabricated duration. Existing benchmarks are not rewritten by the new product's explanatory prompt. Provider websites may use different hidden instructions or image transformations even with equivalent supplied text and image bytes. Rubric scores and exact reference metrics are not independent proofs of academic or chronology correctness.

## Compatibility, security, and verification limits

Historical spatial/text JSON and event-validation libraries remain for old data, revisions, and regression coverage. Their old drawing UI and canvas CSS are removed from the current product. Existing lessons without a document retain their originals and can generate the new photo-first explanation result; no migration pretends historical board events were newly generated contextual explanations.

The application assumes persistent local SQLite and uploads. Back them up together. It remains a single-user local workspace without authentication, tenant isolation, collaboration, or ephemeral-serverless persistence support. Serving it as a public multi-user application requires a separate authentication/storage/worker/isolation design.

Automated tests use realistic generated images and mocked providers to verify workflow behavior, source consistency, language/context handling, caching, editing, layout, and export. The synthetic demo is authored example material, not an AI experiment. Actual commands, counts, and any real-provider observations are recorded in [VALIDATION.md](VALIDATION.md). Passing software checks or a completed real request does not establish handwriting recognition, explanation accuracy, or verified lecture chronology.

Perspective calibration, exact lecture timing/speech, offline OCR, semantic circuit solving, symbolic proof checking, and execution of photographed code are outside the current implementation. Dense handwriting, camera glare, occlusion, and missing coverage can remain unresolved; the photographs remain the primary study source.
