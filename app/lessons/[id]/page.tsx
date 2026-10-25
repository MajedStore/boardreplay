"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Download, FlaskConical, History, Images, Info, Loader2, Maximize2, MoreHorizontal, Settings2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Brand } from "@/components/layout/AppShell";
import { Dialog } from "@/components/layout/Dialog";
import { UploadPanel } from "@/components/upload/UploadPanel";
import { AiSettingsDialog } from "@/components/ai/AiSettingsDialog";
import { PhotoOrganizationReview } from "@/components/upload/PhotoOrganizationReview";
import { LectureDocument } from "@/components/lecture/LectureDocument";
import { preparedSourceUrl } from "@/lib/board/scene";
import { request } from "@/lib/client";
import type { Lesson, PhotoExplanation, ProviderId, ProviderInfo } from "@/lib/types";
import "./workspace.css";

type Panel = "original" | "photos" | "review" | "history" | "settings" | "processing" | "ai" | null;
const activeStatuses = ["UPLOADING", "ANALYZING", "FINDING_DUPLICATES", "ORGANIZING", "EXTRACTING", "RECONSTRUCTING"];
const processingMessages: Record<string, string> = { UPLOADING: "Saving your photos…", ANALYZING: "Analyzing photos…", EXTRACTING: "Analyzing photos…", FINDING_DUPLICATES: "Finding repeated content…", ORGANIZING: "Organizing your lecture…", RECONSTRUCTING: "Writing explanations…" };
const aiPreferenceKey = "boardreplay:ai-provider";

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [preferredAi, setPreferredAi] = useState<ProviderId | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [menu, setMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [selectedImage, setSelectedImage] = useState("");
  const [zoom, setZoom] = useState(100);
  const [manualCorrection, setManualCorrection] = useState(false);
  const [editor, setEditor] = useState<{ imageId: string; heading: string; bodyMarkdown: string } | null>(null);
  const [name, setName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const previousStatus = useRef<string | null>(null);
  const lecture = lesson?.document;
  const isProcessing = !!lesson && activeStatuses.includes(lesson.status);
  const selectedProvider = providers.find((item) => item.id === preferredAi && item.configured)?.id || providers.find((item) => item.configured)?.id || "";
  const organization = lecture?.organization || lesson?.photoOrganization;
  const orderedImageIds = lecture?.photos.map((photo) => photo.imageId) || lesson?.images.map((image) => image.id) || [];
  const image = lesson?.images.find((item) => item.id === selectedImage) || lesson?.images.find((item) => item.id === orderedImageIds[0]);
  const imageIndex = orderedImageIds.indexOf(image?.id || "");
  const explanation = lecture?.photos.find((photo) => photo.imageId === image?.id);
  const sourceRotation = explanation?.rotation ?? image?.rotation ?? 0;
  const refresh = useCallback(async () => { const value = await request<Lesson>(`/api/lessons/${id}`); setLesson(value); return value; }, [id]);

  useEffect(() => {
    let mounted = true;
    try {
      const saved = localStorage.getItem(aiPreferenceKey);
      if (saved === "openai" || saved === "gemini" || saved === "anthropic") setPreferredAi(saved);
      document.documentElement.dataset.theme = localStorage.getItem("boardreplay-theme") === "dark" ? "dark" : "light";
    } catch { /* Session settings work without browser storage. */ }
    Promise.all([request<Lesson>(`/api/lessons/${id}`), request<ProviderInfo[]>("/api/providers")])
      .then(([value, options]) => { if (mounted) { setLesson(value); setProviders(options); } })
      .catch((cause) => { if (mounted) setError(cause.message); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [id]);
  useEffect(() => {
    if (!isProcessing) return;
    const timer = setInterval(() => { void refresh().catch((cause) => setError(cause.message)); }, 1800);
    return () => clearInterval(timer);
  }, [isProcessing, refresh]);
  useEffect(() => {
    if (previousStatus.current && activeStatuses.includes(previousStatus.current) && lesson?.status === "COMPLETED") setToast("Your organized lecture is ready.");
    previousStatus.current = lesson?.status || null;
  }, [lesson?.status]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!menu) return;
    function close(event: PointerEvent) { if (!menuRef.current?.contains(event.target as Node)) setMenu(false); }
    function keys(event: KeyboardEvent) { if (event.key === "Escape") setMenu(false); }
    window.addEventListener("pointerdown", close); window.addEventListener("keydown", keys);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", keys); };
  }, [menu]);

  function openPanel(value: Panel) { setMenu(false); setPanel(value); if (value === "settings") setName(lesson?.title || ""); if (value === "photos") setManualCorrection(false); }
  function chooseAi(value: ProviderId) { setPreferredAi(value); try { localStorage.setItem(aiPreferenceKey, value); } catch { /* Keep the session choice. */ } }
  function openPhoto(photo: PhotoExplanation | string) { setSelectedImage(typeof photo === "string" ? photo : photo.imageId); setZoom(100); openPanel("original"); }
  function navigateImage(offset: number) { const next = orderedImageIds[imageIndex + offset]; if (next) { setSelectedImage(next); setZoom(100); } }
  async function process(provider: ProviderId, orderMode: "AUTO" | "MANUAL" = "AUTO", forceRefresh = false) {
    if (!lesson || starting || isProcessing) return;
    setStarting(true); setError(""); setPanel(null);
    try { await request(`/api/lessons/${id}/process`, { method: "POST", body: JSON.stringify({ provider, orderMode, ...(forceRefresh ? { forceRefresh: true } : {}) }) }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start lecture organization."); }
    finally { setStarting(false); }
  }
  function regenerate() {
    if (!lesson || starting || isProcessing) return;
    if (!selectedProvider) { openPanel("ai"); return; }
    void process(selectedProvider, lesson.organizationMode === "MANUAL" ? "MANUAL" : "AUTO");
  }
  async function movePhoto(photo: PhotoExplanation, direction: "earlier" | "later") {
    if (!lecture || saving || isProcessing) return;
    const order = lecture.photos.map((item) => item.imageId), from = order.indexOf(photo.imageId), to = from + (direction === "earlier" ? -1 : 1);
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    setSaving(true); setError("");
    try { setLesson(await request<Lesson>(`/api/lessons/${id}`, { method: "PATCH", body: JSON.stringify({ documentOrder: order }) })); setToast("Photo order saved. Regenerate explanations to update their context."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change the photo order."); }
    finally { setSaving(false); }
  }
  async function saveExplanation(event: FormEvent) {
    event.preventDefault(); if (!editor) return;
    setSaving(true); setError("");
    try { setLesson(await request<Lesson>(`/api/lessons/${id}`, { method: "PATCH", body: JSON.stringify({ explanation: editor }) })); setEditor(null); setToast("Explanation saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the explanation. Your draft is still open."); }
    finally { setSaving(false); }
  }
  async function correctPhotoOrder() {
    if (lecture) { setPanel(null); document.getElementById("photo-1")?.scrollIntoView({ behavior: "smooth" }); setToast("Use Move earlier or Move later below a photo to correct the order."); return; }
    if (!lesson || !organization) return;
    const ids = [...new Set(organization.sequences.flatMap((sequence) => sequence.states.flatMap((state) => [state.primaryImageId, ...state.imageIds])))];
    const imageIds = [...ids.filter((value) => lesson.images.some((photo) => photo.id === value)), ...lesson.images.map((photo) => photo.id).filter((value) => !ids.includes(value))];
    await request(`/api/lessons/${id}/images`, { method: "PATCH", body: JSON.stringify({ imageIds }) });
    await refresh(); setManualCorrection(true); setPanel("photos");
  }
  async function rename(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { setLesson(await request<Lesson>(`/api/lessons/${id}`, { method: "PATCH", body: JSON.stringify({ title: name.trim() }) })); setPanel(null); setToast("Lecture name saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not rename this lecture."); }
    finally { setSaving(false); }
  }
  async function restore(revisionId: string) {
    setSaving(true); setError("");
    try { setLesson(await request<Lesson>(`/api/lessons/${id}/restore`, { method: "POST", body: JSON.stringify({ revisionId }) })); setPanel(null); setToast("Previous version restored."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restore this version."); }
    finally { setSaving(false); }
  }
  async function fullscreen(event: MouseEvent<HTMLButtonElement>) {
    try { const dialog = event.currentTarget.closest("dialog"); if (document.fullscreenElement) await document.exitFullscreen(); else await dialog?.requestFullscreen(); }
    catch { setToast("Fullscreen is unavailable. You can still zoom or open the high-resolution original."); }
  }

  if (loading) return <div className="lesson-loading" role="status"><Loader2 className="spin" size={22} />Opening lecture…</div>;
  if (!lesson) return <main className="lesson-empty"><h1>Lecture unavailable</h1><p role="alert">{error || "This lecture may have been deleted."}</p><Link href="/" className="btn btn-primary">Back to BoardReplay</Link></main>;
  const uploadPanel = <UploadPanel lesson={lesson} providers={providers} selectedProvider={selectedProvider} onProviderChange={chooseAi} onOpenAiSettings={() => openPanel("ai")} initialOrderMode={manualCorrection ? "MANUAL" : undefined} onChange={setLesson} onProcess={process} onError={setError} compact={!!lecture} />;
  return <div className="lesson-app">
    <header className="lesson-topbar">
      <Link href="/lessons" className="icon-button lesson-back" aria-label="Back to lessons"><ArrowLeft size={20} /></Link><Link href="/" className="lesson-brand" aria-label="BoardReplay home"><Brand /></Link>
      <div className="lesson-top-actions">{lecture && <Link className="btn btn-primary lesson-export" href={`/lessons/${id}/print`} target="_blank" aria-label="Export PDF"><Download size={16} /><span>Export PDF</span></Link>}
        <div className="lesson-menu-wrap" ref={menuRef}><button className="icon-button" aria-label="Lesson options" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={22} /></button>
          {menu && <nav className="lesson-menu" aria-label="Lesson options">
            <button onClick={() => openPanel("photos")} disabled={isProcessing}><Images size={16} />Manage photos</button><button onClick={() => openPanel("ai")} disabled={isProcessing}><Settings2 size={16} />Change AI</button>
            {lecture && <button onClick={regenerate} disabled={isProcessing || starting}>Regenerate explanations</button>}{organization && <button onClick={() => openPanel("review")}>Review photo order</button>}
            <button onClick={() => openPanel("settings")}><Settings2 size={16} />Lecture settings</button>{!!lesson.revisions.length && <button onClick={() => openPanel("history")}><History size={16} />Version history</button>}
            <button onClick={() => openPanel("processing")}><Info size={16} />Processing information</button><hr /><Link href={`/lab?lessonId=${id}`}><FlaskConical size={16} />AI Comparison Lab</Link><Link href="/lessons">All lectures</Link>
          </nav>}
        </div>
      </div>
    </header>
    <main className="lesson-reading">
      <header className="lesson-document-heading">{lesson.course && <p className="lesson-course">{lesson.course}</p>}<h1>{lesson.title}</h1>
        <p className="lesson-document-meta">{lesson.images.length} {lesson.images.length === 1 ? "photograph" : "photographs"}{lecture ? <><span aria-hidden="true"> · </span>{lesson.organizationMode === "MANUAL" ? "Your corrected order" : "Organized with AI"}</> : " · Upload in any order"}</p>
        {lesson.isDemo && <p className="lesson-demo-note">Synthetic sample photographs and authored explanations. No live AI output.</p>}{lecture && <p className="lesson-reading-intro">Read the original photographs with contextual explanations below each one. AI explanations are derived from the visible material; unclear passages are marked.</p>}
      </header>
      {error && !editor && <div className="lesson-notice lesson-error" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={17} /></button></div>}
      {lesson.status === "FAILED" && lesson.error && <div className="lesson-notice lesson-error" role="alert"><span>{lesson.error}</span><div><button onClick={regenerate} disabled={starting || isProcessing}>Retry reconstruction</button><button onClick={() => openPanel("photos")}>Review photos</button></div></div>}
      {isProcessing && <section className="lesson-progress" role="status"><Loader2 className="spin" size={21} /><div><h2>{processingMessages[lesson.status] || "Preparing your lecture…"}</h2><p>Photos and completed analysis stay saved. You can return to this lecture later.</p></div></section>}
      {lecture && (lesson.explanationsNeedRefresh || lesson.needsReprocessing) && !isProcessing && <div className="lesson-notice"><span>{lesson.explanationsNeedRefresh ? "The photo order has changed. Update the explanations to follow your corrected sequence." : "Your source photos have changed. Generate an updated lecture when you are ready."}</span><button onClick={regenerate} disabled={starting}>Regenerate explanations<ArrowRight size={14} /></button></div>}
      {lecture && organization && (organization.sequences.length > 1 || organization.sequences.some((sequence) => sequence.orderingConfidence === "LOW")) && <div className="lesson-order-note"><span>Some chronological relationships are uncertain.</span><button onClick={() => openPanel("review")}>Review photo order</button></div>}
      {lecture ? <><LectureDocument document={lecture} images={lesson.images} busy={saving || isProcessing} onOpenPhoto={openPhoto} onEditPhoto={(photo) => setEditor({ imageId: photo.imageId, heading: photo.heading, bodyMarkdown: photo.bodyMarkdown })} onMovePhoto={(photo, direction) => void movePhoto(photo, direction)} />{!!lecture.unresolved.length && <details className="lecture-review-notes"><summary>Notes and uncertain passages</summary><ul>{lecture.unresolved.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}</> : <section className="lesson-upload" aria-label="Prepare lecture"><div className="lesson-upload-intro"><h2>{lesson.reconstruction ? "Your original photos are ready for the new lecture view" : "Start with your lecture photographs"}</h2><p>{lesson.reconstruction ? "Generate contextual explanations to read a photo-first lecture document. Your original photographs and earlier saved work are preserved." : "Add photographs in any order. AI organizes the lecture and writes an explanation directly below every photo."}</p></div>{uploadPanel}{lesson.images.length > 0 && <button type="button" className="text-link lesson-generate-link" disabled={starting || isProcessing} onClick={regenerate}>Generate explanations<ArrowRight size={15} /></button>}</section>}
    </main>
    {panel === "ai" && <AiSettingsDialog providers={providers} initialProvider={selectedProvider} onSave={(options, selected) => { setProviders(options); chooseAi(selected); setToast("AI settings saved. Generate explanations when you are ready."); }} onClose={() => setPanel(null)} />}
    {panel === "photos" && <Dialog title="Manage photos" className="lesson-photos-dialog" busy={starting} onClose={() => setPanel(null)}>{uploadPanel}</Dialog>}
    {panel === "review" && organization && <Dialog title="Review photos" className="lesson-photos-dialog" onClose={() => setPanel(null)}><PhotoOrganizationReview organization={organization} images={lesson.images} onOriginal={openPhoto} onCorrect={correctPhotoOrder} processing={isProcessing} /></Dialog>}
    {panel === "original" && <Dialog title="Original photograph" className="lesson-photo-viewer" onClose={() => setPanel(null)}>{image ? <>
      <div className="lesson-photo-navigation"><button className="icon-button" aria-label="Previous photograph" disabled={imageIndex <= 0} onClick={() => navigateImage(-1)}><ChevronLeft size={20} /></button><span>Photo {imageIndex + 1} of {orderedImageIds.length}</span><button className="icon-button" aria-label="Next photograph" disabled={imageIndex >= orderedImageIds.length - 1} onClick={() => navigateImage(1)}><ChevronRight size={20} /></button></div>
      <div className="lesson-original-viewport"><img src={preparedSourceUrl(image.id, sourceRotation)} alt={`Original source: ${image.originalFilename}`} style={{ width: `${zoom}%`, maxWidth: zoom === 100 ? "100%" : "none" }} /></div>
      <div className="lesson-photo-tools"><button className="icon-button" aria-label="Zoom out photograph" disabled={zoom <= 50} onClick={() => setZoom(Math.max(50, zoom - 25))}><ZoomOut size={18} /></button><button aria-label="Reset photograph zoom" onClick={() => setZoom(100)}>{zoom}%</button><button className="icon-button" aria-label="Zoom in photograph" disabled={zoom >= 300} onClick={() => setZoom(Math.min(300, zoom + 25))}><ZoomIn size={18} /></button><button className="icon-button" aria-label="Fullscreen photograph" onClick={(event) => void fullscreen(event)}><Maximize2 size={18} /></button><a href={image.url} target="_blank" rel="noreferrer">Open high-resolution original</a></div><p className="lesson-photo-filename">{image.originalFilename}</p>
    </> : <p>The original photograph is unavailable.</p>}</Dialog>}
    {editor && <Dialog title="Edit explanation" className="lesson-explanation-editor" busy={saving} onClose={() => { setEditor(null); setError(""); }}><form onSubmit={(event) => void saveExplanation(event)}>{error && <p className="lesson-notice lesson-error" role="alert">{error}</p>}<label className="field"><span className="label">Heading</span><input className="input" aria-label="Heading" value={editor.heading} maxLength={300} onChange={(event) => setEditor({ ...editor, heading: event.target.value })} disabled={saving} /></label><label className="field"><span className="label">Explanation</span><textarea className="input" aria-label="Explanation" rows={15} value={editor.bodyMarkdown} maxLength={30000} onChange={(event) => setEditor({ ...editor, bodyMarkdown: event.target.value })} disabled={saving} required /></label><p className="muted">Use Markdown, LaTeX, or fenced code. The photograph and source references stay linked to this explanation.</p><button className="btn btn-primary" disabled={saving || !editor.bodyMarkdown.trim()}>{saving ? "Saving…" : "Save explanation"}</button></form></Dialog>}
    {panel === "history" && <Dialog title="Version history" busy={saving} onClose={() => setPanel(null)}><p className="muted">Restoring a version also saves your current work.</p>{lesson.revisions.map((revision) => <div className="revision-row" key={revision.id}><div><strong>{revision.reason}</strong><small>{new Date(revision.createdAt).toLocaleString()}</small></div><button className="btn btn-secondary" disabled={saving} onClick={() => void restore(revision.id)}>Restore</button></div>)}</Dialog>}
    {panel === "settings" && <Dialog title="Lecture settings" busy={saving} onClose={() => setPanel(null)}><form onSubmit={(event) => void rename(event)}><label className="field"><span className="label">Lecture name</span><input className="input" required maxLength={180} value={name} onChange={(event) => setName(event.target.value)} /></label><button className="btn btn-primary" disabled={saving || !name.trim()}>Save name</button></form></Dialog>}
    {panel === "processing" && <Dialog title="Processing information" onClose={() => setPanel(null)}><p className="muted">Original photographs remain saved. Each explanation is linked to the photos supporting it.</p>{lesson.runs.map((run) => <div className="lesson-run" key={run.id}><strong>{run.provider} · {run.model}</strong><p>{run.status} · {new Date(run.startedAt).toLocaleString()}</p>{run.error && <p>{run.error}</p>}</div>)}{!lesson.runs.length && <p>No processing runs yet.</p>}</Dialog>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}
