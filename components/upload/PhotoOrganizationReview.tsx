"use client";

import { useState } from "react";
import type { LectureImage, PhotoOrganization } from "@/lib/types";
import { preparedSourceUrl } from "@/lib/board/scene";

export function organizationSummary(organization: PhotoOrganization) {
  const photos = new Set(organization.sequences.flatMap((sequence) => sequence.states.flatMap((state) => state.imageIds)));
  const repeats = new Set(organization.duplicateGroups.flatMap((group) => group.imageIds.filter((id) => id !== group.primaryImageId)));
  const states = organization.sequences.reduce((total, sequence) => total + sequence.states.length, 0);
  return `${photos.size} photos analyzed · ${repeats.size} possible repeats · ${states} board states`;
}

export function PhotoOrganizationReview({ organization, images, onOriginal, onCorrect, processing = false }: {
  organization: PhotoOrganization;
  images: LectureImage[];
  onOriginal: (id: string) => void;
  onCorrect: () => Promise<void>;
  processing?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const imageMap = new Map(images.map((image) => [image.id, image]));
  async function correct() {
    setBusy(true);
    setError("");
    try { await onCorrect(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open photo-order correction."); }
    finally { setBusy(false); }
  }
  function photo(id: string, primary = false) {
    const image = imageMap.get(id);
    return image ? <button key={id} className="organization-photo" onClick={() => onOriginal(id)} aria-label={`View analyzed photo ${image.sequence + 1}: ${image.originalFilename}`}>
      <img src={preparedSourceUrl(id, image.rotation)} alt="" />
      <span>Photo {image.sequence + 1}{primary ? " · Primary" : ""}</span>
    </button> : <span key={id} className="organization-missing">Removed source photo</span>;
  }
  return <div className="organization-review">
    <p className="organization-summary">{organizationSummary(organization)}</p>
    <p className="muted">{organization.mode === "MANUAL" ? "This lecture uses your corrected order." : "The suggested order follows visible board changes. All original photos remain available."}</p>
    {organization.sequences.length > 1 && <p className="organization-warning">These sequences are shown independently. Their relative chronology is not established.</p>}
    {organization.warnings.map((warning, index) => <p className="organization-warning" key={index}>{warning}</p>)}
    {organization.sequences.map((sequence, sequenceIndex) => <section className="organization-sequence" key={sequence.id}>
      <h3>{sequence.title || `Sequence ${sequenceIndex + 1}`}</h3>
      <p className={sequence.orderingConfidence === "LOW" ? "organization-warning" : "organization-confidence"}>{organization.mode === "MANUAL" ? "Your photo order · User correction" : sequence.orderingConfidence === "LOW" ? "Order uncertain" : sequence.orderingConfidence === "MEDIUM" ? "Suggested order · Some relationships need review" : "Suggested order · High model confidence"}</p>
      {sequence.uncertainty && <p className="organization-warning">{sequence.uncertainty}</p>}
      <ol className="organization-state-list">{sequence.states.map((state, index) => <li key={state.id}>
        <div className="organization-state-heading"><strong>Board state {index + 1}</strong>{state.confidence === "LOW" && <span>Uncertain relationship</span>}</div>
        <div className="organization-photo-strip">{[state.primaryImageId, ...state.imageIds.filter((id) => id !== state.primaryImageId)].map((id) => photo(id, id === state.primaryImageId))}</div>
        <p>{state.reason}</p>
      </li>)}</ol>
    </section>)}
    {organization.duplicateGroups.length > 0 && <details className="lesson-advanced organization-duplicates"><summary>Repeated or overlapping captures ({organization.duplicateGroups.length} groups)</summary>{organization.duplicateGroups.map((group, index) => <section key={index}>
      <h3>{group.kind === "EXACT" ? "Exact duplicate" : group.kind === "SAME_STATE" ? "Same board state" : "Possible repeated content"}</h3>
      <div className="organization-photo-strip">{group.imageIds.map((id) => photo(id, id === group.primaryImageId))}</div>
      <p>{group.reason}</p>
    </section>)}</details>}
    <details className="lesson-advanced"><summary>Photo relationships</summary><ul>{organization.relationships.map((relationship, index) => {
      const from = imageMap.get(relationship.fromImageId), to = imageMap.get(relationship.toImageId);
      return <li key={index}>Photo {from ? from.sequence + 1 : "(removed)"} / Photo {to ? to.sequence + 1 : "(removed)"}: {relationship.reason}{relationship.confidence === "LOW" ? " · Uncertain" : ""}</li>;
    })}</ul></details>
    {error && <p className="upload-simple-error" role="alert">{error}</p>}
    <button type="button" className="btn btn-secondary" disabled={busy || processing} onClick={() => void correct()}>{busy ? "Opening correction…" : "Correct photo order"}</button>
    {processing && <p className="muted">Photo-order corrections are available when processing finishes.</p>}
  </div>;
}
