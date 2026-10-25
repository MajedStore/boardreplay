# BoardReplay

**Unordered lecture photographs → AI organization → an explanation directly below every original photo.**

BoardReplay is a photographic university lecture organizer and explainer. The original whiteboard photographs remain the main educational material. The result is one continuous, readable document: a photo, its contextual explanation, then the next photo. Academic text uses normal document flow; the application does not recreate handwriting as floating elements on a digital canvas.

Real uploads use a configured vision provider. The separately labeled synthetic demo uses authored photos and explanations. Provider failures preserve original files, completed analysis, and the previous document; they never substitute sample content.

## Run locally

Use Node.js 24 and npm. This workspace uses Node 24.15.0, Next.js 16.4.3, React 19.3.1, and Prisma 7.10.1. SQLite and original uploads require a writable, persistent local filesystem.

```powershell
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run db:generate
npm run db:migrate
npm run demo:frames
npm run dev
```

Open **http://127.0.0.1:3000**. On macOS/Linux, copy `.env.example` to `.env` only for a new installation. Preserve an existing `.env`, database, and upload directory.

Development uses Webpack because local data changes caused repeated Turbopack refreshes in this Windows workspace. For a production build on a persistent local machine:

```powershell
npm run db:generate
npm run db:migrate
npm run build
npm run start
```

`db:migrate` applies all four checked-in migrations to new or existing installations:

1. Initial lessons, original uploads, processing runs, revisions, comparisons, and reports.
2. Frozen benchmark system instructions and wrapper version.
3. Photo organization and durable lesson-scoped analysis checkpoints.
4. Photo lecture documents and the explanation-context refresh flag.

Migrations retain existing lessons, original files, and historical reconstruction data. Old spatial/text reconstruction JSON remains available to compatibility and history code; the old canvas interface is removed. A lesson without a photo document can generate explanations from its existing photographs.

## Read an organized lecture

1. Drop photos on the home page or choose **Upload photos**. A lesson is created automatically. Multi-image selection and mobile camera capture are supported; lesson details are optional.
2. Start organization and explanation generation. Photographs may be uploaded in any order; automatic organization is the default. Missing credentials open **Connect AI**.
3. The app saves its actual progress through photo analysis, repeat detection, organization, and **Writing explanations**. It does not display invented completion percentages.
4. Read a continuous document with the lecture title, optional course, analyzed photo count, and each original photograph immediately followed by its own explanation. Every original remains accessible, including repeated captures.
5. Open a photograph to zoom, switch between photos, enter fullscreen where supported, or open its high-resolution original. Portrait and landscape photos preserve their proportions.
6. Use **Edit explanation** below a photograph to correct its heading or Markdown. LaTeX and fenced source code remain supported. Manual changes retain the earlier document in version history.
7. Use **Export PDF**, then the browser's **Print / Save as PDF** flow. The export contains the organized original photographs and their corresponding explanations, without a reconstruction canvas.

The reading view has a comfortable desktop width and uses the available mobile width. Explanations can expand naturally, without fixed-height academic text boxes or nested text scrollbars. Very long mathematical expressions adapt to the reading width. Photo management, ordering details, AI settings, processing history, and version history stay in optional dialogs; AI Comparison Lab remains separate.

## Ordering, repeats, and context

The vision stage compares actual photographed writing, layout, additions, corrections, diagrams, and overlap. Deterministic image measurements supply exact identity, perceptual similarity candidates, quality hints, and camera metadata when available. Filenames, upload order, and timestamps alone do not establish lecture chronology.

Exact copies and semantically repeated views are different cases. A perceptually similar photo with an added equation, corrected sign, new code line, or clearer obscured passage can carry important new information. Organization may group compatible views into captured states, but the final document still contains **every original photo exactly once**. A genuinely redundant capture receives a brief repeat note instead of another lengthy explanation. Complementary or corrected content receives its own explanation.

Explanations consider earlier explanations and related source observations in the same sequence. They describe what is visible, what becomes newly readable, and how the photographed material develops, rather than independently repeating a generic summary for each image. The default is the photographed lecture language, including academically appropriate Turkish. Explanations retain university-level notation and terminology and are labeled as derived commentary; uncertain or unreadable material remains identified.

Independent or weakly related groups carry an uncertainty note. Their display order is not asserted as a verified temporal or causal relationship. No system can recover writing erased before any photograph captured it.

### Correct the order

Use **Move earlier** or **Move later** below a result photo. The image and its linked explanation move together. The app records the correction and offers **Regenerate explanations** so the text follows the new context. The user-controlled order takes precedence when regenerating in manual mode.

Thumbnail drag ordering, accessible move controls, rotation, and removal remain available in **Manage photos**. Upload preparation can also explicitly select **Use this photo order as a manual correction**. Automatic organization remains the default unless a manual correction is selected.

Changing the order does not require repeating compatible expensive image extraction. **Analyze photos again** explicitly requests a fresh reading; ordinary retries and context updates reuse compatible checkpoints.

## How processing works

```text
Original upload
  → complete-image orientation and preparation
  → deterministic image metrics
  → per-photo vision observations
  → semantic similarity and chronological organization
  → contextual explanation for every ordered original
  → validated lecture document
  → reading view and matching print/PDF view
```

Originals are kept unchanged. Prepared JPEGs apply EXIF orientation and the saved user rotation, then fit the complete image within 2200 × 2200 pixels at quality 90. Organization uses smaller overview JPEGs fitted within 1120 × 1120 pixels at quality 75. No crop origin is introduced by resizing.

The same cached analysis/organization stages support the document path and retained historical compatibility code. The current processing route generates photo explanations directly; it does not generate a digital-board scene first. Each explanation has an explicit image ID, verified supporting photo IDs, relation to earlier material, evidence status, uncertainty, and frozen prepared-photo rotation/aspect. The result schema has no academic-text coordinates.

Optional source boxes belong only to extraction/highlighting metadata. Bad boxes are recovered or omitted without discarding otherwise valid recognized content. They do not control document layout. The explicit coordinate and recovery contract is recorded in [SOURCE_REGIONS.md](SOURCE_REGIONS.md).

## AI provider connection

Choose **Change AI** from the photo screen or lecture menu. Select OpenAI, Google Gemini, or Anthropic Claude and edit the model identifier. Connected providers retain the saved key when the key field is blank; a new provider requires its own key. The browser remembers only the selected provider ID across reloads.

Model settings apply to future runs across this server. Saved processing runs retain their original provider/model provenance. Saving settings does not start a paid request or test billing, permissions, quota, or connectivity. Generate explanations explicitly when ready.

The local configuration endpoint saves a server-side key to the ignored `.env` file and updates this running process immediately. It returns only public provider metadata. Keys are not returned or stored in browser storage. Alternatively, edit `.env` manually and restart the server. Never prefix keys with `NEXT_PUBLIC_` or commit `.env`.

| Provider | Server key | Model override | Repository default |
| --- | --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` | `gpt-5.4-mini` |
| Google Gemini | `GOOGLE_API_KEY` | `GEMINI_MODEL` | `gemini-3.6-flash` |
| Anthropic Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |

These are configuration defaults, not guarantees of current account availability. Choose a vision-capable model compatible with the adapter's structured-output format. Official adapters use OpenAI Responses with strict `text.format` and `store: false`, Gemini inline image data/JSON schema, and Anthropic image blocks with `output_config.format`.

## Processing bounds and persistence

- **20 photos per lesson**, **10 MB per file**, and **100 MB per upload request**. Supported files are JPG/JPEG, PNG, and WebP with decoded MIME/single-frame checks, at least 40 × 40 pixels, and a 40-million-pixel decode limit.
- Original decoding/preparation uses at most two concurrent workers. Vision-provider calls are sequential.
- Explanation calls handle at most four current photos and one preceding source photo: **at most five images per explanation request**. Organization may receive all bounded overview thumbnails.
- Every request has a **15 MB image-byte** budget and **120,000 prompt-character** limit. SDK output is capped at **16,000 tokens**, with a **90-second timeout** and at most **three total transient-failure attempts**. Structured output has a bounded repair attempt. These are application guardrails, not universal model capacities or cost guarantees.
- Analysis, organization, and explanation checkpoints are separate, lesson-scoped SQLite records keyed by pipeline/version, provider/model, content identity, and relevant context. Matching explanation retries make no new model call. Manual chronology changes invalidate affected explanation context while reusing compatible image analysis.
- Completed checkpoints survive a later failure. A fresh analysis option bypasses checkpoint reads. Successful regeneration and explanation edits preserve the previous document as a revision.
- Reordering result photos marks their explanations as needing a context refresh. Source upload/rotation/removal marks the saved lecture for updating. A failure preserves the prior document and originals.

Defaults are `DATABASE_URL="file:./data/boardreplay.db"` and `UPLOAD_DIR="./data/uploads"`. Back up the database and uploads together. Deleting a lesson removes its related records, caches, and stored original files.

Jobs use Node.js background work and in-process locks. A restart can interrupt a job; recovery marks it failed, while durable checkpoints support an explicit later retry. This is not a distributed worker queue.

## Demo and comparison

**Try a demo** opens synthetic lecture photographs with authored explanations. Additional subject examples cover code, diagrams, advanced notation, and prose/tables. They demonstrate the interface; their agreement is by construction and does not measure vision accuracy. `npm run demo:frames` regenerates synthetic image fixtures without a provider call.

AI Comparison Lab is a separate workflow. Saved common prompts, system instructions, wrapper versions, image IDs/order/rotations, raw responses, and human scores stay frozen. Manual submissions remain explicitly manual without fabricated API durations. Automatic submissions retain returned model identifiers and measured duration. Download the saved prepared photos to supply equivalent visible inputs in another interface; provider websites can still use different hidden instructions or image processing.

The editable academic report and CSV/JSON exports retain saved experimental context without inventing findings. Human rubric scores and exact text metrics do not independently establish academic, diagram, code, or chronology correctness.

## Verify the implementation

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests use generated image files and mocked providers for repeatability. They cover shuffled uploads, exact/near repeats, meaningful differences, occlusion, corrections, independent sequences, cached contextual explanations, Turkish/code/LaTeX, source validation, persistence, editing, responsive reading, and print layout. Recorded commands and observed results belong in [VALIDATION.md](VALIDATION.md). Design details are in [ARCHITECTURE.md](ARCHITECTURE.md).

A smoke check against an already running server:

```powershell
node scripts/smoke-provider.mjs
node scripts/smoke-provider.mjs --lesson <saved-lesson-id> --provider openai
```

Without `--lesson`, only public metadata is checked and no paid request starts. With an explicit lesson and configured provider, the CLI runs its real uploaded photos through organization/explanation generation, watches the saved run for up to 15 minutes, and reports the document/photo counts and returned model. Optional `--base-url` selects the server. Compare every explanation with its own original and review uncertain chronology; successful completion does not prove recognition or academic accuracy.

## Current limits

BoardReplay is a persistent **local single-user application without authentication** or shared-user isolation. Do not treat it as a public multi-user service. Ephemeral/serverless filesystems do not meet SQLite/local upload assumptions; hosted multi-user use needs a separate authentication, storage, isolation, and durable worker design.

Handwriting, dense notation, glare, perspective changes, incomplete camera coverage, and ambiguous lecture order remain difficult. Explanations are model-generated derived commentary and may need correction. There is no calibrated perspective registration, symbolic proof engine, circuit solver, or execution of photographed code. Code and Markdown are inert; raw HTML is not executed. Browser print pagination can vary; PDF export uses the browser rather than a separate server PDF service.
