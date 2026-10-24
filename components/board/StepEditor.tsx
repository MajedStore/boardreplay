"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GitMerge, Scissors, X } from "lucide-react";
import { Content } from "@/components/Content";
import type { Reconstruction, ReconstructionStep } from "@/lib/types";

export function StepEditor({
  reconstruction,
  step,
  onClose,
  onSave,
  busy,
}: {
  reconstruction: Reconstruction;
  step: ReconstructionStep;
  onClose: () => void;
  onSave: (value: Reconstruction) => Promise<void>;
  busy: boolean;
}) {
  const [text, setText] = useState(step.text),
    [latex, setLatex] = useState(step.latex || ""),
    [uncertainty, setUncertainty] = useState(step.uncertainty || ""),
    [explanation, setExplanation] = useState(!!step.explanation),
    [sectionTitle, setSectionTitle] = useState(
      reconstruction.sections.find((s) => s.id === step.sectionId)?.title ||
        "Section",
    ),
    [splitTitle, setSplitTitle] = useState(""),
    [draft, setDraft] = useState<Reconstruction>(
      structuredClone(reconstruction),
    );
  const index = draft.steps.findIndex((s) => s.id === step.id),
    currentSectionId = draft.steps[index].sectionId,
    sectionIndex = draft.sections.findIndex((s) => s.id === currentSectionId);
  function move(offset: number) {
    const steps = [...draft.steps];
    [steps[index], steps[index + offset]] = [
      steps[index + offset],
      steps[index],
    ];
    setDraft({
      ...draft,
      steps: steps.map((s, i) => ({ ...s, stepIndex: i })),
    });
  }
  function split() {
    if (!splitTitle.trim()) return;
    const id = crypto.randomUUID();
    let reached = false;
    const steps = draft.steps.map((s) => {
      if (s.id === step.id) reached = true;
      return reached && s.sectionId === currentSectionId
        ? { ...s, sectionId: id }
        : s;
    });
    const sections = [...draft.sections];
    sections.splice(sectionIndex + 1, 0, { id, title: splitTitle.trim() });
    setDraft({ ...draft, steps, sections });
    setSectionTitle(splitTitle.trim());
    setSplitTitle("");
  }
  function merge() {
    if (sectionIndex <= 0) return;
    const previous = draft.sections[sectionIndex - 1].id;
    setSectionTitle(draft.sections[sectionIndex - 1].title);
    setDraft({
      ...draft,
      sections: draft.sections.filter((s) => s.id !== currentSectionId),
      steps: draft.steps.map((s) =>
        s.sectionId === currentSectionId ? { ...s, sectionId: previous } : s,
      ),
    });
  }
  function save() {
    const value = {
      ...draft,
      sections: draft.sections.map((s) =>
        s.id === currentSectionId
          ? { ...s, title: sectionTitle.trim() || s.title }
          : s,
      ),
      steps: draft.steps.map((s, i) =>
        s.id === step.id
          ? {
              ...s,
              text,
              latex: latex || null,
              uncertainty: uncertainty || null,
              explanation,
              evidenceStatus: "USER_EDITED" as const,
              originalText: s.originalText || step.text,
              stepIndex: i,
            }
          : { ...s, stepIndex: i },
      ),
    };
    void onSave(value);
  }
  return (
    <div className="modal-overlay">
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-step-title"
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow" style={{ marginBottom: 5 }}>
              REVIEW & CORRECT
            </span>
            <h2 id="edit-step-title">Make this step your own.</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close editor"
          >
            <X size={20} />
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11 }}>
          Corrections are labeled as user edits. The previous version is kept in
          revision history.
        </p>
        <label className="field">
          <span className="label">Section name</span>
          <input
            className="input"
            value={sectionTitle}
            onChange={(e) => setSectionTitle(e.target.value)}
            maxLength={300}
          />
        </label>
        <label className="field">
          <span className="label">Text / Markdown</span>
          <textarea
            className="input"
            rows={5}
            maxLength={30000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="label">LaTeX expression</span>
          <textarea
            className="input"
            rows={2}
            maxLength={30000}
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            placeholder="e.g. x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}"
          />
          <span className="field-help">
            Enter LaTeX without dollar-sign delimiters. Leave blank for a
            text-only step.
          </span>
        </label>
        <label className="field">
          <span className="label">Uncertainty / unreadable content</span>
          <textarea
            className="input"
            rows={2}
            maxLength={4000}
            value={uncertainty}
            onChange={(e) => setUncertainty(e.target.value)}
            placeholder="Describe what is missing or cannot be read."
          />
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            marginTop: 15,
          }}
        >
          <input
            type="checkbox"
            checked={explanation}
            onChange={(e) => setExplanation(e.target.checked)}
          />
          This is an added educational explanation, separate from the lecture.
        </label>
        <div className="editor-preview">
          <span className="eyebrow" style={{ fontSize: 8 }}>
            LIVE PREVIEW
          </span>
          <Content text={text} />
          {latex && <Content text={`$$\n${latex}\n$$`} />}
        </div>
        <div className="editor-controls">
          <button
            className="btn btn-secondary btn-small"
            disabled={busy || index === 0}
            onClick={() => move(-1)}
          >
            <ArrowUp size={12} />
            Earlier
          </button>
          <button
            className="btn btn-secondary btn-small"
            disabled={busy || index === draft.steps.length - 1}
            onClick={() => move(1)}
          >
            <ArrowDown size={12} />
            Later
          </button>
          <button
            className="btn btn-secondary btn-small"
            disabled={busy || sectionIndex <= 0}
            onClick={merge}
          >
            <GitMerge size={12} />
            Merge section with previous
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            className="input"
            aria-label="New section name"
            value={splitTitle}
            onChange={(e) => setSplitTitle(e.target.value)}
            placeholder="New section name"
            maxLength={300}
          />
          <button
            className="btn btn-secondary btn-small"
            disabled={!splitTitle.trim() || busy}
            onClick={split}
          >
            <Scissors size={12} />
            Split here
          </button>
        </div>
        <p className="field-help" style={{ margin: "10px 0 0" }}>
          Position {index + 1} of {draft.steps.length} · {draft.sections.length}{" "}
          sections. Section and order changes are applied when you save.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || (!text.trim() && !latex.trim())}
            onClick={save}
          >
            {busy ? "Saving…" : "Save correction"}
          </button>
        </div>
      </div>
    </div>
  );
}
