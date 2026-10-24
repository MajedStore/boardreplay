"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Camera,
  Clock3,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { request } from "@/lib/client";
import type { Lesson } from "@/lib/types";

const statusLabel: Record<string, string> = {
  PENDING: "Awaiting photos",
  UPLOADING: "Uploading",
  READY: "Ready to reconstruct",
  EXTRACTING: "Reading images",
  RECONSTRUCTING: "Reconstructing",
  COMPLETED: "Ready to replay",
  FAILED: "Needs attention",
};
function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [editing, setEditing] = useState<Lesson | null>(null),
    [deleting, setDeleting] = useState<Lesson | null>(null),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => {
    request<Lesson[]>("/api/lessons")
      .then(setLessons)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function rename() {
    if (!editing || !title.trim()) return;
    setBusy(true);
    try {
      const lesson = await request<Lesson>(`/api/lessons/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.trim() }),
      });
      setLessons(lessons.map((l) => (l.id === lesson.id ? lesson : l)));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename lesson.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await request(`/api/lessons/${deleting.id}`, { method: "DELETE" });
      setLessons(lessons.filter((l) => l.id !== deleting.id));
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete lesson.");
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setBusy(true);
    try {
      const value = await request<{ id: string }>("/api/demo", {
        method: "POST",
      });
      router.push(`/lessons/${value.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open demo.");
      setBusy(false);
    }
  }
  const filtered = lessons.filter(
    (l) =>
      `${l.title} ${l.course} ${l.topic}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "completed" ? !!l.reconstruction : !l.reconstruction)),
  );
  return (
    <AppShell
      title="Your learning library."
      subtitle="A home for the lectures you want to understand, keep, and come back to."
      action={
        <Link href="/lessons/new" className="btn btn-primary">
          <Plus size={16} />
          Create a lesson
        </Link>
      }
    >
      <main className="page-content">
        <div className="dashboard-toolbar">
          <div className="search-field">
            <Search size={15} />
            <input
              aria-label="Search lessons"
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lessons, courses, or topics…"
            />
          </div>
          <select
            className="input"
            aria-label="Filter lessons"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All lessons</option>
            <option value="completed">Ready to replay</option>
            <option value="pending">In progress</option>
          </select>
          <span className="lesson-count">
            {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"} in
            your workspace
          </span>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <div className="lessons-grid">
            {[0, 1, 2].map((i) => (
              <div key={i} className="loading-card" />
            ))}
          </div>
        ) : filtered.length ? (
          <div className="lessons-grid">
            {filtered.map((lesson) => (
              <article key={lesson.id} className="lesson-card">
                <Link
                  href={`/lessons/${lesson.id}`}
                  className="lesson-cover"
                  aria-label={`Open ${lesson.title}`}
                >
                  {lesson.images[0] ? (
                    <img
                      src={lesson.images[0].url}
                      alt="First board photograph"
                      style={{
                        transform: `rotate(${lesson.images[0].rotation}deg)`,
                      }}
                    />
                  ) : (
                    <BookOpen size={37} strokeWidth={1} />
                  )}{" "}
                  {lesson.isDemo && (
                    <span className="sample-label">SAMPLE DATA</span>
                  )}
                  <span className={`badge ${lesson.status.toLowerCase()}`}>
                    {statusLabel[lesson.status]}
                  </span>
                </Link>
                <div className="lesson-card-body">
                  <div className="lesson-card-title">
                    <Link href={`/lessons/${lesson.id}`}>
                      <h3>{lesson.title}</h3>
                    </Link>
                    <Link
                      className="icon-button"
                      href={`/lessons/${lesson.id}`}
                      aria-label={`Open ${lesson.title}`}
                    >
                      <ArrowUpRight size={16} />
                    </Link>
                  </div>
                  <p className="lesson-card-course">
                    {lesson.course || "Independent study"}
                  </p>
                  <div className="lesson-card-meta">
                    <span>
                      <Camera size={12} />
                      {lesson.images.length} photos
                    </span>
                    <span>
                      <CalendarDays size={12} />
                      {formatDate(lesson.createdAt)}
                    </span>
                  </div>
                  <div className="lesson-card-footer">
                    <span>
                      <Clock3
                        size={10}
                        style={{
                          display: "inline",
                          verticalAlign: "middle",
                          marginRight: 4,
                        }}
                      />
                      Edited {formatDate(lesson.updatedAt)}
                    </span>
                    <div className="lesson-card-actions">
                      <button
                        className="icon-button"
                        aria-label={`Rename ${lesson.title}`}
                        onClick={() => {
                          setEditing(lesson);
                          setTitle(lesson.title);
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Delete ${lesson.title}`}
                        onClick={() => setDeleting(lesson)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="card empty-state">
            <BookOpen size={37} strokeWidth={1.2} />
            <h3>
              {lessons.length
                ? "No lessons match your search."
                : "Every lesson starts with a photo."}
            </h3>
            <p>
              {lessons.length
                ? "Try another search or clear your filter."
                : "Bring your whiteboard photos together and turn them into something you can learn from again."}
            </p>
            {lessons.length ? (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Clear filters
              </button>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <Link className="btn btn-primary" href="/lessons/new">
                  Create your first lesson <Plus size={14} />
                </Link>
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={demo}
                >
                  {busy ? "Opening…" : "Try the sample lesson"}
                </button>
              </div>
            )}
          </div>
        )}
        <div className="privacy-note" style={{ marginTop: 30 }}>
          <BookOpen size={15} />
          <span>
            This is your local, single-user workspace. Lessons and original
            photographs are saved on this server. No registration required.
          </span>
        </div>
      </main>
      {editing && (
        <div className="modal-overlay">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
          >
            <div className="modal-head">
              <h2>Rename lesson</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEditing(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <label className="field">
              <span className="label">Lesson name</span>
              <input
                className="input"
                autoFocus
                required
                maxLength={180}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !title.trim()}
              >
                {busy ? "Saving…" : "Save name"}
              </button>
            </div>
          </form>
        </div>
      )}
      {deleting && (
        <div className="modal-overlay">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <div className="modal-head">
              <h2 id="delete-title">Delete this lesson?</h2>
              <button
                className="icon-button"
                onClick={() => setDeleting(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="muted">
              “{deleting.title}” and its photographs, reconstruction, revisions,
              and comparison results will be permanently removed.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleting(null)}
              >
                Keep lesson
              </button>
              <button
                className="btn btn-danger"
                onClick={remove}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete lesson"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
