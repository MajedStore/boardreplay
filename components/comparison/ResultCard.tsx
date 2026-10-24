"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardCopy, Save } from "lucide-react";
import {
  EVALUATION_CATEGORIES,
  completedScoreCount,
  PROVIDER_LABELS,
  referenceMetrics,
  scoreHighlights,
  totalScore,
  type EvaluationScores,
  type ProviderResult,
} from "@/lib/comparison";

export default function ResultCard({
  result,
  reference,
  onSave,
}: {
  result: ProviderResult;
  reference: string;
  onSave: (
    result: ProviderResult,
    scores: EvaluationScores,
    notes: string,
  ) => Promise<void>;
}) {
  const [scores, setScores] = useState<EvaluationScores>(result.scores);
  const [notes, setNotes] = useState(result.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setScores(result.scores);
    setNotes(result.notes);
  }, [result]);
  const metrics = referenceMetrics(reference, result.rawOutput);
  const highlights = scoreHighlights(result.scores);
  const total = totalScore(result.scores);

  async function save() {
    setError("");
    setSaving(true);
    try {
      await onSave(result, scores, notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save assessment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`card result-card provider-${result.provider}`}>
      <div className="result-card-heading">
        <div className="provider-mark">
          {result.provider === "openai"
            ? "O"
            : result.provider === "gemini"
              ? "G"
              : "C"}
        </div>
        <div>
          <h3>{PROVIDER_LABELS[result.provider]}</h3>
          <p className="muted">{result.model || "Model not recorded"}</p>
        </div>
        <span className="badge">
          {result.mode === "MANUAL" ? "Manual submission" : "API result"}
        </span>
      </div>
      <div className="result-meta">
        <span>{new Date(result.createdAt).toLocaleString()}</span>
        <span>
          {result.durationMs !== null
            ? `${(result.durationMs / 1000).toFixed(1)} s measured`
            : "Time not measured"}
        </span>
      </div>
      <div className="raw-output-heading">
        <strong>Actual output</strong>
        <button
          className="btn btn-ghost"
          title="Copy raw output"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(result.rawOutput);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              setError(
                "Clipboard unavailable. Select and copy the output manually.",
              );
            }
          }}
        >
          {copied ? <Check size={15} /> : <ClipboardCopy size={15} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="raw-output">{result.rawOutput}</pre>
      {result.structuredOutput !== undefined &&
        result.structuredOutput !== null && (
          <details className="structured-output">
            <summary>Structured extraction</summary>
            <pre className="raw-output">
              {JSON.stringify(result.structuredOutput, null, 2)}
            </pre>
          </details>
        )}
      {metrics && (
        <div className="reference-metrics">
          <strong>Reference text agreement</strong>
          <span>
            {metrics.exactMatch
              ? "Exact match after whitespace normalization"
              : `${metrics.wordEdits} word edits · ${(metrics.wordErrorRate * 100).toFixed(1)}% word error rate`}
          </span>
          <small>
            This compares wording and symbols. It does not verify reasoning or
            mathematical correctness.
          </small>
        </div>
      )}
      <div className="rubric-heading">
        <h4>Your assessment</h4>
        <span>{completedScoreCount(scores)}/8 scored</span>
      </div>
      <p className="muted rubric-note">
        0 = fails · 1 = poor · 2 = limited · 3 = adequate · 4 = good · 5 =
        excellent. These are your subjective scores.
      </p>
      <div className="rubric-fields">
        {EVALUATION_CATEGORIES.map(({ key, label, description }) => (
          <label className="rubric-row" key={key} title={description}>
            <span>{label}</span>
            <select
              aria-label={`${PROVIDER_LABELS[result.provider]} ${label} score`}
              className="input score-select"
              disabled={saving}
              value={scores[key] ?? ""}
              onChange={(event) =>
                setScores((current) => {
                  const updated = { ...current };
                  if (event.target.value === "") delete updated[key];
                  else updated[key] = Number(event.target.value);
                  return updated;
                })
              }
            >
              <option value="">—</option>
              {[0, 1, 2, 3, 4, 5].map((score) => (
                <option key={score} value={score}>
                  {score}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="field result-notes">
        <span className="label">
          Assessment notes / strengths and weaknesses
        </span>
        <textarea
          className="input"
          rows={3}
          disabled={saving}
          maxLength={6000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Record specific examples from the source images…"
        />
      </label>
      {total !== null && (
        <div className="saved-assessment">
          <strong>Saved score: {total}/40</strong>
          <small>
            {highlights.strengths.length
              ? `Strengths (4–5): ${highlights.strengths.join(", ")}. `
              : ""}
            {highlights.weaknesses.length
              ? `Needs review (0–2): ${highlights.weaknesses.join(", ")}.`
              : ""}
          </small>
        </div>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <button className="btn btn-secondary" disabled={saving} onClick={save}>
        <Save size={15} />
        {saving ? "Saving…" : "Save assessment"}
      </button>
    </article>
  );
}
