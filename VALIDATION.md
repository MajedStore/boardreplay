# Validation record

Validated on 25 October 2026 in the Windows workspace with Node.js 24.15.0. This record describes the current photo-first product.

| Check | Result |
| --- | --- |
| `npm run db:generate` | Prisma 7.10.1 client generated |
| `npm run db:migrate` | All four migrations applied, preserving existing lessons, original images, runs, caches, and legacy reconstruction data |
| `npm test` | **223 tests passed across 14 suites** |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed without warnings |
| `npm run build` | Optimized production build passed |
| `npm run start` | Production server running at `http://127.0.0.1:3000` |
| `npm run test:e2e` against production | **11 passed in 25.6 seconds**, including nine shuffled uploads, repeats, Turkish/math/code, proportions, zoom, edits/revisions, order/regeneration, providers, failures, comparison, and matching export |
| `node scripts/screenshots.mjs` | Ten synthetic desktop/mobile screens refreshed; zero browser errors; visual inspection passed |
| `node scripts/verify-export.mjs` | Five-page photo document, 446,341 bytes, five photos and five explanations, zero KaTeX errors and zero canvases |
| Actual OpenAI nine-photo document | **COMPLETED**: nine original photos with nine Turkish explanations, two uncertain independent sequences, three proposed repeat groups |

## Actual saved lecture

The user's nine stored photographs were processed through the actual OpenAI connection already configured on this server. The initial photo-document run `cmvnnbxcb0000a4ucb2p1e6pg` completed using returned model `gpt-5.4-mini-2026-03-17`, retaining all nine originals and linking an explanation to each. It reused previously completed image observations and organization, then saved six bounded explanation batches for the nine photos. No spatial board-state requests were used to generate the new document.

The final reading copy uses brief notes for three photos classified by the real model as repeats; substantial complementary and correction explanations remain intact. Raw AI batch responses are preserved in checkpoints. Applying the final reading normalization through run `cmvnnif8o000078ucze5qw53f` completed from compatible checkpoints in under four seconds. The automated cache regression separately verifies zero additional provider calls for this normalization and for an identical rerun.

The live result language is `tr`. Conventional `\(...\)` and `\[...\]` mathematics is converted for rendering without altering fenced/inline source-code literals. Explanations are derived commentary, not claims that the professor spoke those words. Sequence uncertainty remains visible; job completion does not establish academic, transcription, duplicate-classification, or chronology accuracy.

The final real-document browser check found nine photo/explanation pairs in the correct DOM and visual order on desktop and mobile, 76 rendered math nodes, zero KaTeX errors, zero canvas/foreignObject elements, zero horizontal overflow, zero nested content scrollers, and zero page errors. Each of the three repeat notes is 120 characters. The real photographic PDF has 13 pages and 2,042,597 bytes. The first actual photo/explanation pair and synthetic desktop/mobile documents were visually inspected; PDF pages were also rendered for inspection. A final print rule keeps each photo label with its image across page breaks. The screenshot script filters the recent-lesson list to synthetic demos before capture so private titles and thumbnails never enter tracked screenshots.

Private screenshots and the user's PDF are kept only in ignored `tmp/photo-lecture-qa/`. Tracked screenshots and the exported sample PDF use synthetic fixtures exclusively. No key from the IDE selection was copied into project files or logs. Real-provider requests used only the existing server connection, as authorized by the requested verification.

## Repeatable software coverage

The new photo-document AI tests cover nine shuffled actual image fixtures, every source retained, short duplicate notes, complementary views, connected university-level Turkish mathematical/code explanations, independent-sequence context, verified per-photo sources, manual order context, bounded image batches, and zero canvas-generation calls. Compatible image analysis is reused when the order changes; explanation context is regenerated. Long repeat normalization preserves raw cache/context and leaves non-repeat content unchanged.

The upload-to-persistence integration uses nine generated JPEGs through real multipart upload, EXIF orientations 1/2/3/6/8, manual rotations 0/90/180/270, real resized processing images, metrics, the complete organization/explanation pipeline, and isolated SQLite. Only the official SDK response method is mocked. Missing, severe, and slightly invalid optional extraction boxes recover without losing content or causing coordinate retries. All nine explanations persist with the matching photograph, orientation, and aspect ratio; matching reruns add no provider calls.

Processing tests verify background stage persistence, operation locks, partial extraction checkpoints, failure recovery, fresh analysis, immutable prior versions, explanation editing, document revision restore, corrected photo order, and manual-context regeneration. Configuration tests use temporary files to verify exact credential preservation, model-only changes, atomic concurrent writes, control-character rejection, public metadata redaction, and cross-origin rejection. Automated tests never alter the workspace `.env` or use real credentials.

Coordinate tests cover explicit normalized/pixel/0–1000 units, full-image versus crop frames, rotations/mirroring, finite values, wrong image references, zero/reversed areas, and tolerance-limited rounding corrections. SDK tests verify recovery precedes strict parsing for OpenAI, Gemini, and Anthropic. See [SOURCE_REGIONS.md](SOURCE_REGIONS.md) for the explicit coordinate contract. Source regions are optional extraction metadata; they no longer position academic text in the interface.

Legacy history/source/identity tests remain to protect saved data. The spatial canvas, its player, canvas editors, and canvas stylesheet have been removed from the application. These historical backend tests do not imply that the current interface draws a reconstructed board.

## Practical limits

The current upload limit is 20 photographs, at most 10 MB each and 100 MB per upload. Processing uses bounded local Node.js background work and SQLite checkpoints, not a distributed queue. A restart may interrupt a running job; valid analysis remains available for retry. Dense lectures can exceed provider/output/prompt limits. Provider access, quota, latency, model availability, handwritten recognition, academic explanations, and chronology require human review. The local MVP has no multi-user authentication boundary.
