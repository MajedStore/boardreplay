"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Camera, GripVertical, ImagePlus, Loader2, MoreHorizontal, RotateCw, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import { request } from "@/lib/client";
import type { Lesson, LectureImage, ProviderId, ProviderInfo } from "@/lib/types";
import { hasPhotoFiles, photoValidationError } from "./files";
import "./upload.css";

const metadata = (lesson: Lesson) => ({ title: lesson.title, course: lesson.course, topic: lesson.topic, date: lesson.date, language: lesson.language, instructions: lesson.instructions });

export function UploadPanel({
  lesson,
  providers,
  onChange,
  onProcess,
  onError,
  selectedProvider,
  onProviderChange,
  onOpenAiSettings,
  initialOrderMode,
  compact = false,
}: {
  lesson: Lesson;
  providers: ProviderInfo[];
  onChange: (value: Lesson) => void;
  onProcess: (provider: ProviderId, orderMode?: "AUTO" | "MANUAL", forceRefresh?: boolean) => Promise<void>;
  onError: (message: string) => void;
  selectedProvider: ProviderId | "";
  onProviderChange: (value: ProviderId) => void;
  onOpenAiSettings: () => void;
  initialOrderMode?: "AUTO" | "MANUAL";
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<LectureImage | null>(null);
  const [zoom, setZoom] = useState(100);
  const [localError, setLocalError] = useState("");
  const [draft, setDraft] = useState(metadata(lesson));
  const [savedMessage, setSavedMessage] = useState("");
  const [orderMode, setOrderMode] = useState<"AUTO" | "MANUAL">(initialOrderMode || (lesson.organizationMode === "MANUAL" ? "MANUAL" : "AUTO"));
  const [arranged, setArranged] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const provider = selectedProvider || providers.find((item) => item.configured)?.id || "";
  const selectedAi = providers.find((item) => item.id === provider);
  const configured = providers.some((item) => item.configured);
  const processing = ["ANALYZING", "FINDING_DUPLICATES", "ORGANIZING", "EXTRACTING", "RECONSTRUCTING"].includes(lesson.status);
  const locked = busy || processing;

  useEffect(() => { setDraft({ title: lesson.title, course: lesson.course, topic: lesson.topic, date: lesson.date, language: lesson.language, instructions: lesson.instructions }); }, [lesson.id, lesson.title, lesson.course, lesson.topic, lesson.date, lesson.language, lesson.instructions]);
  useEffect(() => {
    if (preview && previewDialog.current && !previewDialog.current.open) previewDialog.current.showModal();
    if (!preview && previewDialog.current?.open) previewDialog.current.close();
    setZoom(100);
  }, [preview]);

  function reportError(message: string) {
    setLocalError(message);
    onError(message);
  }

  async function upload(value: FileList | File[] | null) {
    if (!value?.length || locked) return;
    const files = Array.from(value);
    const error = photoValidationError(files, lesson.images.length);
    if (error) {
      reportError(error);
      if (input.current) input.current.value = "";
      if (camera.current) camera.current.value = "";
      return;
    }
    setBusy(true);
    reportError("");
    try {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      onChange(await request<Lesson>(`/api/lessons/${lesson.id}/images`, { method: "POST", body }));
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : "Could not upload your photos.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  }

  async function mutate(url: string, method: string, body?: unknown) {
    if (locked) return;
    setBusy(true);
    reportError("");
    try {
      await request(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      onChange(await request<Lesson>(`/api/lessons/${lesson.id}`));
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : "Could not update this photo.");
    } finally {
      setBusy(false);
    }
  }

  function reorder(fromId: string, toId: string) {
    if (fromId === toId || locked) return;
    const ids = lesson.images.map((image) => image.id);
    const from = ids.indexOf(fromId), to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, fromId);
    setArranged(true);
    void mutate(`/api/lessons/${lesson.id}/images`, "PATCH", { imageIds: ids });
  }

  async function saveDetails() {
    if (locked || !draft.title.trim()) return;
    setBusy(true);
    reportError("");
    setSavedMessage("");
    try {
      onChange(await request<Lesson>(`/api/lessons/${lesson.id}`, { method: "PATCH", body: JSON.stringify(draft) }));
      setSavedMessage("Details saved.");
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : "Could not save lesson details.");
    } finally { setBusy(false); }
  }

  async function reconstruct() {
    if (locked || !lesson.images.length) return;
    if (!provider || !selectedAi?.configured) { onOpenAiSettings(); return; }
    reportError("");
    setBusy(true);
    try { await onProcess(provider, orderMode, forceRefresh); }
    catch (cause) { reportError(cause instanceof Error ? cause.message : "Could not organize this lecture."); }
    finally { setBusy(false); }
  }

  return (
    <section className={`upload-simple upload-simple-panel${compact ? " is-compact" : ""}`} aria-label="Lesson photos">
      <input ref={input} className="upload-simple-input" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Upload photos" disabled={locked} onChange={(event) => void upload(event.target.files)} />
      <input ref={camera} className="upload-simple-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Take a photo" disabled={locked} onChange={(event) => void upload(event.target.files)} />
      {localError && <p className="upload-simple-error" role="alert">{localError}</p>}
      <div
        className={`upload-simple-drop${lesson.images.length ? " has-photos" : ""}${draggingFiles ? " is-dragging" : ""}`}
        onDragOver={(event) => { if (hasPhotoFiles(event)) { event.preventDefault(); setDraggingFiles(true); } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFiles(false); }}
        onDrop={(event) => { event.preventDefault(); setDraggingFiles(false); if (!locked) void upload(event.dataTransfer.files); }}
        aria-busy={busy}
      >
        {busy ? <Loader2 size={26} className="spin upload-simple-symbol" /> : <ImagePlus size={28} strokeWidth={1.5} className="upload-simple-symbol" />}
        <div className="upload-simple-drop-copy"><p className="upload-simple-drop-title" role="status">{busy ? "Saving your photos…" : lesson.images.length ? "Add more photos" : "Drop your whiteboard photos here"}</p><span className="upload-simple-hint">JPG, PNG or WebP · 10 MB each · Up to 20 photos</span></div>
        <div className="upload-simple-actions">
          <button className={`btn ${lesson.images.length ? "btn-secondary" : "btn-primary"}`} disabled={locked || lesson.images.length >= 20} onClick={() => input.current?.click()}><Upload size={15} /> Upload photos</button>
          <button className="upload-simple-text-button" disabled={locked || lesson.images.length >= 20} onClick={() => camera.current?.click()}><Camera size={16} /> Use camera</button>
        </div>
      </div>

      {lesson.images.length > 0 && <>
        <div className="upload-simple-sequence-heading"><h2>{lesson.images.length} {lesson.images.length === 1 ? "photo" : "photos"}</h2><span>{orderMode === "AUTO" ? "Any order · AI organizes automatically" : "Your corrected order · Earliest first"}</span></div>
        <ol className="upload-simple-photos" aria-label="Photo sequence">
          {lesson.images.map((image, index) => <li
            key={image.id}
            className={`upload-simple-photo${draggedId === image.id ? " is-dragged" : ""}${dropTarget === image.id ? " is-drop-target" : ""}`}
            draggable={!locked}
            onDragStart={(event) => { if (locked) { event.preventDefault(); return; } setDraggedId(image.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-boardreplay-photo", image.id); }}
            onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
            onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes("application/x-boardreplay-photo") && !locked) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(image.id); } }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(event) => { event.preventDefault(); const fromId = event.dataTransfer.getData("application/x-boardreplay-photo"); setDraggedId(null); setDropTarget(null); if (fromId) reorder(fromId, image.id); }}
          >
            <button className="upload-simple-photo-preview" onClick={() => setPreview(image)} aria-label={`Preview photo ${index + 1}: ${image.originalFilename}`}><img src={image.url} alt={`Board photograph ${index + 1}`} style={{ transform: `rotate(${image.rotation}deg)` }} draggable={false} /></button>
            <div className="upload-simple-photo-caption"><span className="upload-simple-photo-number">{index + 1}</span><span className="upload-simple-photo-name" title={image.originalFilename}>{image.originalFilename}</span><GripVertical className="upload-simple-grip" size={14} aria-hidden="true" /><details className="upload-simple-photo-menu"><summary aria-label={`Photo ${index + 1} options`}><MoreHorizontal size={18} /></summary><div>
              <button disabled={locked || index === 0} onClick={() => reorder(image.id, lesson.images[index - 1].id)} aria-label={`Move photo ${index + 1} earlier`}><ArrowUp size={15} /> Move earlier</button>
              <button disabled={locked || index === lesson.images.length - 1} onClick={() => reorder(image.id, lesson.images[index + 1].id)} aria-label={`Move photo ${index + 1} later`}><ArrowDown size={15} /> Move later</button>
              <button disabled={locked} onClick={() => void mutate(`/api/images/${image.id}`, "PATCH", { rotation: (image.rotation + 90) % 360 })} aria-label={`Rotate photo ${index + 1}`}><RotateCw size={15} /> Rotate</button>
              <button disabled={locked} onClick={() => void mutate(`/api/images/${image.id}`, "DELETE")} aria-label={`Remove photo ${index + 1}`}><Trash2 size={15} /> Remove</button>
            </div></details></div>
          </li>)}
        </ol>
      </>}

      <div className="upload-simple-ai">
        <div aria-label="Selected AI"><span>AI</span><strong>{selectedAi?.configured ? selectedAi.name : "Choose your AI"}</strong>{selectedAi?.configured && <small>{selectedAi.model}</small>}</div>
        <button type="button" className="btn btn-secondary" disabled={locked} onClick={onOpenAiSettings}>{configured ? "Change AI" : "Connect AI"}</button>
      </div>
      <div className="upload-simple-bottom">
        <details className="upload-simple-settings">
          <summary><SlidersHorizontal size={15} /> Settings</summary>
          <div className="upload-simple-settings-body">
            <label className="field"><span className="label">AI provider</span><select className="input" value={provider} disabled={locked || !configured} onChange={(event) => onProviderChange(event.target.value as ProviderId)}>{!configured && <option value="">No provider configured</option>}{providers.map((item) => <option key={item.id} value={item.id} disabled={!item.configured}>{item.name}{item.configured ? ` · ${item.model}` : " · Not configured"}</option>)}</select></label>
            <label className="upload-simple-order-option"><input type="checkbox" checked={orderMode === "MANUAL"} disabled={locked} onChange={(event) => setOrderMode(event.target.checked ? "MANUAL" : "AUTO")} />Use this photo order as a manual correction</label>
            <label className="upload-simple-order-option"><input type="checkbox" checked={forceRefresh} disabled={locked} onChange={(event) => setForceRefresh(event.target.checked)} />Analyze photos again</label>
            <p className="upload-simple-settings-note">Unchanged photos reuse saved analysis. Choose “Analyze photos again” to request a fresh reading.</p>
            <p className="upload-simple-settings-note">Automatic organization compares visible board content, repeated captures, and uncertain relationships. Manual order overrides the proposed chronology.</p>
            <p className="upload-simple-settings-note">Photos stay on this server. Generating explanations sends them to your selected AI provider.</p>
            {(lesson.document || lesson.reconstruction) && <p className="upload-simple-settings-note">Generating again saves your current version in history.</p>}
            <details className="upload-simple-details"><summary>Lesson details</summary><div className="upload-simple-fields">
              <label className="field"><span className="label">Lesson name</span><input className="input" value={draft.title} maxLength={180} disabled={locked} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label className="field"><span className="label">Course</span><input className="input" value={draft.course} maxLength={180} disabled={locked} onChange={(event) => setDraft({ ...draft, course: event.target.value })} /></label>
              <label className="field"><span className="label">Topic</span><input className="input" value={draft.topic} maxLength={300} disabled={locked} onChange={(event) => setDraft({ ...draft, topic: event.target.value })} /></label>
              <label className="field"><span className="label">Date</span><input className="input" type="date" value={draft.date} disabled={locked} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
              <label className="field"><span className="label">Language</span><select className="input" value={draft.language} disabled={locked} onChange={(event) => setDraft({ ...draft, language: event.target.value })}>{[...new Set(["Original language", "English", "Türkçe", "Deutsch", "Français", "Español", "العربية", draft.language])].map((language) => <option key={language}>{language}</option>)}</select></label>
              <label className="field upload-simple-field-wide"><span className="label">Explanation instructions</span><textarea className="input" rows={3} value={draft.instructions} maxLength={4000} disabled={locked} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} /></label>
            </div><div className="upload-simple-save"><button className="btn btn-secondary" disabled={locked || !draft.title.trim()} onClick={() => void saveDetails()}>Save details</button></div></details>
          </div>
        </details>
        <button type="button" className="btn btn-primary upload-simple-reconstruct" disabled={locked || !lesson.images.length} onClick={() => void reconstruct()}>{processing ? "Preparing your lecture…" : lesson.document ? "Regenerate explanations" : "Organize lecture"}<ArrowRight size={16} /></button>
      </div>
      {!lesson.images.length && <p className="upload-simple-config-note">Upload at least one valid photo to organize a lecture.</p>}
      {!configured && lesson.images.length > 0 && <p className="upload-simple-config-note">Explanations need an AI connection. Connect AI above or open a clearly labeled synthetic demo in the connection dialog.</p>}
      {arranged && orderMode === "AUTO" && <p className="upload-simple-settings-note">Photos rearranged. AI organization is still on; choose “Use this photo order” in Settings to apply a manual correction.</p>}
      {savedMessage && <p className="upload-simple-settings-note" role="status">{savedMessage}</p>}

      <dialog ref={previewDialog} className="upload-simple-preview" aria-labelledby={`photo-preview-${lesson.id}`} onCancel={() => setPreview(null)} onClose={() => setPreview(null)} onClick={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
        {preview && <><div className="upload-simple-preview-head"><h2 id={`photo-preview-${lesson.id}`}>{preview.originalFilename}</h2><button className="icon-button" onClick={() => setPreview(null)} aria-label="Close image preview" autoFocus><X size={20} /></button></div><div className="upload-simple-preview-image"><img src={preview.url} alt="Full board photograph" style={{ width: `${zoom}%`, transform: `rotate(${preview.rotation}deg)` }} /></div><label className="upload-simple-preview-zoom">Zoom<input type="range" min={100} max={250} step={25} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><span>{zoom}%</span></label></>}
      </dialog>
    </section>
  );
}
