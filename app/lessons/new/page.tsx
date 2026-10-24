"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, ShieldCheck } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { request } from "@/lib/client";
import type { Lesson } from "@/lib/types";

export default function NewLessonPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    course: "",
    topic: "",
    date: "",
    language: "Original language",
    instructions: "",
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function change(key: keyof typeof form, value: string) {
    setForm({ ...form, [key]: value });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const lesson = await request<Lesson>("/api/lessons", {
        method: "POST",
        body: JSON.stringify(form),
      });
      router.push(`/lessons/${lesson.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create lesson.");
      setBusy(false);
    }
  }
  return (
    <AppShell
      title="Make room for a new idea."
      subtitle="A little context helps your lecture come back together."
    >
      <main className="page-content">
        <div className="new-lesson-layout">
          <form className="card" onSubmit={submit}>
            <h2 className="form-section-title">
              <BookOpen size={19} />
              Lesson details
            </h2>
            {error && (
              <div
                className="alert error"
                role="alert"
                style={{ marginBottom: 20 }}
              >
                {error}
              </div>
            )}
            <div className="form-grid">
              <label className="field full">
                <span className="label">
                  Lesson name <span style={{ color: "var(--accent)" }}>*</span>
                </span>
                <input
                  className="input"
                  placeholder="e.g. Solving second-order differential equations"
                  autoFocus
                  required
                  maxLength={180}
                  value={form.title}
                  onChange={(e) => change("title", e.target.value)}
                />
              </label>
              <label className="field full">
                <span className="label">Course name</span>
                <input
                  className="input"
                  placeholder="e.g. Engineering Mathematics II"
                  maxLength={180}
                  value={form.course}
                  onChange={(e) => change("course", e.target.value)}
                />
              </label>
              <label className="field full">
                <span className="label">
                  Topic{" "}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    (optional)
                  </span>
                </span>
                <input
                  className="input"
                  placeholder="What was the lecture about?"
                  maxLength={300}
                  value={form.topic}
                  onChange={(e) => change("topic", e.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">Lecture date</span>
                <input
                  type="date"
                  className="input"
                  value={form.date}
                  onChange={(e) => change("date", e.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">Lecture language</span>
                <select
                  className="input"
                  value={form.language}
                  onChange={(e) => change("language", e.target.value)}
                >
                  <option>Original language</option>
                  <option>English</option>
                  <option>Türkçe</option>
                  <option>Deutsch</option>
                  <option>Français</option>
                  <option>Español</option>
                  <option>العربية</option>
                </select>
              </label>
              <label className="field full">
                <span className="label">
                  Reconstruction instructions{" "}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    (optional)
                  </span>
                </span>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="e.g. Keep the original notation. These photos cover two separate examples."
                  maxLength={4000}
                  value={form.instructions}
                  onChange={(e) => change("instructions", e.target.value)}
                />
                <span className="field-help">
                  Use this for context, notation preferences, or special
                  instructions.
                </span>
              </label>
            </div>
            <div className="form-actions">
              <Link href="/lessons" className="btn btn-ghost">
                Cancel
              </Link>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy || !form.title.trim()}
              >
                {busy ? "Creating lesson…" : "Continue to photos"}
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
          <aside className="creation-aside">
            <span className="eyebrow">FROM SCATTERED TO STRUCTURED</span>
            <h3>
              A second look.
              <br />A deeper understanding.
            </h3>
            <p>
              Your original photographs stay connected to every reconstructed
              step. You can always go back and check the board.
            </p>
            <div className="creation-checklist">
              {[
                {
                  title: "Gather your photos",
                  text: "Upload board captures in the order they were taken.",
                },
                {
                  title: "Reconstruct the lecture",
                  text: "Choose a configured AI provider to connect the visible evidence.",
                },
                {
                  title: "Replay, review, and keep",
                  text: "Work through each step, correct mistakes, and export your notes.",
                },
              ].map((item, i) => (
                <div key={item.title}>
                  <span>0{i + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="privacy-note">
              <ShieldCheck size={17} />
              <span>
                Photos are stored locally on this server. Processing sends them
                to the provider you choose. Avoid including personal or
                sensitive information.
              </span>
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
