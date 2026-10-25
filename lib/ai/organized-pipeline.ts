import "server-only";
import sharp from "sharp";
import type { Reconstruction, ReconstructionStep } from "../types";
import type { PhotoMetrics } from "../photos/metrics";
import { compareAllPhotoMetrics } from "../photos/metrics";
import { getBoardScene } from "../board/scene";
import { validateReconstruction } from "../reconstruction/validate";
import type { AiProvider, GenerateRequest, GenerateResult, VisionImage } from "./contracts";
import type { ReconstructionRequest, ReconstructionResult } from "./index";
import { AiError, withBoundedRetry } from "./errors";
import { EVIDENCE_SYSTEM_PROMPT, EXTRACTION_PROMPT, organizationPrompt, stateReconstructionPrompt } from "./prompts";
import { aiReconstructionSchema, photoObservationSchema, photoOrganizationSchema, type ImageExtraction } from "./wire-schemas";
import { PHOTO_PIPELINE_VERSION, digest, pixelFingerprint, applyManualPhotoOrder, validatePhotoOrganization } from "./organization";
import { normalizeObservationOutput, normalizeReconstructionOutput } from "./output-recovery";

export interface AnalysisCache {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
}
const PROMPT_CHARACTER_LIMIT = 120_000;
const MAX_CALL_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_ACTIVE_ELEMENTS = 400;
class StructuredOutputError extends AiError {
  constructor() { super("INVALID_OUTPUT", "The provider could not return usable structured data after one repair attempt. Your source photographs and completed analysis are saved."); }
}
const stateValidationMessages = new Set([
  "An incremental reconstruction must return exactly the requested state.",
  "The state cites an unrelated or unavailable photograph.",
  "Unreadable or occluded photos cannot establish erasures, corrections, or new transcribed content.",
  "A complementary chunk cannot invent a chronological correction or erasure.",
  "A nonblank state has no visible reconstruction.",
  "A blank board was not cleared.",
  "Unreadable content needs its actual uncertain source crop.",
  "Section IDs must be unique.", "A spatial reconstruction is required.",
  "Step IDs must be unique.", "Every moment must reference an existing section.",
  "A moment references an image outside this lesson.",
  "Each spatial moment must contain a board change array.", "Change IDs must be unique.",
  "NEW_TOPIC has no target or element payload.",
  "ERASE must reference an active element without a new payload.",
  "UNCHANGED must reference an active element without a new payload.",
  "A visible change requires a complete element.",
  "ADD requires a never-used element ID and no target.",
  "MODIFY and CORRECT must keep the active target identity.",
  "Element source references must belong to this lesson and its captured moment.",
  "Every automatic element must cite photographed evidence.",
  "Element layout extends outside its normalized canvas.",
  "Uncertain automatic elements must describe the ambiguity.",
  "A connection references an element absent from the current board.",
  "A connection needs observed points or two active endpoints.",
]);
function stateValidationDiagnostic(error: unknown) {
  // Only fixed validator text is safe to reuse; SDK/schema details may contain source material.
  const message = error instanceof Error && stateValidationMessages.has(error.message) ? error.message : "The generated state did not satisfy source, chronology, geometry, or change consistency checks.";
  return { code: "STATE_CONSISTENCY", message };
}
class StateValidationError extends AiError {
  constructor(readonly diagnostic: ReturnType<typeof stateValidationDiagnostic>) {
    super("INVALID_OUTPUT", `The generated board state remained inconsistent after its bounded repair. ${diagnostic.message} Your sources and completed analysis are saved.`);
  }
}

function checkBudget(request: GenerateRequest<unknown>) {
  if (request.prompt.length > PROMPT_CHARACTER_LIMIT || request.images.reduce((size, image) => size + image.base64.length * 0.75, 0) > MAX_CALL_IMAGE_BYTES) {
    throw new AiError("INVALID_INPUT", "This board set is too dense for one safe processing request. Split the lecture into smaller sets or use clearer, tighter board photos. Your originals and previous notes are preserved.");
  }
}
export async function generated<T>(request: ReconstructionRequest, provider: AiProvider, stage: string, input: GenerateRequest<T>, identity: unknown, accept?: (value: T) => void): Promise<GenerateResult<T>> {
  checkBudget(input as GenerateRequest<unknown>);
  const key = digest({ version: PHOTO_PIPELINE_VERSION, provider: provider.id, model: provider.model, stage, identity });
  const cached = await request.cache?.get(key);
  if (cached && typeof cached === "object" && "structuredOutput" in cached && "model" in cached) {
    const parsed = input.schema?.safeParse(input.normalizeOutput ? input.normalizeOutput(cached.structuredOutput) : cached.structuredOutput);
    if (parsed?.success && typeof cached.model === "string") {
      try { accept?.(parsed.data); return { structuredOutput: parsed.data, rawOutput: JSON.stringify(parsed.data), model: cached.model }; }
      catch (error) {
        if (stage === "state") await request.cache?.set(`diagnostic:${key}`, { stage, source: "CACHE", attempt: 0, model: cached.model, structuredOutput: parsed.data, diagnostic: stateValidationDiagnostic(error) });
        // Invalid semantic checkpoints are replaced, never replayed indefinitely.
      }
    }
  }
  let response: GenerateResult<T> | undefined;
  let parsed: T | undefined;
  let repairReason = "The previous response did not match the required structured JSON schema.";
  for (let attempt = 0; attempt < 2; attempt++) {
    const call = attempt === 0 ? input : { ...input, prompt: `${input.prompt}\n${repairReason} Return one complete schema-conforming response for the requested state using only the supplied photographs and immutable prior scene. Correct the reported consistency problem without inventing content or changing the requested chronology. Preserve visible content; sourceRegion may be null when exact localization is unavailable.` };
    checkBudget(call as GenerateRequest<unknown>);
    try {
      response = await withBoundedRetry(() => provider.generate(call));
      // Local source recovery runs before strict parsing, including mocked providers and persisted checkpoints.
      parsed = input.schema!.parse(input.normalizeOutput ? input.normalizeOutput(response.structuredOutput) : response.structuredOutput);
      if (stage === "state") {
        try { accept?.(parsed); }
        catch (error) {
          const diagnostic = stateValidationDiagnostic(error);
          await request.cache?.set(`diagnostic:${key}`, { stage, source: "PROVIDER", attempt: attempt + 1, model: response.model, structuredOutput: parsed, diagnostic });
          throw new StateValidationError(diagnostic);
        }
      }
      break;
    } catch (error) {
      if (error instanceof StateValidationError) {
        repairReason = `The previous state failed a consistency check: ${error.diagnostic.message}`;
        if (attempt === 1) throw error;
        continue;
      }
      const structural = (error instanceof AiError && error.code === "INVALID_OUTPUT") || (error instanceof Error && ["ZodError", "SyntaxError"].includes(error.name));
      if (!structural) throw error;
      if (attempt === 1) throw new StructuredOutputError();
    }
  }
  if (!response || parsed === undefined) throw new StructuredOutputError();
  // Optional coordinates are already recovered locally and never trigger another paid call.
  if (stage !== "state") accept?.(parsed);
  await request.cache?.set(key, { structuredOutput: parsed, model: response.model });
  return { ...response, structuredOutput: parsed };
}
function parsedObservation(value: unknown, image: VisionImage, validate: (value: ImageExtraction) => void): ImageExtraction {
  const data = photoObservationSchema.parse(value);
  if (data.boardState === "BLANK" && data.items.length) throw new Error("A blank-board claim contradicts its visible items.");
  if (data.boardState === "BLANK" && (data.visualAssessment.visibleBoardFraction !== 1 || data.visualAssessment.occlusions.length > 0)) {
    data.boardState = "UNREADABLE";
    data.unreadableRegions = union([...data.unreadableRegions, "This empty-looking photo does not establish a complete, unobstructed blank board. Hidden or out-of-frame writing cannot be treated as erased."]);
  }
  if ((data.boardState === "CONTENT" && !data.items.length) || (data.boardState === "UNREADABLE" && !data.unreadableRegions.length) || (data.boardState === "BLANK" && (data.items.length || data.unreadableRegions.length))) throw new Error("The photo observation contradicts its visible board state.");
  const observation = { ...data, imageId: image.id, sequence: image.sequence };
  validate(observation);
  return observation;
}
async function comparisonImage(image: VisionImage): Promise<VisionImage> {
  const buffer = await sharp(Buffer.from(image.base64, "base64"), { limitInputPixels: 40_000_000 }).resize({ width: 1120, height: 1120, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
  return { ...image, mimeType: "image/jpeg", base64: buffer.toString("base64") };
}
function union<T>(values: T[]) { return [...new Set(values)]; }
function safeSourceContext(images: VisionImage[], ids: string[], anchorIds: string[]) {
  return union([...ids, ...anchorIds]).map((id) => images.find((image) => image.id === id)!).filter(Boolean);
}

export async function analyzeAndOrganize(request: ReconstructionRequest, provider: AiProvider, validateObservation: (observation: ImageExtraction) => void) {
  const images = request.images;
  const metrics: PhotoMetrics[] = request.photoMetrics || [];
  if (metrics.length && (metrics.length !== images.length || metrics.some((item) => !images.some((image) => image.id === item.imageId)))) throw new AiError("INVALID_INPUT", "Image measurements do not match the uploaded set.");
  const extractions: ImageExtraction[] = [];
  let model = provider.model;
  const exact = new Map<string, ImageExtraction>();
  await request.onStage?.("ANALYZING");
  // Sequential requests cap concurrency at one and checkpoint each expensive observation.
  for (const image of images) {
    const fingerprint = pixelFingerprint(image, metrics);
    const prior = exact.get(fingerprint);
    let observation: ImageExtraction;
    if (prior) observation = { ...structuredClone(prior), imageId: image.id, sequence: image.sequence };
    else {
      try {
        const response = await generated(request, provider, "observation", { system: EVIDENCE_SYSTEM_PROMPT, prompt: EXTRACTION_PROMPT, images: [image], schema: photoObservationSchema, schemaName: "board_observation", normalizeOutput: (value) => normalizeObservationOutput(value, image) }, fingerprint, (value) => { parsedObservation(value, image, validateObservation); });
        model = response.model;
        observation = parsedObservation(response.structuredOutput, image, validateObservation);
      } catch (error) {
        if (!(error instanceof StructuredOutputError)) throw error;
        observation = { imageId: image.id, sequence: image.sequence, language: "Unknown", boardState: "UNREADABLE", disciplines: [], boardAspectRatio: null, items: [], boardOverview: "The original photo is available, but the provider's extraction could not be verified.", unreadableRegions: ["[Source recovery:EXTRACTION_UNAVAILABLE] A structured extraction could not be recovered after one repair attempt. No transcription or erasure is inferred from this failure."], visualAssessment: { boardBounds: null, readableFraction: null, visibleBoardFraction: null, qualityNotes: ["[Source recovery:EXTRACTION_UNAVAILABLE] Exact extraction was unavailable; the actual photograph is retained for review."], occlusions: [] } };
      }
      exact.set(fingerprint, observation);
    }
    extractions.push(observation);
    await request.onExtraction?.(observation);
  }
  await request.onStage?.("FINDING_DUPLICATES");
  const canonicalMetrics = [...metrics].sort((left, right) => left.imageId.localeCompare(right.imageId));
  const comparisons = canonicalMetrics.length ? compareAllPhotoMetrics(canonicalMetrics) : [];
  await request.onStage?.("ORGANIZING");
  // Opaque ID sorting controls presentation only; upload order is deliberately absent from reasoning.
  const overviewImages: VisionImage[] = [];
  for (const image of [...images].sort((left, right) => left.id.localeCompare(right.id))) overviewImages.push(await comparisonImage(image));
  const canonicalObservations = [...extractions].sort((left, right) => left.imageId.localeCompare(right.imageId));
  const organizationInput = { system: EVIDENCE_SYSTEM_PROMPT, prompt: organizationPrompt(canonicalObservations, { photos: canonicalMetrics, comparisons }), images: overviewImages.map((image, index) => ({ ...image, sequence: index })), schema: photoOrganizationSchema, schemaName: "organized_photos" };
  const organized = await generated(request, provider, "organization", organizationInput, { observations: canonicalObservations.map((item) => ({ ...item, sequence: undefined })), metrics: canonicalMetrics, images: overviewImages.map((image) => [image.id, pixelFingerprint(image, metrics)]) }, (value) => { validatePhotoOrganization(value, images, extractions, metrics); });
  model = organized.model;
  let organization = validatePhotoOrganization(organized.structuredOutput, images, extractions, metrics);
  if (request.organizationMode === "MANUAL") organization = applyManualPhotoOrder(organization, images);
  await request.onOrganization?.(organization);
  return { extractions, organization, model };
}

export async function reconstructOrganized(request: ReconstructionRequest, provider: AiProvider, validateObservation: (observation: ImageExtraction) => void): Promise<ReconstructionResult> {
  const images = request.images;
  const metrics = request.photoMetrics || [];
  try {
    const analysis = await analyzeAndOrganize(request, provider, validateObservation);
    const { extractions, organization } = analysis;
    let model = analysis.model;
    await request.onStage?.("RECONSTRUCTING");
    const sections = organization.sequences.map((sequence, index) => ({ id: `sequence-section-${index}`, title: sequence.title }));
    const firstPrimaryImageId = organization.sequences[0].states[0].primaryImageId;
    const boardAspectRatio = extractions.find((item) => item.imageId === firstPrimaryImageId)?.boardAspectRatio || 1.6;
    let reconstruction: Reconstruction = { schemaVersion: 2, title: request.lesson.title, overview: organization.sequences.map((sequence) => sequence.title).join(" · "), board: { aspectRatio: boardAspectRatio }, disciplines: [], concepts: [], sections, steps: [], unresolved: union([...organization.warnings, ...extractions.flatMap((item) => [...(item.visualAssessment?.qualityNotes || []), ...item.unreadableRegions].filter((note) => note.startsWith("[Source recovery:")))]), organization };
    const allStateImages = organization.sequences.flatMap((sequence) => sequence.states.map((state) => state.imageIds));
    const sequenceStarts: number[] = [];
    const everUsed = new Set<string>();
    let priorPrimary: string | null = null;
    let momentIndex = 0;
    for (const [sequenceIndex, sequence] of organization.sequences.entries()) {
      sequenceStarts.push(momentIndex);
      for (const [stateIndex, state] of sequence.states.entries()) {
        const sequenceStart = sequenceIndex > 0 && stateIndex === 0;
        let changes: NonNullable<ReconstructionStep["changes"]> = [];
        let stateText = "", stateUncertainty = "";
        if (sequenceStart) changes.push({ id: `sequence-boundary-${momentIndex}`, action: "NEW_TOPIC", targetId: null, element: null, description: "Separate board sequence. Its relationship to previously displayed groups is unknown; no intervening erasure is asserted." });
        const currentSources = [state.primaryImageId, ...state.imageIds.filter((id) => id !== state.primaryImageId)];
        const chunks: string[][] = [];
        for (let start = 0; start < currentSources.length; start += 4) chunks.push(currentSources.slice(start, start + 4));
        let moment: ReconstructionStep = { id: `organized-moment-${momentIndex}`, type: "other", sectionId: sections[sequenceIndex].id, text: "", stepIndex: momentIndex, sourceImageIds: [...state.imageIds], evidenceStatus: "OBSERVED", changes, sequenceId: sequence.id, organizationStateId: state.id };
        for (const [chunkIndex, chunk] of chunks.entries()) {
          const prefix = { ...reconstruction, steps: [...reconstruction.steps, { ...moment, changes }] };
          const priorScene = getBoardScene(prefix, momentIndex).elements;
          if (priorScene.length > MAX_ACTIVE_ELEMENTS) throw new AiError("INVALID_INPUT", "This board contains too many individual elements for a reliable bounded request. Split it into smaller lesson sets. Original photos remain saved.");
          const allPriorSourceIds = allStateImages.slice(0, momentIndex + 1).flat();
          const allowedSourceIds = allStateImages.slice(sequenceStarts[sequenceIndex], momentIndex + 1).flat();
          const inputImages = safeSourceContext(images, chunk, [state.primaryImageId, ...(!sequenceStart && priorPrimary ? [priorPrimary] : [])]);
          const currentObservations = extractions.filter((item) => state.imageIds.includes(item.imageId)).sort((left, right) => left.imageId.localeCompare(right.imageId)).map((item) => ({ ...item, sequence: momentIndex }));
          const context = { state, sequenceTitle: sequence.title, boardAspectRatio, momentIndex, chunkIndex, chunkCount: chunks.length, priorScene, everUsedIds: [...everUsed], allowedSourceIds, sequenceStart };
          function acceptState(output: ReturnType<typeof aiReconstructionSchema.parse>) {
            if (output.steps.length !== 1 || output.steps[0].stepIndex !== momentIndex) throw new Error("An incremental reconstruction must return exactly the requested state.");
            const produced = output.steps[0];
            if (!produced.sourceImageIds.some((id) => state.imageIds.includes(id)) || produced.sourceImageIds.some((id) => !allowedSourceIds.includes(id))) throw new Error("The state cites an unrelated or unavailable photograph.");
            if (currentObservations.every((item) => item.boardState === "UNREADABLE") && produced.changes.some((change) => {
              if (sequenceStart && change.action === "NEW_TOPIC") return false; // The server supplies and labels this structural boundary.
              return change.action !== "UNCHANGED" && !(change.action === "ADD" && change.element?.type === "image_crop" && change.element.evidenceStatus === "UNCERTAIN" && change.element.uncertainty?.trim() && state.imageIds.includes(change.element.sourceRegion?.imageId || change.element.sourceImageIds[0]));
            })) throw new Error("Unreadable or occluded photos cannot establish erasures, corrections, or new transcribed content.");
            if (chunkIndex > 0 && produced.changes.some((change) => ["ERASE", "CORRECT", "NEW_TOPIC"].includes(change.action))) throw new Error("A complementary chunk cannot invent a chronological correction or erasure.");
            const candidateMoment = { ...produced, id: moment.id, sectionId: moment.sectionId, sourceImageIds: union([...state.imageIds, ...produced.sourceImageIds]), changes: [...changes, ...produced.changes.filter((change) => !(sequenceStart && change.action === "NEW_TOPIC")).map((change, changeIndex) => ({ ...change, id: `state-${momentIndex}-chunk-${chunkIndex}-event-${changeIndex}` }))] };
            const candidate = validateReconstruction({ ...reconstruction, steps: [...reconstruction.steps, candidateMoment] }, allPriorSourceIds, { requireVisual: true });
            if (chunkIndex === chunks.length - 1) {
              const scene = getBoardScene(candidate, momentIndex);
              if (currentObservations.some((item) => item.boardState === "CONTENT") && !scene.elements.some((item) => item.sourceImageIds.length)) throw new Error("A nonblank state has no visible reconstruction.");
              if (currentObservations.every((item) => item.boardState === "BLANK") && scene.elements.length) throw new Error("A blank board was not cleared.");
              if (!currentObservations.some((item) => item.boardState === "CONTENT") && currentObservations.some((item) => item.boardState === "UNREADABLE") && !scene.elements.some((item) => item.type === "image_crop" && state.imageIds.includes(item.sourceRegion?.imageId || item.sourceImageIds[0]) && item.evidenceStatus === "UNCERTAIN" && item.uncertainty?.trim())) throw new Error("Unreadable content needs its actual uncertain source crop.");
            }
          }
          const response = await generated(request, provider, "state", { system: EVIDENCE_SYSTEM_PROMPT, prompt: stateReconstructionPrompt(request.lesson, currentObservations, context), images: inputImages, schema: aiReconstructionSchema, schemaName: "reconstructed_lesson", normalizeOutput: (value) => normalizeReconstructionOutput(value, images, { imageId: state.primaryImageId, momentIndex, chunkIndex, activeElementIds: priorScene.map((element) => element.id), everUsedIds: [...everUsed] }) }, { context, observations: currentObservations, images: inputImages.map((image) => [image.id, pixelFingerprint(image, metrics)]), lesson: request.lesson }, acceptState);
          model = response.model;
          const output = aiReconstructionSchema.parse(response.structuredOutput);
          if (output.steps.length !== 1 || output.steps[0].stepIndex !== momentIndex) throw new Error("An incremental reconstruction must return exactly the requested state.");
          const produced = output.steps[0];
          if (!produced.sourceImageIds.some((id) => state.imageIds.includes(id))) throw new Error("The state did not cite any current photograph.");
          if (chunkIndex > 0 && produced.changes.some((change) => ["ERASE", "CORRECT", "NEW_TOPIC"].includes(change.action))) throw new Error("A complementary chunk cannot invent a chronological correction or erasure.");
          for (const change of produced.changes) {
            if (change.action === "ADD" && change.element) everUsed.add(change.element.id);
          }
          changes = [...changes, ...produced.changes.filter((change) => !(sequenceStart && change.action === "NEW_TOPIC")).map((change, changeIndex) => ({ ...change, id: `state-${momentIndex}-chunk-${chunkIndex}-event-${changeIndex}` }))];
          stateText = [stateText, produced.text].filter(Boolean).join(" ");
          stateUncertainty = [stateUncertainty, produced.uncertainty].filter(Boolean).join(" ");
          moment = { ...produced, id: moment.id, sectionId: moment.sectionId, stepIndex: momentIndex, sourceImageIds: union([...state.imageIds, ...produced.sourceImageIds]), text: stateText, changes, sequenceId: sequence.id, organizationStateId: state.id };
          if (sequence.orderingConfidence === "LOW" || state.confidence === "LOW" || sequenceStart) {
            moment.evidenceStatus = "UNCERTAIN";
            moment.uncertainty = [stateUncertainty, sequence.uncertainty, state.confidence === "LOW" ? state.reason : "", sequenceStart ? "Chronology between separate sequences is unknown." : ""].filter(Boolean).join(" ") || "The proposed photo order needs review.";
          }
          reconstruction.disciplines = union([...(reconstruction.disciplines || []), ...output.disciplines]);
          reconstruction.concepts = union([...reconstruction.concepts, ...output.concepts]);
          reconstruction.unresolved = union([...reconstruction.unresolved, ...output.unresolved]);
          // Validate every prefix before using it as the next prompt's immutable scene.
          moment = validateReconstruction({ ...reconstruction, steps: [...reconstruction.steps, moment] }, allPriorSourceIds, { requireVisual: true }).steps.at(-1)!;
          changes = moment.changes || [];
        }
        const stateObservations = extractions.filter((item) => state.imageIds.includes(item.imageId));
        const candidate = { ...reconstruction, steps: [...reconstruction.steps, moment] };
        const scene = getBoardScene(candidate, momentIndex);
        if (stateObservations.some((item) => item.boardState === "CONTENT") && !scene.elements.some((item) => item.sourceImageIds.length)) throw new Error("A nonblank state has no cited visible reconstruction.");
        if (stateObservations.every((item) => item.boardState === "BLANK") && scene.elements.length) throw new Error("A visibly blank board still contains active reconstructed elements.");
        if (!stateObservations.some((item) => item.boardState === "CONTENT") && stateObservations.some((item) => item.boardState === "UNREADABLE") && !scene.elements.some((item) => item.type === "image_crop" && state.imageIds.includes(item.sourceRegion?.imageId || item.sourceImageIds[0]) && item.evidenceStatus === "UNCERTAIN" && item.uncertainty?.trim())) throw new Error("An unreadable state needs an uncertain crop from its actual source group.");
        reconstruction = candidate;
        priorPrimary = state.primaryImageId;
        momentIndex++;
      }
    }
    reconstruction = validateReconstruction(reconstruction, images.map((image) => image.id), { requireVisual: true, checkChronology: true, stateImageIds: allStateImages, sequenceStartIndices: sequenceStarts });
    return { reconstruction, extractions, organization, provider: provider.id, model };
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError("INVALID_OUTPUT", "The provider returned inconsistent source references, chronology, or board changes that could not be safely recovered. Your originals, completed analysis, and previous notes are saved. Retry processing or change the AI connection.");
  }
}
