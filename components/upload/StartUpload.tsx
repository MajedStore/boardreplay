"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ImagePlus, Loader2, Play, Upload } from "lucide-react";
import { request } from "@/lib/client";
import type { Lesson } from "@/lib/types";
import { hasPhotoFiles, photoValidationError } from "./files";
import "./upload.css";

const emptyDetails = {
  title: "",
  course: "",
  topic: "",
  date: "",
  language: "Original language",
  instructions: "",
};

export function StartUpload({ optionalDetails = false }: { optionalDetails?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const createdLesson = useRef<string | null>(null);
  const pending = useRef(false);
  const [details, setDetails] = useState(emptyDetails);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);

  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

  async function upload(value: FileList | File[] | null) {
    if (!value?.length || pending.current) return;
    const files = Array.from(value);
    const validationError = photoValidationError(files);
    if (validationError) {
      setError(validationError);
      if (input.current) input.current.value = "";
      if (camera.current) camera.current.value = "";
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setPreviews(files.map((file) => ({ url: URL.createObjectURL(file), name: file.name })));
    try {
      if (!createdLesson.current) {
        const today = new Date();
        const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const filename = files[0].name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
        const title = details.title.trim() || filename || `Whiteboard lesson · ${today.toLocaleDateString()}`;
        const lesson = await request<Lesson>("/api/lessons", {
          method: "POST",
          body: JSON.stringify({ ...details, title: title.slice(0, 180), date: details.date || date }),
        });
        createdLesson.current = lesson.id;
      }
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      await request<Lesson>(`/api/lessons/${createdLesson.current}/images`, { method: "POST", body });
      router.push(`/lessons/${createdLesson.current}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload your photos. Try again.");
      setBusy(false);
      pending.current = false;
      if (input.current) input.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  }

  async function openDemo(example?: string) {
    setDemoBusy(true);
    setError("");
    try {
      const lesson = await request<{ id: string }>(`/api/demo${example ? `?example=${encodeURIComponent(example)}` : ""}`, { method: "POST" });
      router.push(`/lessons/${lesson.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the demo.");
      setDemoBusy(false);
    }
  }

  return (
    <div className="upload-simple upload-simple-start">
      <input ref={input} className="upload-simple-input" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Upload photos" disabled={busy || demoBusy} onChange={(event) => void upload(event.target.files)} />
      <input ref={camera} className="upload-simple-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Take a photo" disabled={busy || demoBusy} onChange={(event) => void upload(event.target.files)} />
      <div
        className={`upload-simple-drop${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => { if (hasPhotoFiles(event)) { event.preventDefault(); setDragging(true); } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (!busy && !demoBusy) void upload(event.dataTransfer.files); }}
        aria-busy={busy}
      >
        {busy ? <Loader2 className="spin upload-simple-symbol" size={32} /> : <ImagePlus className="upload-simple-symbol" size={32} strokeWidth={1.5} />}
        <p className="upload-simple-drop-title" role="status">{busy ? "Uploading your photos…" : "Drop your whiteboard photos here"}</p>
        <span className="upload-simple-hint">JPG, PNG or WebP · Up to 20 photos</span>
        <div className="upload-simple-actions">
          <button className="btn btn-primary" disabled={busy || demoBusy} onClick={() => input.current?.click()}><Upload size={16} /> Upload photos</button>
          <button className="upload-simple-text-button" disabled={busy || demoBusy} onClick={() => void openDemo()}><Play size={15} /> {demoBusy ? "Opening demo…" : "Try a demo"}</button>
        </div>
        <button className="upload-simple-camera" disabled={busy || demoBusy} onClick={() => camera.current?.click()}><Camera size={15} /> Use camera</button>
      </div>
      {previews.length > 0 && <div className="upload-simple-pending" aria-label="Selected photos">{previews.map((preview, index) => <img key={`${preview.name}-${index}`} src={preview.url} alt={preview.name} />)}</div>}
      {error && <div className="upload-simple-error" role="alert">{error}{createdLesson.current && <Link href={`/lessons/${createdLesson.current}`}>Open this lesson</Link>}</div>}
      <details className="upload-simple-settings upload-simple-examples"><summary>More examples</summary><div><button disabled={busy || demoBusy} onClick={() => void openDemo("circuit")}>Circuit</button><button disabled={busy || demoBusy} onClick={() => void openDemo("advanced-math")}>Advanced mathematics</button><button disabled={busy || demoBusy} onClick={() => void openDemo("text-table")}>Text and tables</button></div></details>
      {optionalDetails && <details className="upload-simple-settings upload-simple-details">
        <summary>Lesson details <span>Optional</span></summary>
        <div className="upload-simple-fields">
          <label className="field"><span className="label">Lesson name</span><input className="input" value={details.title} maxLength={180} placeholder="Use the first photo’s name" onChange={(event) => setDetails({ ...details, title: event.target.value })} disabled={busy} /></label>
          <label className="field"><span className="label">Course</span><input className="input" value={details.course} maxLength={180} onChange={(event) => setDetails({ ...details, course: event.target.value })} disabled={busy} /></label>
          <label className="field"><span className="label">Topic</span><input className="input" value={details.topic} maxLength={300} onChange={(event) => setDetails({ ...details, topic: event.target.value })} disabled={busy} /></label>
          <label className="field"><span className="label">Date</span><input className="input" type="date" value={details.date} onChange={(event) => setDetails({ ...details, date: event.target.value })} disabled={busy} /></label>
          <label className="field"><span className="label">Language</span><select className="input" value={details.language} onChange={(event) => setDetails({ ...details, language: event.target.value })} disabled={busy}>{["Original language", "English", "Türkçe", "Deutsch", "Français", "Español", "العربية"].map((language) => <option key={language}>{language}</option>)}</select></label>
          <label className="field upload-simple-field-wide"><span className="label">Reconstruction instructions</span><textarea className="input" value={details.instructions} maxLength={4000} rows={3} onChange={(event) => setDetails({ ...details, instructions: event.target.value })} disabled={busy} /></label>
        </div>
      </details>}
    </div>
  );
}
