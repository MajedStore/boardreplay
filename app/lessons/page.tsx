"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, MoreHorizontal, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { request } from "@/lib/client";
import type { Lesson } from "@/lib/types";

const statusLabel: Record<string, string> = {
  PENDING: "Add photos", UPLOADING: "Uploading photos…", READY: "Ready to organize",
  ANALYZING: "Analyzing photos…", FINDING_DUPLICATES: "Finding repeated content…", ORGANIZING: "Organizing your lecture…",
  EXTRACTING: "Reading your photos…", RECONSTRUCTING: "Writing explanations…", FAILED: "Needs attention",
};

function LessonActions({ lesson, onRename, onDelete }: { lesson: Lesson; onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function dismiss(event: PointerEvent) { if (!ref.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="simple-menu-wrap" ref={ref}>
    <button ref={trigger} className="icon-button" aria-label={`Options for ${lesson.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={20} /></button>
    {open && <div className="simple-menu" role="menu" aria-label={`Options for ${lesson.title}`} onKeyDown={(event) => {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key === "Tab") setOpen(false);
    }}>
      <button role="menuitem" className="simple-menu-item" onClick={() => { setOpen(false); trigger.current?.focus(); onRename(); }}><Pencil size={16} />Rename</button>
      <button role="menuitem" className="simple-menu-item danger" onClick={() => { setOpen(false); trigger.current?.focus(); onDelete(); }}><Trash2 size={16} />Delete</button>
    </div>}
  </div>;
}

function LessonDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="simple-dialog" aria-labelledby="lesson-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className="simple-dialog-header"><h2 id="lesson-dialog-title">{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
    {children}
  </dialog>;
}

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [deleting, setDeleting] = useState<Lesson | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => {
    request<Lesson[]>("/api/lessons").then(setLessons).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  async function rename() {
    if (!editing || !title.trim()) return;
    setBusy(true);
    try {
      const lesson = await request<Lesson>(`/api/lessons/${editing.id}`, { method: "PATCH", body: JSON.stringify({ title: title.trim() }) });
      setLessons((current) => current.map((item) => item.id === lesson.id ? lesson : item));
      setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not rename lesson."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await request(`/api/lessons/${deleting.id}`, { method: "DELETE" });
      setLessons((current) => current.filter((item) => item.id !== deleting.id));
      setDeleting(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete lesson."); }
    finally { setBusy(false); }
  }
  async function demo() {
    setBusy(true);
    try { const value = await request<{ id: string }>("/api/demo", { method: "POST" }); router.push(`/lessons/${value.id}`); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not open demo."); setBusy(false); }
  }
  const filtered = lessons.filter((lesson) => `${lesson.title} ${lesson.course} ${lesson.topic}`.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || (filter === "completed" ? !!lesson.document : !lesson.document)));
  return <AppShell title="Your lessons" action={<Link href="/lessons/new" className="btn btn-primary"><Upload size={17} />Upload photos</Link>}>
    <main className="page-content simple-library">
      {lessons.length > 0 && <div className="simple-library-toolbar">
        <div className="simple-search"><Search size={18} /><input aria-label="Search lessons" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lessons" /></div>
        <select className="input simple-library-filter" aria-label="Filter lessons" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All lessons</option><option value="completed">Ready to study</option><option value="pending">In progress</option></select>
      </div>}
      {error && !editing && !deleting && <div className="alert error" role="alert">{error}</div>}
      {loading ? <p className="simple-loading" role="status">Loading lessons…</p> : filtered.length > 0 ? <div className="simple-lesson-list">
        {filtered.map((lesson) => <article key={lesson.id} className="simple-lesson-row">
          <Link href={`/lessons/${lesson.id}`} className="simple-lesson-link" aria-label={`Open ${lesson.title}`}>
            <div className="simple-lesson-thumb">{lesson.images[0] ? <img src={`/api/images/${lesson.images[0].id}/prepared?rotation=${lesson.images[0].rotation}`} alt="" /> : <BookOpen size={23} strokeWidth={1.5} />}</div>
            <div className="simple-lesson-info"><h2>{lesson.title}</h2>{statusLabel[lesson.status] && <p className={lesson.status === "FAILED" ? "simple-lesson-status failed" : "simple-lesson-status"}>{statusLabel[lesson.status]}</p>}</div>
            <time className="simple-lesson-date" dateTime={lesson.updatedAt}>{new Date(lesson.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
          </Link>
          <LessonActions lesson={lesson} onRename={() => { setError(""); setTitle(lesson.title); setEditing(lesson); }} onDelete={() => { setError(""); setDeleting(lesson); }} />
        </article>)}
      </div> : <div className="simple-library-empty"><BookOpen size={32} strokeWidth={1.4} /><h2>{lessons.length ? "No lessons found" : "Your next lesson starts with a photo."}</h2>{lessons.length ? <button className="btn btn-secondary" onClick={() => { setSearch(""); setFilter("all"); }}>Clear search</button> : <button className="simple-text-button" disabled={busy} onClick={demo}>{busy ? "Opening…" : "Try a demo"}</button>}</div>}
    </main>
    {editing && <LessonDialog title="Rename lesson" onClose={() => !busy && setEditing(null)}><form onSubmit={(event) => { event.preventDefault(); void rename(); }}><label className="field"><span className="label">Lesson name</span><input className="input" autoFocus required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} /></label>{error && <p className="alert error" role="alert">{error}</p>}<div className="simple-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !title.trim()}>{busy ? "Saving…" : "Save name"}</button></div></form></LessonDialog>}
    {deleting && <LessonDialog title="Delete this lesson?" onClose={() => !busy && setDeleting(null)}><p className="muted">“{deleting.title}” and its photos, explanations, and saved comparisons will be permanently deleted.</p>{error && <p className="alert error" role="alert">{error}</p>}<div className="simple-dialog-actions"><button className="btn btn-secondary" autoFocus disabled={busy} onClick={() => setDeleting(null)}>Keep lesson</button><button className="btn btn-danger" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete lesson"}</button></div></LessonDialog>}
  </AppShell>;
}
