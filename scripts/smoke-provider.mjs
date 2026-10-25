// Explicit opt-in smoke test against an already running BoardReplay server.
// Keys remain on that server; this script never reads .env or downloads photo bytes.
const usage = `Usage:
  node scripts/smoke-provider.mjs
  node scripts/smoke-provider.mjs --lesson <saved-lesson-id> [--provider openai|gemini|anthropic] [--base-url http://127.0.0.1:3000]

Without --lesson, only public provider configuration is checked; no paid request runs.
With --lesson and a configured provider, its existing uploaded photos are processed
through the real automatic-organization pipeline. Inspect the resulting sources,
ordering, duplicates, occlusions, corrections and replay yourself. A completed job
does not establish transcription accuracy.`;

function argumentsFor(values) {
  const options = { lesson: "", provider: "", baseUrl: "http://127.0.0.1:3000", help: false };
  for (let index = 0; index < values.length; index++) {
    const flag = values[index];
    if (flag === "--help" || flag === "-h") { options.help = true; continue; }
    if (!["--lesson", "--provider", "--base-url"].includes(flag) || !values[index + 1] || values[index + 1].startsWith("--")) throw new Error("Unknown or incomplete option. Use --help for the supported arguments.");
    const value = values[++index];
    if (flag === "--lesson") options.lesson = value;
    if (flag === "--provider") options.provider = value;
    if (flag === "--base-url") options.baseUrl = value;
  }
  if (options.provider && !["openai", "gemini", "anthropic"].includes(options.provider)) throw new Error("Choose openai, gemini or anthropic as the provider.");
  if (options.lesson && !/^[a-zA-Z0-9_-]{1,128}$/.test(options.lesson)) throw new Error("Use a valid saved lesson identifier.");
  let base;
  try { base = new URL(options.baseUrl); } catch { throw new Error("Use an absolute http or https BoardReplay base URL."); }
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("Use an http or https BoardReplay base URL without embedded credentials.");
  return { ...options, base };
}

async function serverJson(base, endpoint, init = {}) {
  let response;
  try {
    response = await fetch(new URL(endpoint, base), { ...init, cache: "no-store", signal: AbortSignal.timeout(30_000), headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json", origin: base.origin } : {}) } });
  } catch {
    throw new Error("Could not reach BoardReplay within 30 seconds. Start the local server or check --base-url.");
  }
  if (!response.ok) throw new Error(`BoardReplay declined ${init.method || "GET"} ${endpoint.split("?")[0]} (HTTP ${response.status}). Review the lesson in the app before retrying.`);
  try { return await response.json(); } catch { throw new Error("BoardReplay returned a response that was not valid JSON."); }
}

function organizationSummary(organization) {
  if (!organization || !Array.isArray(organization.sequences)) return { organizationAvailable: false };
  const states = organization.sequences.flatMap((sequence) => Array.isArray(sequence.states) ? sequence.states : []);
  const groups = Array.isArray(organization.duplicateGroups) ? organization.duplicateGroups : [];
  return { organizationAvailable: true, sequences: organization.sequences.length, boardStates: states.length, duplicateGroups: groups.length, orderingWarnings: Array.isArray(organization.warnings) ? organization.warnings.length : 0 };
}

async function smoke() {
  const options = argumentsFor(process.argv.slice(2));
  if (options.help) { console.log(usage); return; }
  const providers = await serverJson(options.base, "/api/providers");
  if (!Array.isArray(providers) || providers.some((provider) => typeof provider.id !== "string" || typeof provider.configured !== "boolean")) throw new Error("The server's public provider metadata was malformed.");
  const configured = providers.filter((provider) => provider.configured);
  const selected = options.provider ? configured.find((provider) => provider.id === options.provider) : configured[0];
  if (!selected) {
    console.log(JSON.stringify({ status: "SKIPPED", reason: options.provider ? "The selected provider is not configured on the server." : "No AI provider is configured on the server.", paidRequestsStarted: 0 }));
    return;
  }
  if (!options.lesson) {
    console.log(JSON.stringify({ status: "CONFIGURATION_ONLY", configuredProviders: configured.map((provider) => ({ id: provider.id, model: provider.model })), paidRequestsStarted: 0 }));
    console.log("Supply --lesson <id> to explicitly run the real-provider image smoke test.");
    return;
  }
  const endpoint = `/api/lessons/${encodeURIComponent(options.lesson)}`;
  const before = await serverJson(options.base, endpoint);
  if (!Array.isArray(before.images) || !before.images.length) throw new Error("This saved lesson has no uploaded photos. Upload photos in the app before running the smoke test.");
  console.log(JSON.stringify({ status: "STARTING_LIVE_SMOKE_TEST", provider: selected.id, configuredModel: selected.model, photos: before.images.length, orderMode: "AUTO" }));
  const accepted = await serverJson(options.base, `${endpoint}/process`, { method: "POST", body: JSON.stringify({ provider: selected.id, orderMode: "AUTO" }) });
  if (typeof accepted.runId !== "string") throw new Error("The server did not return a processing run identifier. Check the lesson before starting another request.");
  const reviewUrl = new URL(`/lessons/${encodeURIComponent(options.lesson)}`, options.base).href;
  const deadline = Date.now() + 15 * 60_000;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const lesson = await serverJson(options.base, endpoint);
    const run = lesson.runs?.find((candidate) => candidate.id === accepted.runId);
    const status = run?.status || lesson.status;
    if (status !== lastStatus) { console.log(JSON.stringify({ runId: accepted.runId, status })); lastStatus = status; }
    if (status === "FAILED") {
      console.log(JSON.stringify({ status: "FAILED", runId: accepted.runId, provider: run?.provider || selected.id, model: run?.model || null, message: run?.error || lesson.error || "Processing failed. Review the lesson for details.", reviewUrl }));
      process.exitCode = 1;
      return;
    }
    if (status === "COMPLETED") {
      const organization = run?.organization || lesson.document?.organization || lesson.photoOrganization;
      console.log(JSON.stringify({ status: "COMPLETED", runId: accepted.runId, provider: run?.provider || selected.id, model: run?.model || null, photos: lesson.images?.length ?? null, explainedPhotos: lesson.document?.photos?.length ?? null, language: lesson.document?.language || null, ...organizationSummary(organization), reviewUrl }));
      console.log("Compare each explanation and the proposed order with its original photograph. Completion is not a claim of academic, handwriting, or chronology accuracy.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`Stopped waiting after 15 minutes; the server job may still be running. Review ${reviewUrl} before submitting another request.`);
}

smoke().catch((error) => { console.error(error instanceof Error ? error.message : "The smoke test could not be completed."); process.exitCode = 1; });
