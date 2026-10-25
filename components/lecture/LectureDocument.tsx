"use client";

import { useLayoutEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Maximize2, Pencil } from "lucide-react";
import { Content } from "@/components/Content";
import { preparedSourceUrl } from "@/lib/board/scene";
import type { LectureDocument as LectureDocumentValue, LectureImage, PhotoExplanation } from "@/lib/types";
import "./document.css";

/** Math remains in normal document flow; an unusually long expression scales to the reading width. */
function ExplanationContent({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0, active = true;
    const fit = () => {
      for (const math of root.querySelectorAll<HTMLElement>(".katex-display")) {
        math.style.fontSize = "";
        const available = math.clientWidth;
        const content = math.querySelector<HTMLElement>(".katex-html");
        const natural = Math.max(content?.scrollWidth || 0, math.scrollWidth);
        if (available > 0 && natural > available + 1) math.style.fontSize = `${Math.min(1, available / natural) * 100}%`;
      }
      root.dataset.mathReady = "true";
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (active) fit(); }); };
    fit();
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    void document.fonts.ready.then(schedule);
    document.fonts.addEventListener("loadingdone", schedule);
    window.addEventListener("beforeprint", fit);
    return () => { active = false; cancelAnimationFrame(frame); observer.disconnect(); document.fonts.removeEventListener("loadingdone", schedule); window.removeEventListener("beforeprint", fit); };
  }, [text]);
  return <div ref={ref} className="lecture-explanation-content"><Content text={text} /></div>;
}

export function LectureDocument({ document, images, onEditPhoto, onOpenPhoto, onMovePhoto, busy = false }: {
  document: LectureDocumentValue;
  images: LectureImage[];
  onEditPhoto?: (photo: PhotoExplanation) => void;
  onOpenPhoto?: (photo: PhotoExplanation) => void;
  onMovePhoto?: (photo: PhotoExplanation, direction: "earlier" | "later") => void;
  busy?: boolean;
}) {
  const sources = new Map(images.map((image) => [image.id, image]));
  return <div className="lecture-document" data-testid="lecture-document" lang={document.language.toLowerCase().startsWith("t") ? "tr" : undefined}>
    {document.photos.map((photo, index) => {
      const source = sources.get(photo.imageId);
      const sequence = document.organization.sequences.find((item) => item.id === photo.sequenceId);
      const sequenceStart = index === 0 || document.photos[index - 1].sequenceId !== photo.sequenceId;
      const image = source ? <img src={preparedSourceUrl(source.id, photo.rotation)} alt={`Lecture photograph ${index + 1}`} width={Math.round(1200 * photo.imageAspectRatio)} height={1200} loading={index === 0 ? "eager" : "lazy"} /> : null;
      return <article key={photo.id} className="lecture-photo" data-testid="lecture-photo" data-image-id={photo.imageId} id={`photo-${index + 1}`}>
        {sequenceStart && document.organization.sequences.length > 1 && <div className="lecture-sequence-heading"><h2>{sequence?.title || "Lecture sequence"}</h2>{sequence?.uncertainty && <p>{sequence.uncertainty}</p>}</div>}
        <header className="lecture-photo-heading"><span>Photo {String(index + 1).padStart(2, "0")}</span>{photo.relation === "REPEAT" && <span className="lecture-repeat-note">Repeated view</span>}</header>
        <figure className="lecture-photo-figure">
          {source ? onOpenPhoto ? <button type="button" className="lecture-photo-open" aria-label={`Open photo ${index + 1}`} onClick={() => onOpenPhoto(photo)}>{image}</button> : image : <p className="lecture-source-missing">This source photograph is no longer available.</p>}
          <figcaption><span>{source?.originalFilename || "Source unavailable"}</span>{onOpenPhoto && source && <button type="button" onClick={() => onOpenPhoto(photo)} aria-label={`Enlarge photo ${index + 1}`}><Maximize2 size={14} />Enlarge</button>}</figcaption>
        </figure>
        <section className="lecture-explanation" aria-label={`Explanation for photo ${index + 1}`}>
          <h3 className="lecture-explanation-heading">{photo.heading || "Explanation"}</h3>
          <ExplanationContent text={photo.bodyMarkdown} />
          {photo.uncertainty && <p className="lecture-photo-uncertainty" role="note">{photo.uncertainty}</p>}
          {photo.evidenceStatus === "USER_EDITED" && <p className="lecture-edited-note">Explanation edited by you</p>}
          {(onEditPhoto || onMovePhoto) && <div className="lecture-photo-actions">
            {onEditPhoto && <button type="button" disabled={busy} onClick={() => onEditPhoto(photo)} aria-label={`Edit explanation for photo ${index + 1}`}><Pencil size={14} />Edit explanation</button>}
            {onMovePhoto && <div className="lecture-order-actions"><button type="button" disabled={busy || index === 0} onClick={() => onMovePhoto(photo, "earlier")} aria-label={`Move photo ${index + 1} earlier`}><ArrowUp size={14} /><span>Move earlier</span></button><button type="button" disabled={busy || index === document.photos.length - 1} onClick={() => onMovePhoto(photo, "later")} aria-label={`Move photo ${index + 1} later`}><ArrowDown size={14} /><span>Move later</span></button></div>}
          </div>}
        </section>
      </article>;
    })}
  </div>;
}
