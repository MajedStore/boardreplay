"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { LectureDocument as OrganizedLectureDocument } from "@/components/lecture/LectureDocument";
import { request } from "@/lib/client";
import type { Lesson } from "@/lib/types";
import "./print.css";

export default function LessonPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => { request<Lesson>(`/api/lessons/${id}`).then(setLesson).catch((cause) => setError(cause.message)); }, [id]);
  useEffect(() => { if (lesson?.document) void document.fonts.ready.then(() => setReady(true)); }, [lesson]);
  async function print() {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => {})));
    window.print();
  }
  return <div className="print-layout">
    <div className="print-toolbar no-print"><Link className="btn btn-secondary" href={`/lessons/${id}`}><ArrowLeft size={16} />Back to lecture</Link><button className="btn btn-primary" disabled={!ready} onClick={() => void print()}><Printer size={16} />Print / Save as PDF</button></div>
    <main className="print-document">
      {error ? <p role="alert">{error}</p> : !lesson ? <p>Preparing lecture document…</p> : <>
        <header className="print-heading"><p className="print-brand">BOARDREPLAY / LECTURE DOCUMENT</p><h1>{lesson.document?.title || lesson.title}</h1>{lesson.course && <p>{lesson.course}</p>}<p>{lesson.document?.photos.length || lesson.images.length} photographs{lesson.date ? ` · ${lesson.date}` : ""}</p></header>
        {lesson.isDemo && <p className="print-notice">Synthetic sample · Original sample photographs and author-written explanations. No live AI output.</p>}
        {lesson.explanationsNeedRefresh && <p className="print-notice">The photo order was manually corrected. Regenerate explanations to update their context.</p>}
        {lesson.document ? <OrganizedLectureDocument document={lesson.document} images={lesson.images} /> : <p>Generate the photo explanations before exporting this lecture.</p>}
        <footer className="print-footer">BoardReplay · Original photographs with derived explanations. Review uncertain content against the sources.</footer>
      </>}
    </main>
  </div>;
}
