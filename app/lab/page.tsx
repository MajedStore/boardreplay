"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Beaker,
  CheckCircle2,
  ChevronDown,
  FileText,
  ImageIcon,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import ResultCard from "@/components/comparison/ResultCard";
import { request, downloadJson } from "@/lib/client";
import {
  BENCHMARK_WRAPPER_VERSION,
  benchmarkImageLabel,
  benchmarkImageUrl,
  buildManualBenchmarkPrompt,
} from "@/lib/benchmark";
import {
  comparisonCsv,
  DEFAULT_EVALUATION_PROMPT,
  PROVIDERS,
  PROVIDER_LABELS,
  rankResults,
  type ComparisonProvider,
  type ComparisonRun,
  type EvaluationScores,
  type ProviderResult,
} from "@/lib/comparison";
import type { Lesson, ProviderInfo } from "@/lib/types";
import "@/components/comparison/comparison.css";

export default function ComparisonLabPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [runs, setRuns] = useState<ComparisonRun[]>([]);
  const [runId, setRunId] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_EVALUATION_PROMPT);
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manualProvider, setManualProvider] = useState<ComparisonProvider | "">(
    "",
  );
  const [manualModel, setManualModel] = useState("");
  const [manualOutput, setManualOutput] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const lesson = lessons.find((item) => item.id === lessonId);
  const run = runs.find((item) => item.id === runId);
  const ranked = run ? rankResults(run) : [];

  useEffect(() => {
    Promise.all([
      request<Lesson[]>("/api/lessons"),
      request<ProviderInfo[]>("/api/providers"),
    ])
      .then(([loadedLessons, loadedProviders]) => {
        setLessons(loadedLessons);
        setProviders(loadedProviders);
        const requested = new URLSearchParams(window.location.search).get(
          "lessonId",
        );
        setLessonId(
          loadedLessons.some((item) => item.id === requested)
            ? requested!
            : (loadedLessons[0]?.id ?? ""),
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!lessonId) {
      setRuns([]);
      setRunId("");
      return;
    }
    let active = true;
    setLoadingRuns(true);
    setError("");
    request<ComparisonRun[]>(
      `/api/comparisons?lessonId=${encodeURIComponent(lessonId)}`,
    )
      .then((loaded) => {
        if (active) {
          setRuns(loaded);
          setRunId(loaded[0]?.id ?? "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoadingRuns(false);
      });
    return () => {
      active = false;
    };
  }, [lessonId]);

  useEffect(() => {
    setReference(run?.reference ?? "");
  }, [run?.id, run?.reference]);

  function updateRun(updated: ComparisonRun) {
    setRuns((current) => [
      updated,
      ...current.filter((item) => item.id !== updated.id),
    ]);
    setRunId(updated.id);
  }
  async function perform(key: string, operation: () => Promise<void>) {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      await operation();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The operation failed. Please try again.",
      );
    } finally {
      setBusy("");
    }
  }
  async function createRun() {
    if (!lessonId || !prompt.trim()) return;
    await perform("create", async () => {
      updateRun(
        await request<ComparisonRun>("/api/comparisons", {
          method: "POST",
          body: JSON.stringify({ lessonId, prompt: prompt.trim() }),
        }),
      );
      setMessage(
        "Benchmark saved. Every result in this run uses this prompt and image snapshot.",
      );
    });
  }
  async function deleteRun() {
    if (
      !run ||
      !window.confirm(
        "Delete this benchmark, all provider responses, and its evaluation scores? The source lesson and photos will be kept.",
      )
    )
      return;
    await perform("delete", async () => {
      await request(`/api/comparisons/${run.id}`, { method: "DELETE" });
      const remaining = runs.filter((item) => item.id !== run.id);
      setRuns(remaining);
      setRunId(remaining[0]?.id ?? "");
      setManualProvider("");
      setMessage("Benchmark and its results deleted.");
    });
  }
  async function addManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!run || !manualProvider || !confirmed) return;
    await perform("manual", async () => {
      updateRun(
        await request<ComparisonRun>(`/api/comparisons/${run.id}/results`, {
          method: "POST",
          body: JSON.stringify({
            provider: manualProvider,
            model: manualModel.trim(),
            rawOutput: manualOutput,
            notes: manualNotes,
          }),
        }),
      );
      setManualProvider("");
      setManualOutput("");
      setManualModel("");
      setManualNotes("");
      setConfirmed(false);
      setMessage(
        "Actual response saved as a manual submission. Add your assessment below.",
      );
    });
  }
  async function saveAssessment(
    result: ProviderResult,
    scores: EvaluationScores,
    notes: string,
  ) {
    const saved = await request<ProviderResult>(`/api/results/${result.id}`, {
      method: "PATCH",
      body: JSON.stringify({ scores, notes }),
    });
    setRuns((current) =>
      current.map((item) => ({
        ...item,
        results: item.results.map((entry) =>
          entry.id === result.id ? saved : entry,
        ),
      })),
    );
    setMessage("Assessment saved.");
  }
  function exportCsv() {
    if (!run) return;
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", comparisonCsv(run)], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `boardreplay-comparison-${run.id}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div className="lab-page page-content">
        <div className="lab-page-heading">
          <div>
            <span className="lab-kicker">
              <Beaker size={15} /> THE EXPERIMENT DESK
            </span>
            <h1>
              AI Comparison Lab<span className="heading-dot">.</span>
            </h1>
            <p className="muted">
              Same board. Same prompt. Three different perspectives.
            </p>
          </div>
          <Link
            href={lessonId ? `/report?lessonId=${lessonId}` : "/report"}
            className="btn btn-secondary"
          >
            <FileText size={16} /> Prepare report <ArrowRight size={15} />
          </Link>
        </div>
        <div className="lab-integrity-note">
          <ShieldCheck size={19} />
          <span>
            <strong>Evidence over impressions.</strong> Compare actual
            responses, keep the original outputs, and score them yourself. No
            invented benchmarks.
          </span>
        </div>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="lab-success" role="status">
            <CheckCircle2 size={16} />
            {message}
          </div>
        )}
        {loading ? (
          <div className="card lab-loading">
            <Loader2 className="spin" size={24} /> Loading your lessons and
            provider configuration…
          </div>
        ) : lessons.length === 0 ? (
          <div className="card empty-state">
            <Beaker size={36} />
            <h2>A good comparison starts with a lesson.</h2>
            <p>
              Create a lesson or open the synthetic demo, then compare its
              ordered photographs here.
            </p>
            <Link href="/lessons" className="btn btn-primary">
              Go to lessons <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <>
            <section className="card benchmark-setup">
              <div className="lab-section-label">
                <span>01</span>
                <h2>Set the benchmark</h2>
                <span className="badge">One shared input</span>
              </div>
              <div className="benchmark-grid">
                <label className="field">
                  <span className="label">Lesson</span>
                  <select
                    className="input"
                    value={lessonId}
                    disabled={!!busy}
                    onChange={(event) => {
                      setLessonId(event.target.value);
                      setMessage("");
                      setManualProvider("");
                    }}
                  >
                    {lessons.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.title}
                        {item.isDemo ? " · sample data" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="benchmark-image-count">
                  <ImageIcon size={19} />
                  <strong>{lesson?.images.length ?? 0}</strong>
                  <span>ordered source photos</span>
                  {lesson && (
                    <Link href={`/lessons/${lesson.id}`}>
                      Review images <ArrowRight size={13} />
                    </Link>
                  )}
                </div>
              </div>
              {lesson?.isDemo && (
                <p className="lab-small-note">
                  This lesson uses clearly synthetic sample photographs. Any API
                  responses you request will be actual responses to those sample
                  images.
                </p>
              )}
              <details className="prompt-details" open={!run}>
                <summary>
                  Common evaluation prompt <ChevronDown size={15} />
                </summary>
                <label className="field">
                  <span className="sr-only">
                    Evaluation prompt for a new benchmark
                  </span>
                  <textarea
                    className="input prompt-input"
                    rows={5}
                    value={prompt}
                    maxLength={12000}
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                </label>
                <p className="muted lab-small-note">
                  Saving a new benchmark freezes the prompt and ordered image
                  snapshot. Changing this draft does not change previous runs.
                </p>
              </details>
              <div className="benchmark-actions">
                <button
                  className="btn btn-primary"
                  disabled={
                    !!busy ||
                    loadingRuns ||
                    !lesson?.images.length ||
                    prompt.trim().length < 10
                  }
                  onClick={createRun}
                >
                  {busy === "create" ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <Plus size={16} />
                  )}{" "}
                  Save new benchmark
                </button>
                {!lesson?.images.length && (
                  <span className="muted">
                    Upload at least one photo first.
                  </span>
                )}
                {runs.length > 0 && (
                  <label className="saved-run-select">
                    <span>Saved benchmark</span>
                    <select
                      className="input"
                      value={runId}
                      disabled={!!busy || loadingRuns}
                      onChange={(event) => {
                        setRunId(event.target.value);
                        setManualProvider("");
                      }}
                    >
                      {runs.map((item, index) => (
                        <option key={item.id} value={item.id}>
                          {new Date(item.createdAt).toLocaleString()} ·{" "}
                          {item.results.length} results
                          {index === 0 ? " · latest" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </section>
            {loadingRuns ? (
              <div className="lab-loading">
                <Loader2 size={20} className="spin" />
                Loading saved benchmarks…
              </div>
            ) : (
              run && (
                <>
                  <section className="lab-benchmark-receipt">
                    <div>
                      <span className="lab-eyebrow">ACTIVE BENCHMARK</span>
                      <strong>
                        {run.imageIds.length} photos ·{" "}
                        {new Date(run.createdAt).toLocaleString()}
                      </strong>
                    </div>
                    <details>
                      <summary>View frozen prompt & image order</summary>
                      {!run.systemInstructions && (
                        <p className="lab-small-note">
                          Historical benchmark: its system instructions were not
                          saved. Previous responses are preserved; create a new
                          benchmark for comparable automatic or manual runs.
                        </p>
                      )}
                      <p className="lab-small-note">
                        For manual comparison, download every prepared photo
                        below, attach them in this order, and paste the full
                        copied prompt into the official tool. These JPEGs use
                        the exact snapshot rotation, orientation, size, and
                        encoding sent by the API. The copied text includes its
                        evidence rules and source identifiers.
                      </p>
                      <p className="frozen-prompt">
                        {buildManualBenchmarkPrompt(run)}
                      </p>
                      <ol>
                        {[...run.imageSnapshot]
                          .sort((left, right) => left.sequence - right.sequence)
                          .map((image) => (
                            <li key={image.id}>
                              {benchmarkImageLabel(image)}
                              <br />
                              <a
                                className="text-link"
                                href={benchmarkImageUrl(run.id, image.id)}
                                download={`boardreplay-photo-${String(image.sequence + 1).padStart(2, "0")}.jpg`}
                              >
                                Download photo {image.sequence + 1}
                              </a>
                            </li>
                          ))}
                      </ol>
                    </details>
                    <button
                      className="btn btn-ghost"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            buildManualBenchmarkPrompt(run),
                          );
                          setMessage(
                            "Full benchmark instructions and source IDs copied. Attach the prepared photos in their listed order.",
                          );
                        } catch {
                          setError(
                            "Clipboard unavailable. Expand the frozen prompt to copy it manually.",
                          );
                        }
                      }}
                    >
                      <FileText size={15} /> Copy prompt
                    </button>
                    <button
                      className="btn btn-ghost"
                      aria-label="Delete saved benchmark"
                      disabled={!!busy}
                      onClick={deleteRun}
                    >
                      <Trash2 size={15} /> Delete
                    </button>
                  </section>
                  <section>
                    <div className="lab-section-label">
                      <span>02</span>
                      <h2>Collect actual responses</h2>
                    </div>
                    <div className="provider-grid">
                      {PROVIDERS.map((provider) => {
                        const info = providers.find(
                          (item) => item.id === provider,
                        );
                        const count = run.results.filter(
                          (result) => result.provider === provider,
                        ).length;
                        return (
                          <article
                            key={provider}
                            className={`card provider-connect-card provider-${provider}`}
                          >
                            <div className="provider-connect-heading">
                              <div className="provider-mark">
                                {provider === "openai"
                                  ? "O"
                                  : provider === "gemini"
                                    ? "G"
                                    : "C"}
                              </div>
                              <span
                                className={`badge ${info?.configured ? "provider-ready" : ""}`}
                              >
                                {info?.configured
                                  ? "API connected"
                                  : "Manual available"}
                              </span>
                            </div>
                            <h3>{PROVIDER_LABELS[provider]}</h3>
                            <p className="muted">
                              {info?.configured
                                ? info.model
                                : "Paste an output from the official interface."}
                            </p>
                            <button
                              className="btn btn-secondary"
                              disabled={!!busy || !info?.configured}
                              title={
                                !info?.configured
                                  ? "Configure the provider API key in server environment variables."
                                  : undefined
                              }
                              onClick={() =>
                                perform(provider, async () => {
                                  updateRun(
                                    await request<ComparisonRun>(
                                      `/api/comparisons/${run.id}/run`,
                                      {
                                        method: "POST",
                                        body: JSON.stringify({ provider }),
                                      },
                                    ),
                                  );
                                  setMessage(
                                    "Actual API response saved. Review the output and score it below.",
                                  );
                                })
                              }
                            >
                              {busy === provider ? (
                                <Loader2 size={15} className="spin" />
                              ) : (
                                <Sparkles size={15} />
                              )}
                              {busy === provider
                                ? "Waiting for provider…"
                                : "Run with API"}
                            </button>
                            <button
                              className="btn btn-ghost"
                              disabled={!!busy}
                              onClick={() => {
                                setManualProvider(provider);
                                setConfirmed(false);
                              }}
                            >
                              Paste manual response <Plus size={14} />
                            </button>
                            <small>
                              {count
                                ? `${count} saved response${count > 1 ? "s" : ""}`
                                : "No response recorded"}
                            </small>
                          </article>
                        );
                      })}
                    </div>
                    <p className="muted lab-small-note">
                      API calls send the saved source images to the selected
                      provider and may incur provider charges. Manual responses
                      must use the full copied prompt and the prepared
                      photograph downloads in the frozen benchmark above.
                    </p>
                  </section>
                  {manualProvider && (
                    <section className="card manual-submission">
                      <form onSubmit={addManual}>
                        <div className="lab-section-label">
                          <h2>
                            Paste {PROVIDER_LABELS[manualProvider]} response
                          </h2>
                          <span className="badge">Manual submission</span>
                        </div>
                        <p className="muted">
                          Copy the full benchmark prompt above and attach every
                          downloaded prepared photo in the saved order in the
                          official tool. Paste the original response without
                          rewriting it.
                        </p>
                        <label className="field">
                          <span className="label">
                            Model identifier, if known
                          </span>
                          <input
                            className="input"
                            value={manualModel}
                            onChange={(event) =>
                              setManualModel(event.target.value)
                            }
                            placeholder="Copy the model name shown by the tool; leave blank if unknown"
                            maxLength={150}
                          />
                        </label>
                        <label className="field">
                          <span className="label">Actual raw response</span>
                          <textarea
                            className="input"
                            rows={9}
                            required
                            value={manualOutput}
                            onChange={(event) =>
                              setManualOutput(event.target.value)
                            }
                            maxLength={200000}
                          />
                        </label>
                        <label className="field">
                          <span className="label">Notes (optional)</span>
                          <textarea
                            className="input"
                            rows={2}
                            maxLength={6000}
                            value={manualNotes}
                            onChange={(event) =>
                              setManualNotes(event.target.value)
                            }
                            placeholder="Interface used, limitations, or relevant observations"
                          />
                        </label>
                        <label className="manual-attestation">
                          <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(event) =>
                              setConfirmed(event.target.checked)
                            }
                            required
                          />
                          I used this saved prompt and the same{" "}
                          {run.imageIds.length} prepared photographs in the same
                          order.
                        </label>
                        <div className="lab-button-row">
                          <button
                            className="btn btn-primary"
                            disabled={
                              !!busy || !confirmed || !manualOutput.trim()
                            }
                          >
                            {busy === "manual"
                              ? "Saving…"
                              : "Save manual response"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setManualProvider("")}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </section>
                  )}
                  <section className="card reference-editor">
                    <div className="lab-section-label">
                      <span>03</span>
                      <h2>Verify, then evaluate</h2>
                      <span className="badge">Human reviewed</span>
                    </div>
                    <p className="muted">
                      Build an answer key by checking the photographs. Text
                      metrics compare outputs with your saved reference; they do
                      not establish mathematical correctness.
                    </p>
                    <label className="field">
                      <span className="label">
                        Verified reference reconstruction / answer key
                      </span>
                      <textarea
                        className="input"
                        rows={4}
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="Transcribe and verify the expected content from the photographs…"
                        maxLength={100000}
                      />
                    </label>
                    <button
                      className="btn btn-secondary"
                      disabled={!!busy || reference === run.reference}
                      onClick={() =>
                        perform("reference", async () => {
                          updateRun(
                            await request<ComparisonRun>(
                              `/api/comparisons/${run.id}`,
                              {
                                method: "PATCH",
                                body: JSON.stringify({ reference }),
                              },
                            ),
                          );
                          setMessage(
                            "Reference saved. Agreement metrics use this version.",
                          );
                        })
                      }
                    >
                      <Save size={15} />
                      {busy === "reference" ? "Saving…" : "Save reference"}
                    </button>
                  </section>
                  {run.results.length > 0 ? (
                    <section>
                      <div className="lab-results-heading">
                        <div>
                          <span className="lab-eyebrow">SIDE BY SIDE</span>
                          <h2>Read the evidence. Make the call.</h2>
                        </div>
                        <div className="lab-button-row">
                          <button
                            className="btn btn-secondary"
                            onClick={exportCsv}
                          >
                            <ArrowDownToLine size={15} /> CSV
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() =>
                              downloadJson(
                                {
                                  ...run,
                                  benchmarkWrapperVersion:
                                    BENCHMARK_WRAPPER_VERSION,
                                  manualBenchmarkPrompt:
                                    buildManualBenchmarkPrompt(run),
                                  evaluation:
                                    "Human-assessed 0–5 rubric; text metrics are agreement only.",
                                },
                                `boardreplay-comparison-${run.id}.json`,
                              )
                            }
                          >
                            <ArrowDownToLine size={15} /> JSON
                          </button>
                        </div>
                      </div>
                      <div className="result-grid">
                        {run.results.map((result) => (
                          <ResultCard
                            key={result.id}
                            result={result}
                            reference={run.reference}
                            onSave={saveAssessment}
                          />
                        ))}
                      </div>
                    </section>
                  ) : (
                    <div className="lab-awaiting">
                      <Beaker size={22} />
                      <div>
                        <strong>
                          Your comparison starts with real outputs.
                        </strong>
                        <p className="muted">
                          Run a connected provider or paste a manual response
                          above. Scores stay empty until you assess them.
                        </p>
                      </div>
                    </div>
                  )}
                  <section className="card ranking-card">
                    <div>
                      <span className="lab-eyebrow">YOUR EVALUATION</span>
                      <h2>Comparison summary</h2>
                      <p className="muted">
                        Rankings require all eight scores for at least two tools
                        on this saved benchmark. Latest fully assessed response
                        per tool is used. Compare all three for your assignment.
                      </p>
                    </div>
                    {ranked.length ? (
                      <div className="ranking-chart">
                        {ranked.map(({ result, rank, total }) => (
                          <div key={result.id} className="ranking-row">
                            <span className="ranking-number">
                              {rank.toString().padStart(2, "0")}
                            </span>
                            <span>{PROVIDER_LABELS[result.provider]}</span>
                            <div className="ranking-track">
                              <div
                                className={`ranking-fill fill-${result.provider}`}
                                style={{ width: `${(total / 40) * 100}%` }}
                              />
                            </div>
                            <strong>
                              {total}
                              <small>/40</small>
                            </strong>
                          </div>
                        ))}
                        <p className="muted lab-small-note">
                          Scores reflect your subjective assessment of this
                          image set. They are not a general benchmark of model
                          ability.
                          {ranked.length < 3
                            ? " A third tool has not yet been fully assessed."
                            : ""}
                        </p>
                      </div>
                    ) : (
                      <div className="ranking-empty">
                        <ShieldCheck size={22} />
                        <span>
                          No ranking yet. Complete and save the rubric for at
                          least two different tools.
                        </span>
                      </div>
                    )}
                  </section>
                </>
              )
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
