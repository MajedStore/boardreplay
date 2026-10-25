"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { StartUpload } from "@/components/upload/StartUpload";
import { request } from "@/lib/client";
import type { Lesson } from "@/lib/types";
import "./home-simple.css";

export default function Home() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    request<Lesson[]>("/api/lessons")
      .then(setLessons)
      .catch(() => setError("Recent lessons could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <main className="home-simple">
        <h1>Turn lecture photos into organized study notes.</h1>
        <StartUpload />
        <section className="home-simple-recents" aria-labelledby="recent-lessons-title">
          <div className="home-simple-list-heading"><h2 id="recent-lessons-title">Recent lessons</h2><Link href="/lessons">View all <ArrowRight size={14} /></Link></div>
          {loading && <p className="home-simple-empty" role="status">Loading lessons…</p>}
          {error && <p className="home-simple-empty" role="alert">{error} <Link href="/lessons">Open lessons</Link></p>}
          {!loading && !error && lessons.length === 0 && <p className="home-simple-empty">Your lessons will appear here.</p>}
          <ul className="home-simple-list">{lessons.slice(0, 6).map((lesson) => <li key={lesson.id}>
            <Link href={`/lessons/${lesson.id}`}>
              {lesson.images[0] ? <img src={lesson.images[0].url} alt="" style={{ transform: `rotate(${lesson.images[0].rotation}deg)` }} /> : <span className="home-simple-no-photo" aria-hidden="true" />}
              <div><strong>{lesson.title}</strong><span>{new Date(lesson.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{lesson.course ? ` · ${lesson.course}` : ""}</span></div>
              <ChevronRight size={17} aria-hidden="true" />
            </Link>
          </li>)}</ul>
        </section>
      </main>
    </AppShell>
  );
}
