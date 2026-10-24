"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Printer,
  Save,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import ReportDocument from "@/components/report/ReportDocument";
import { request } from "@/lib/client";
import {
  emptyReportDraft,
  type ComparisonRun,
  type ReportDraft,
} from "@/lib/comparison";
import type { Lesson } from "@/lib/types";
import "@/components/comparison/comparison.css";
import "@/components/report/report.css";

const fields: { key: keyof ReportDraft; label: string; hint: string }[] = [
  {
    key: "problem",
    label: "Project problem",
    hint: "Explain the problem students experience.",
  },
  {
    key: "objective",
    label: "Project objective",
    hint: "Describe what the project aims to achieve.",
  },
  {
    key: "methodology",
    label: "Evaluation methodology",
    hint: "Record your inputs, testing conditions, and scoring method.",
  },
  {
    key: "implementation",
    label: "Implementation approach & product",
    hint: "Explain your chosen approach and the working product.",
  },
  {
    key: "limitations",
    label: "Limitations",
    hint: "Discuss missing evidence, ambiguity, and evaluation limits.",
  },
  {
    key: "conclusion",
    label: "Conclusion",
    hint: "Write findings only after reviewing your actual results.",
  },
];

export default function ReportPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [runs, setRuns] = useState<ComparisonRun[]>([]);
  const [runId, setRunId] = useState("");
  const [draft, setDraft] = useState<ReportDraft>(emptyReportDraft());
  const [loading, setLoading] = useState(true);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lesson = lessons.find((item) => item.id === lessonId);
  const run = runs.find((item) => item.id === runId);

  useEffect(() => {
    request<Lesson[]>("/api/lessons")
      .then((loaded) => {
        setLessons(loaded);
        const requested = new URLSearchParams(window.location.search).get(
          "lessonId",
        );
        setLessonId(
          loaded.some((item) => item.id === requested)
            ? requested!
            : (loaded[0]?.id ?? ""),
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!lessonId) return;
    let active = true;
    setLoadingDraft(true);
    setError("");
    Promise.all([
      request<ComparisonRun[]>(
        `/api/comparisons?lessonId=${encodeURIComponent(lessonId)}`,
      ),
      request<ReportDraft>(
        `/api/report?lessonId=${encodeURIComponent(lessonId)}`,
      ),
    ])
      .then(([loadedRuns, loadedDraft]) => {
        if (active) {
          setRuns(loadedRuns);
          setRunId(loadedRuns[0]?.id ?? "");
          const hasNarrative = Object.values(loadedDraft ?? {}).some(
            (value) => typeof value === "string" && value.trim(),
          );
          setDraft(
            hasNarrative
              ? { ...emptyReportDraft(), ...loadedDraft }
              : emptyReportDraft(),
          );
          setDirty(false);
          setMessage("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoadingDraft(false);
      });
    return () => {
      active = false;
    };
  }, [lessonId]);
  useEffect(() => {
    function preventExit(event: BeforeUnloadEvent) {
      if (dirty) event.preventDefault();
    }
    window.addEventListener("beforeunload", preventExit);
    return () => window.removeEventListener("beforeunload", preventExit);
  }, [dirty]);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await request<ReportDraft>(
        `/api/report?lessonId=${encodeURIComponent(lessonId)}`,
        { method: "PUT", body: JSON.stringify(draft) },
      );
      setDirty(false);
      setMessage("Report narrative saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the report.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="report-page page-content">
        <div className="report-controls">
          <div className="lab-page-heading">
            <div>
              <span className="lab-kicker">
                <FileText size={15} /> FROM EXPERIMENT TO ASSIGNMENT
              </span>
              <h1>
                A report with receipts<span className="heading-dot">.</span>
              </h1>
              <p className="muted">
                Your project narrative, grounded in your actual saved
                comparisons.
              </p>
            </div>
            <div className="lab-button-row">
              <button
                className="btn btn-secondary"
                disabled={!lesson || loadingDraft}
                onClick={async () => {
                  await document.fonts.ready;
                  await Promise.all(
                    [
                      ...document.querySelectorAll<HTMLImageElement>(
                        ".report-document img",
                      ),
                    ].map((image) => image.decode().catch(() => undefined)),
                  );
                  window.print();
                }}
              >
                <Printer size={16} /> Print / Save PDF
              </button>
              <button
                className="btn btn-primary"
                disabled={!lesson || saving || loadingDraft}
                onClick={save}
              >
                <Save size={16} />
                {saving ? "Saving…" : "Save narrative"}
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          {message && (
            <div className="lab-success" role="status">
              <CheckCircle2 size={16} />
              {message}
            </div>
          )}
          {loading ? (
            <div className="card lab-loading">
              <Loader2 className="spin" size={24} />
              Loading report materials…
            </div>
          ) : !lessons.length ? (
            <div className="card empty-state">
              <FileText size={36} />
              <h2>Your project report starts with a lesson.</h2>
              <p>
                Create or explore a lesson, then evaluate actual AI outputs in
                the comparison lab.
              </p>
              <Link className="btn btn-primary" href="/lessons">
                Go to lessons
              </Link>
            </div>
          ) : (
            <>
              <section className="card report-setup">
                <div className="report-select-grid">
                  <label className="field">
                    <span className="label">Lesson / case study</span>
                    <select
                      className="input"
                      disabled={saving}
                      value={lessonId}
                      onChange={(event) => {
                        if (
                          dirty &&
                          !window.confirm(
                            "You have unsaved report edits. Discard them and change lesson?",
                          )
                        )
                          return;
                        setLessonId(event.target.value);
                      }}
                    >
                      {lessons.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">Saved comparison benchmark</span>
                    <select
                      className="input"
                      value={runId}
                      disabled={saving || loadingDraft || !runs.length}
                      onChange={(event) => setRunId(event.target.value)}
                    >
                      {!runs.length && (
                        <option value="">No comparison saved yet</option>
                      )}
                      {runs.map((item) => (
                        <option key={item.id} value={item.id}>
                          {new Date(item.createdAt).toLocaleString()} ·{" "}
                          {item.results.length} responses
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="report-setup-note">
                  <p className="muted">
                    Four print sections are prepared below. Long text can add
                    pages; preview before submission. Default narrative is
                    editable project context. Findings and scores are never
                    generated.
                  </p>
                  <Link href={lessonId ? `/lab?lessonId=${lessonId}` : "/lab"}>
                    <ArrowLeft size={14} /> Open comparison lab
                  </Link>
                </div>
              </section>
              <details className="card report-editor" open>
                <summary>
                  <span>Edit your project narrative</span>
                  <span className="badge">
                    {dirty ? "Unsaved changes" : "Your own words"}
                  </span>
                </summary>
                <div className="report-editor-grid">
                  {fields.map(({ key, label, hint }) => (
                    <label className="field" key={key}>
                      <span className="label">{label}</span>
                      <textarea
                        className="input"
                        aria-label={label}
                        disabled={saving || loadingDraft}
                        rows={key === "conclusion" ? 5 : 4}
                        value={draft[key]}
                        maxLength={6000}
                        placeholder={hint}
                        onChange={(event) => {
                          setDraft((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }));
                          setDirty(true);
                          setMessage("");
                        }}
                      />
                      <small className="muted">{hint}</small>
                    </label>
                  ))}
                </div>
              </details>
              <div className="report-preview-label">
                <span>PRINT PREVIEW</span>
                <small>Saved provider records + your current narrative</small>
              </div>
            </>
          )}
        </div>
        {lesson && !loadingDraft && (
          <ReportDocument lesson={lesson} run={run} draft={draft} />
        )}
      </div>
    </AppShell>
  );
}
