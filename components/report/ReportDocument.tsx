import {
  EVALUATION_CATEGORIES,
  completedScoreCount,
  PROVIDERS,
  PROVIDER_LABELS,
  rankResults,
  referenceMetrics,
  totalScore,
  type ComparisonRun,
  type ProviderResult,
  type ReportDraft,
} from "@/lib/comparison";
import type { Lesson } from "@/lib/types";
import { benchmarkImageUrl, buildManualBenchmarkPrompt } from "@/lib/benchmark";

function excerpt(text: string, limit: number) {
  return text.length <= limit ? text : `${text.slice(0, limit)}… [excerpt]`;
}

export default function ReportDocument({
  lesson,
  run,
  draft,
}: {
  lesson: Lesson;
  run: ComparisonRun | undefined;
  draft: ReportDraft;
}) {
  const latest = PROVIDERS.map(
    (provider) =>
      run?.results
        .filter((result) => result.provider === provider)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
  ).filter((result): result is ProviderResult => !!result);
  const ranked = run ? rankResults(run) : [];
  const sourceIds = run?.imageIds ?? lesson.images.map((image) => image.id);
  const photos = sourceIds
    .map((id) => lesson.images.find((image) => image.id === id))
    .filter((image) => image !== undefined);
  const date = run?.createdAt ?? lesson.createdAt;
  function footer(page: number) {
    return (
      <footer className="report-footer">
        <span>BOARDREPLAY / PROJECT REPORT</span>
        <span>{page.toString().padStart(2, "0")} / 04</span>
      </footer>
    );
  }
  function narrative(text: string, placeholder: string) {
    return (
      <p className={text.trim() ? "report-narrative" : "report-unfilled"}>
        {text.trim() || placeholder}
      </p>
    );
  }

  return (
    <div
      className="report-document"
      aria-label="Print-friendly academic report"
    >
      <section className="report-sheet report-cover">
        <header className="report-brand">
          BOARD<span>REPLAY</span>
          <small>ACADEMIC PROJECT REPORT</small>
        </header>
        <div className="report-cover-heading">
          <span className="report-eyebrow">
            AI-POWERED EDUCATIONAL PRODUCTIVITY
          </span>
          <h1>
            From whiteboard
            <br />
            to replayable lesson.
          </h1>
          <p>
            Traceable reconstruction and a practical comparison of
            vision-capable AI tools.
          </p>
        </div>
        <div className="report-lesson-meta">
          <div>
            <small>CASE STUDY</small>
            <strong>{lesson.title}</strong>
          </div>
          <div>
            <small>COURSE</small>
            <strong>{lesson.course || "Not specified"}</strong>
          </div>
          <div>
            <small>RECORD DATE</small>
            <strong>{new Date(date).toLocaleDateString()}</strong>
          </div>
          <div>
            <small>INPUT</small>
            <strong>
              {sourceIds.length} ordered photographs
              {lesson.isDemo ? " · synthetic sample" : ""}
            </strong>
          </div>
        </div>
        {lesson.isDemo && (
          <aside className="report-evidence-note">
            SAMPLE DATA: This case study uses synthetic whiteboard frames. The
            bundled reconstruction is demonstration content, not a live provider
            result. Saved provider responses, if included below, are labeled by
            their actual submission method.
          </aside>
        )}
        <h2>
          <span>01</span> Project problem
        </h2>
        {narrative(draft.problem, "Project problem has not been written.")}
        <h2>
          <span>02</span> Project objective
        </h2>
        {narrative(draft.objective, "Project objective has not been written.")}
        <div className="report-tool-summary">
          <h3>Selected AI tools and recorded evidence</h3>
          {PROVIDERS.map((provider) => {
            const result = latest.find((item) => item.provider === provider);
            return (
              <div key={provider}>
                <strong>{PROVIDER_LABELS[provider]}</strong>
                <span>
                  {result
                    ? `${result.model || "Model unknown"} · ${result.mode === "MANUAL" ? "manual submission" : "API response"}`
                    : "No response recorded for this benchmark"}
                </span>
              </div>
            );
          })}
        </div>
        {footer(1)}
      </section>
      <section className="report-sheet">
        <header className="report-running-header">
          BOARDREPLAY <span>METHOD & SOURCE MATERIAL</span>
        </header>
        <h2>
          <span>03</span> Evaluation methodology
        </h2>
        {narrative(
          draft.methodology,
          "Evaluation methodology has not been written.",
        )}
        <div className="report-evidence-note">
          Human evaluation uses eight categories, each scored from 0 to 5. A
          missing score means unassessed. Rankings require complete evaluations
          of at least two different tools on one saved image set and prompt.
          Text agreement with a user-verified reference does not prove semantic
          or mathematical correctness.
        </div>
        <h3>Input images in benchmark order</h3>
        {photos.length ? (
          <div className="report-photo-grid">
            {photos.slice(0, 3).map((image, index) => (
              <figure key={image.id}>
                <img
                  src={run ? benchmarkImageUrl(run.id, image.id) : image.url}
                  alt={`Source photograph ${index + 1}: ${image.originalFilename}`}
                />
                <figcaption>
                  {index + 1}. {image.originalFilename}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="report-unfilled">Source images are not available.</p>
        )}
        {sourceIds.length > 3 && (
          <p className="report-caption">
            First three images shown; the benchmark contains {sourceIds.length}{" "}
            ordered source photographs. Full image identifiers are included in
            the comparison JSON export.
          </p>
        )}
        {photos.length < sourceIds.length && (
          <p className="report-caption">
            Some recorded source images are no longer available in the lesson.
          </p>
        )}
        <h3>Frozen benchmark instructions and source identifiers</h3>
        <div className="report-quote">
          {run
            ? excerpt(buildManualBenchmarkPrompt(run), 1300)
            : "No saved benchmark selected. No evaluation prompt has been recorded."}
        </div>
        <h3>Verified reference / answer key</h3>
        <div className="report-quote">
          {run?.reference
            ? excerpt(run.reference, 900)
            : "No verified reference saved. Objective reference agreement is unavailable."}
        </div>
        <p className="report-caption">
          Long source text is explicitly excerpted for page layout. Complete
          prompts, reference text, raw outputs, model identifiers, notes, and
          scores remain available in the AI Comparison Lab JSON / CSV export.
        </p>
        {footer(2)}
      </section>
      <section className="report-sheet">
        <header className="report-running-header">
          BOARDREPLAY <span>ACTUAL OUTPUTS & EVALUATION</span>
        </header>
        <h2>
          <span>04</span> Recorded outputs
        </h2>
        {latest.length ? (
          latest.map((result) => (
            <article className="report-output" key={result.id}>
              <h3>
                {PROVIDER_LABELS[result.provider]}{" "}
                <small>
                  {result.mode === "MANUAL" ? "MANUAL" : "API"} ·{" "}
                  {result.model || "model unknown"}
                </small>
              </h3>
              <pre>{excerpt(result.rawOutput, 480)}</pre>
              <p className="report-caption">
                {new Date(result.createdAt).toLocaleString()}
                {result.durationMs !== null
                  ? ` · ${(result.durationMs / 1000).toFixed(1)} seconds measured`
                  : " · processing time not measured"}
                {result.notes ? ` · Notes: ${excerpt(result.notes, 180)}` : ""}
              </p>
            </article>
          ))
        ) : (
          <p className="report-unfilled">
            No actual provider outputs are saved. This report makes no
            experimental performance claims.
          </p>
        )}
        <h3>Human-assessed comparison (0–5)</h3>
        <table className="report-score-table">
          <thead>
            <tr>
              <th>Evaluation category</th>
              {PROVIDERS.map((provider) => (
                <th key={provider}>
                  {provider === "openai"
                    ? "OpenAI"
                    : provider === "gemini"
                      ? "Gemini"
                      : "Claude"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVALUATION_CATEGORIES.map(({ key, label }) => (
              <tr key={key}>
                <td>{label}</td>
                {PROVIDERS.map((provider) => (
                  <td key={provider}>
                    {latest.find((result) => result.provider === provider)
                      ?.scores[key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="report-total">
              <td>Saved total / 40</td>
              {PROVIDERS.map((provider) => {
                const result = latest.find(
                  (item) => item.provider === provider,
                );
                return (
                  <td key={provider}>
                    {result
                      ? (totalScore(result.scores) ??
                        `${completedScoreCount(result.scores)}/8 assessed`)
                      : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
        <div className="report-ranking">
          <strong>Overall ranking:</strong>{" "}
          {ranked.length
            ? ranked
                .map(
                  ({ result, rank, total }) =>
                    `${rank}. ${PROVIDER_LABELS[result.provider]} (${total}/40)`,
                )
                .join("; ")
            : "Not available. Complete all eight scores for at least two tools on this benchmark."}
        </div>
        {latest.length > 0 && run?.reference && (
          <p className="report-caption">
            Reference word error rate (case and symbol sensitive; whitespace
            normalized):{" "}
            {latest
              .map((result) => {
                const metrics = referenceMetrics(
                  run.reference,
                  result.rawOutput,
                );
                return `${PROVIDER_LABELS[result.provider]}: ${metrics ? `${(metrics.wordErrorRate * 100).toFixed(1)}% (${metrics.wordEdits} word edits)` : "unavailable"}`;
              })
              .join("; ")}
            . This is textual agreement, not a correctness grade.
          </p>
        )}
        <p className="report-caption">
          Only actual saved assessments appear. Ranking uses the latest fully
          assessed response per provider; the table and excerpts show the latest
          saved response. Missing values are not zero. Results apply only to
          this specific input, prompt, and evaluation.
        </p>
        {footer(3)}
      </section>
      <section className="report-sheet">
        <header className="report-running-header">
          BOARDREPLAY <span>DIGITAL PRODUCT & REFLECTION</span>
        </header>
        <h2>
          <span>05</span> Implementation approach & digital product
        </h2>
        {narrative(
          draft.implementation,
          "Implementation description has not been written.",
        )}
        <div className="report-workflow">
          <span>Capture</span>
          <b>→</b>
          <span>Analyze</span>
          <b>→</b>
          <span>Reconstruct</span>
          <b>→</b>
          <span>Review & replay</span>
          <b>→</b>
          <span>Export</span>
        </div>
        <h3>Evidence and provenance model</h3>
        <p className="report-narrative">
          Each reconstructed step carries source image identifiers and an
          evidence status: OBSERVED for directly visible content, DERIVED for
          inferences, UNCERTAIN for incomplete or unclear content, and
          USER_EDITED for manual corrections. Educational explanations are
          differentiated from captured lecture content. The replay reconstructs
          the captured sequence; it is not a recording of the lecturer’s exact
          timing.
        </p>
        <h2>
          <span>06</span> Limitations
        </h2>
        {narrative(draft.limitations, "Limitations have not been written.")}
        <h2>
          <span>07</span> Conclusion
        </h2>
        {narrative(
          draft.conclusion,
          "Conclusion pending. Review the actual saved outputs and complete the human evaluation before writing findings. No findings have been generated automatically.",
        )}
        <aside className="report-evidence-note">
          <strong>Experiment record.</strong>{" "}
          {run
            ? `Benchmark ${run.id}. ${run.results.length} actual saved response${run.results.length === 1 ? "" : "s"} across ${new Set(run.results.map((result) => result.provider)).size} tools. ${ranked.length ? `${ranked.length} tools have complete eligible assessments.` : "A defensible ranking is not yet available."}`
            : "No saved benchmark is selected. This document is a project preparation draft."}
        </aside>
        {footer(4)}
      </section>
    </div>
  );
}
