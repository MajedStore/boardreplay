# Source-region coordinate contract

The current BoardReplay product displays original lecture photographs with contextual explanations directly below them. Source boxes are optional extraction/highlighting metadata and never position academic text in the document. This contract also records source-recovery and historical spatial-reconstruction compatibility details; its references to canvas events or the former board renderer describe retained historical data/regressions, not the current reading or PDF interface. The photographic document path is described in [ARCHITECTURE.md](ARCHITECTURE.md).

BoardReplay's internal source regions are optional rectangles `{imageId,x,y,width,height}` in the **complete EXIF-oriented, user-rotated photograph supplied for AI analysis**. `x`/`y` are the top-left corner, all values are fractions of that photograph, and positive width/height keep the rectangle within `[0,1] × [0,1]`. Digital-board layout is a separate coordinate space. Display CSS dimensions never determine source coordinates.

The current OpenAI, Gemini, and Anthropic photo prompts request `NORMALIZED` `XYWH` coordinates. Processing resizes the complete oriented photograph while preserving its aspect ratio; normalized coordinates therefore also identify the same region in the complete oriented source. Overview thumbnails do not establish a new crop origin. EXIF orientation and the user's saved rotation are applied during image preparation, so their already oriented AI coordinates must not be rotated a second time. Saved source rotation and aspect metadata select that same prepared view during replay/export.

`sourceView:{imageId,rotation,imageAspectRatio}` freezes the complete prepared view independently of a highlight. A missing or removed `sourceRegion` stays null, including image-crop fallbacks; the renderer shows the whole verified photo using that frozen orientation. The server does not invent a localized unit-square box merely to store orientation.

`normalizeSourceRegion` in `lib/photos/source-regions.ts` is the shared pure normalization boundary. It returns `{region,diagnostics}`. Null or omitted optional regions produce `region:null` without a warning. A malformed region produces `region:null` and a bounded diagnostic; surrounding text, evidence status, and independently verified photograph references remain the caller's responsibility and must not be discarded merely because localization failed. Diagnostics contain no raw provider payload, credentials, or source text.

An adapter using different geometry must explicitly pass its contract:

| Context | Input and conversion |
| --- | --- |
| `coordinateSpace: "NORMALIZED"` (default) | Fractional coordinates, no scale inference |
| `coordinateSpace: "PIXELS"` | Divide horizontal/vertical coordinates by the exact `width`/`height` of the canvas the provider saw; both dimensions are required |
| `coordinateSpace: "SCALE_1000"` | Divide each coordinate by exactly 1000 |
| `format: "XYWH"` (default) | `{x,y,width,height}`; zero or negative dimensions are invalid |
| `format: "XYXY"` | `{x1,y1,x2,y2}`; reversed corner pairs are sorted and diagnosed |
| `transform.flipX` / `flipY` | Explicitly mirror the normalized input frame |
| `transform.rotation` | Explicit clockwise 0/90/180/270-degree mapping from that input frame toward canonical source coordinates |
| `transform.crop` | After flips/rotation, map the local frame into this normalized canonical-source crop `{x,y,width,height}` |

The transform order is **normalize units → validate local bounds → flips → clockwise rotation → crop offset/scale → validate canonical bounds**. All four box corners are transformed and their enclosing axis-aligned rectangle is returned. These conversion options support explicitly declared adapters and are tested; current providers continue to use complete-image normalized coordinates. The utility does not infer pixel/0–1000 units, crops, EXIF flags, camera perspective, or rotation from numeric magnitudes. A coordinate value of `500` under the default normalized contract is invalid, not evidence of a 0–1000 contract.

The fixed boundary tolerance is **`1e-4` of the relevant normalized image dimension**, exported as `SOURCE_REGION_TOLERANCE`. Only endpoint errors within this tolerance may be clipped to 0 or 1, with `ROUNDING_ADJUSTED`. A severely negative/outside coordinate, invalid numeric value, missing coordinate, empty rectangle, or box with no positive intersection at the tolerance boundary is removed. No severe rectangle is blindly clamped into an apparently valid full-image crop.

`context.imageId` binds a known single-photo extraction when its box has no explicit ID. An explicitly different incoming ID is rejected rather than replaced. `allowedImageIds` restricts a region to independently verified supporting photographs; a missing ID without a single-photo binding is rejected when that list or `requireImageId:true` is supplied. An invalid photograph reference is diagnosed as `INVALID_IMAGE_REFERENCE` and must be surfaced as unresolved evidence by the caller. Removing a bad box is not permission to invent or substitute a source reference.

The integration regression in `tests/source-recovery-workflow.test.ts` uploads nine generated JPEG photographs through the real multipart route, applies mixed saved rotations, prepares real pixel/EXIF measurements, and executes the actual analysis, organization, photo-explanation, and persistence pipeline. Only the official OpenAI SDK response method is mocked; no network or real credential is used. Its authored observations contain missing, severely invalid, slightly out-of-bounds, and foreign-reference source boxes. Every original remains linked to a completed document explanation. The test verifies bounded calls without coordinate retries, zero extra calls on an identical cached rerun, incremental extraction persistence, and frozen per-photo orientation after a later source-manager rotation. This proves software recovery behavior, not live handwriting or chronology accuracy. Historical scene/crop tests remain separately for old reconstruction data.

## SDK parsing boundary

Model-facing JSON schemas remain strict. Each SDK passes raw JSON through the request's `normalizeOutput` hook before Zod checks the recovered content. OpenAI uses Responses `create` with the same strict `text.format` schema, then local parsing, so eager SDK parsing cannot reject an optional region before recovery. This follows the manual schema/parsing option in the [official OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Gemini and Anthropic use the same local parsing boundary. A bad box does not cause an additional request. Malformed core output or an inconsistent generated state gets at most one repair request within a shared two-attempt budget. State repairs receive an allowlisted fixed validation reason; failed parsed states remain isolated under diagnostic cache keys and are never replayed as valid checkpoints. Nonrecoverable provider/authentication/transport failures remain distinct from coordinate recovery.

## Source-recovery implementation history

The table below records the earlier source-recovery change. The photo-first product subsequently replaced the board UI with `components/lecture/LectureDocument.tsx`; retained source/scene libraries support historical data and tests.

| Area | Files |
| --- | --- |
| Coordinate contract | `lib/photos/source-regions.ts`, `SOURCE_REGIONS.md` |
| AI recovery and checkpoints | `lib/ai/output-recovery.ts`, `organized-pipeline.ts`, `index.ts`, `organization.ts`, `prompts/index.ts` |
| SDK parsing | `lib/ai/contracts.ts`, `parse-output.ts`, `providers/openai.ts`, `providers/gemini.ts`, `providers/anthropic.ts`, `errors.ts` |
| Persistence and saved geometry | `app/api/lessons/[id]/process/route.ts`, `lib/reconstruction/source-regions.ts`, `validate.ts`, `lib/validation/schemas.ts`, `lib/types.ts` |
| Fallback, native rendering, and retry UI | `components/board/SpatialBoard.tsx`, `FittedBoardContent.tsx`, `board.css`, `app/lessons/[id]/page.tsx` |
| Regression coverage | `tests/source-regions.test.ts`, `provider-output-recovery.test.ts`, `source-recovery-workflow.test.ts`, `board.test.ts`, `ai.test.ts`, `organization.test.ts`, `tests/e2e/source-recovery.spec.ts`, `tests/e2e/board-fit.spec.ts` |
| Verification and architecture | `README.md`, `ARCHITECTURE.md`, `VALIDATION.md` |
