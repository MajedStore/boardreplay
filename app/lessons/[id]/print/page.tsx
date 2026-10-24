"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Content } from "@/components/Content";
import { request } from "@/lib/client";
import type { Lesson } from "@/lib/types";
import "./print.css";
export default function LessonPrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [photos, setPhotos] = useState(false);
  const [uncertainty, setUncertainty] = useState(true);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    request<Lesson>(`/api/lessons/${id}`)
      .then(setLesson)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (lesson) document.fonts.ready.then(() => setReady(true));
  }, [lesson]);
  async function print() {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((i) => i.decode().catch(() => {})),
    );
    window.print();
  }
  if (error)
    return (
      <main className="print-document">
        <p role="alert">{error}</p>
        <Link href="/lessons">Back to lessons</Link>
      </main>
    );
  if (!lesson)
    return (
      <main className="print-document">
        <p>Preparing your notes…</p>
      </main>
    );
  return (
    <div className="print-layout">
      <div className="print-toolbar no-print">
        <Link className="btn btn-secondary" href={`/lessons/${id}`}>
          <ArrowLeft size={16} />
          Back to lesson
        </Link>
        <label>
          <input
            type="checkbox"
            checked={photos}
            onChange={(e) => setPhotos(e.target.checked)}
          />{" "}
          Include original photos
        </label>
        <label>
          <input
            type="checkbox"
            checked={uncertainty}
            onChange={(e) => setUncertainty(e.target.checked)}
          />{" "}
          Include uncertainty notes
        </label>
        <button
          className="btn btn-primary"
          onClick={print}
          disabled={!ready || !lesson.reconstruction}
        >
          <Printer size={16} />
          Print / Save as PDF
        </button>
      </div>
      <main className="print-document">
        <header>
          <p className="print-brand">BOARDREPLAY / LESSON NOTES</p>
          <h1>{lesson.title}</h1>
          <p>
            {lesson.course}
            {lesson.date ? ` · ${lesson.date}` : ""}
          </p>
          {lesson.isDemo && (
            <p className="print-notice">
              SAMPLE DATA · Synthetic board frames and prebuilt notes; no live
              model output.
            </p>
          )}
        </header>
        {lesson.reconstruction ? (
          <>
            <p>{lesson.reconstruction.overview}</p>
            <p className="print-notice">
              Reconstruction of captured images; not an exact recording of the
              lecture. Uncaptured erased content cannot be recovered. Derived
              explanations and user corrections are labeled.
            </p>
            {lesson.reconstruction.sections.map((section) => (
              <section key={section.id}>
                <h2>{section.title}</h2>
                {lesson
                  .reconstruction!.steps.filter(
                    (s) => s.sectionId === section.id,
                  )
                  .map((step) => (
                    <article key={step.id} className="print-step">
                      <div className="print-step-meta">
                        {step.stepIndex + 1}. {step.evidenceStatus}
                        {step.explanation ? " · Educational explanation" : ""} ·
                        Sources:{" "}
                        {step.sourceImageIds
                          .map((source) => {
                            const i = lesson.images.find(
                              (i) => i.id === source,
                            );
                            return i
                              ? `Photo ${i.sequence + 1}`
                              : "Removed source";
                          })
                          .join(", ") || "No captured source"}
                      </div>
                      <Content text={step.text} />
                      {step.latex && <Content text={`$$\n${step.latex}\n$$`} />}
                      <small>{step.verification?.message}</small>
                      {uncertainty && step.uncertainty && (
                        <p className="print-uncertainty">
                          Review: {step.uncertainty}
                        </p>
                      )}
                    </article>
                  ))}
              </section>
            ))}
            {uncertainty && lesson.reconstruction.unresolved.length > 0 && (
              <section>
                <h2>Unresolved information</h2>
                <ul>
                  {lesson.reconstruction.unresolved.map((text, index) => (
                    <li key={index}>{text}</li>
                  ))}
                </ul>
              </section>
            )}
            {photos && (
              <section>
                <h2>Original captured frames</h2>
                {lesson.images.map((image) => (
                  <figure key={image.id} className="print-photo">
                    <img
                      src={image.url}
                      alt={`Original photo ${image.sequence + 1}: ${image.originalFilename}`}
                      style={{ transform: `rotate(${image.rotation}deg)` }}
                    />
                    <figcaption>
                      Photo {image.sequence + 1} · {image.originalFilename}
                    </figcaption>
                  </figure>
                ))}
              </section>
            )}
          </>
        ) : (
          <p>This lesson has no reconstruction to export yet.</p>
        )}
        <footer>
          BoardReplay · {lesson.images.length} source photographs · Printed{" "}
          {new Date().toLocaleDateString("en-GB")}
        </footer>
      </main>
    </div>
  );
}
