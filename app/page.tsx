"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Focus,
  Layers3,
  Play,
  Quote,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Content } from "@/components/Content";
import { sampleReconstruction } from "@/lib/demo";

const sourceSample = sampleReconstruction([
  "frame-1",
  "frame-2",
  "frame-3",
  "frame-4",
]);
const names = [
  "The original problem",
  "Complete the square",
  "Keep both square roots",
  "The final result",
];
const sample = [0, 1, 4, 6].map((index, i) => ({
  name: names[i],
  text: sourceSample.steps[index].text,
  math: "$$\n" + sourceSample.steps[index].latex + "\n$$",
  evidence: "Observed in the synthetic sample",
}));

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function openDemo() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not open the demo.");
      router.push(`/lessons/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the demo.");
      setBusy(false);
    }
  }
  return (
    <AppShell>
      <main className="landing">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-label">
              <span /> FROM THE BOARD. TO YOUR UNDERSTANDING.
            </div>
            <h1>
              Your lecture,
              <br />
              <span>reconstructed.</span>
            </h1>
            <p>
              Turn scattered whiteboard photos into clear notes, interactive
              explanations, and replayable learning experiences.
            </p>
            <div className="hero-actions">
              <Link href="/lessons/new" className="btn btn-primary">
                Create a lesson <ArrowUpRight size={17} />
              </Link>
              <button
                className="btn btn-secondary"
                onClick={openDemo}
                disabled={busy}
              >
                <Play size={15} fill="currentColor" />
                {busy ? "Opening demo…" : "Explore demo"}
              </button>
            </div>
            {error && <p className="inline-error">{error}</p>}
            <div className="hero-trust">
              <span>
                <Check size={14} /> No account needed
              </span>
              <span>
                <ShieldCheck size={14} /> Your sources stay connected
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-caption">
              <span className="mini-dot" /> ONE LECTURE. EVERY STEP.
            </div>
            <div className="floating-photo photo-one">
              <span className="photo-tape" />
              <div className="photo-marker">BOARD CAPTURE 01</div>
              <div className="handwritten">
                Completing the square
                <br />
                <strong>x&#178; &minus; 6x + 5 = 0</strong>
                <small>add 9 to both sides...</small>
              </div>
            </div>
            <div className="floating-photo photo-two">
              <span className="photo-marker">BOARD CAPTURE 03</span>
              <div className="handwritten">
                <span className="crossed">x &minus; 3 = 2</span>
                <strong>x &minus; 3 = &plusmn;2</strong>
                <small>take BOTH roots &#10003;</small>
              </div>
            </div>
            <div className="visual-connector">
              <Sparkles size={16} />
            </div>
            <div className="mini-replay">
              <div className="mini-replay-head">
                <span>
                  <span className="mini-dot" /> RECONSTRUCTED LESSON
                </span>
                <span className="sample-label">SAMPLE DATA</span>
              </div>
              <div className="mini-step">
                <span>03</span>
                <div>
                  <small>PRESERVE THE CORRECTION</small>
                  <Content text={"$x - 3 = \\pm 2$"} />
                </div>
                <Check size={17} />
              </div>
              <div className="mini-player">
                <button onClick={openDemo} aria-label="Open full demo">
                  <Play size={11} fill="currentColor" />
                </button>
                <div className="mini-track">
                  <span />
                </div>
                <span>03 / 04</span>
              </div>
            </div>
            <div className="visual-footnote">
              <Layers3 size={13} /> Every insight has a source.
            </div>
          </div>
        </section>
        <section className="workflow-strip">
          <div className="workflow-intro">
            Less sorting.
            <br />
            <strong>More understanding.</strong>
          </div>
          {[
            {
              title: "Capture",
              detail: "Gather your board photos",
              icon: Camera,
            },
            {
              title: "Analyze",
              detail: "Read what’s really there",
              icon: ScanLine,
            },
            {
              title: "Reconstruct",
              detail: "Connect the explanation",
              icon: Layers3,
            },
            { title: "Replay", detail: "Learn at your own pace", icon: Play },
            {
              title: "Export",
              detail: "Take your notes with you",
              icon: FileDown,
            },
          ].map(({ title, detail, icon: Icon }, i) => (
            <div className="workflow-item" key={title}>
              <span className="workflow-number">0{i + 1}</span>
              <Icon size={20} />
              <strong>{title}</strong>
              <small>{detail}</small>
              {i < 4 && <ArrowRight className="workflow-arrow" size={14} />}
            </div>
          ))}
        </section>
        <section className="landing-example">
          <div className="example-heading">
            <div>
              <span className="eyebrow">
                A LITTLE LESS “WHAT HAPPENED HERE?”
              </span>
              <h2>Watch the explanation come together.</h2>
            </div>
            <p>
              One idea at a time. Always connected
              <br />
              to the photograph it came from.
            </p>
          </div>
          <div className="example-card">
            <aside className="example-sidebar">
              <span className="sample-label">INTERACTIVE SAMPLE</span>
              <h3>Completing the square</h3>
              <p>Introduction to algebra</p>
              <div className="sample-timeline">
                {sample.map((s, i) => (
                  <button
                    key={s.name}
                    className={
                      step === i
                        ? "sample-timeline-step active"
                        : "sample-timeline-step"
                    }
                    onClick={() => setStep(i)}
                  >
                    <span>{i < step ? <Check size={13} /> : `0${i + 1}`}</span>
                    {s.name}
                  </button>
                ))}
              </div>
              <span className="sample-disclaimer">
                Synthetic board frames.
                <br />
                No live AI response is implied.
              </span>
            </aside>
            <div className="example-board">
              <div className="example-board-top">
                <span>
                  <span className="mini-dot" /> DIGITAL BOARD
                </span>
                <span>STEP {step + 1} OF 4</span>
              </div>
              <div className="example-step" key={step}>
                <span className="step-overline">
                  0{step + 1} / {sample[step].name}
                </span>
                <p>{sample[step].text}</p>
                <Content className="example-math" text={sample[step].math} />
                <span className="evidence-chip">
                  <Focus size={13} />
                  {sample[step].evidence}
                </span>
              </div>
              <div className="example-controls">
                <button
                  className="icon-button"
                  onClick={() => setStep(Math.max(0, step - 1))}
                  disabled={step === 0}
                  aria-label="Previous sample step"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="sample-dots">
                  {sample.map((_, i) => (
                    <button
                      key={i}
                      className={i === step ? "active" : ""}
                      aria-label={`Sample step ${i + 1}`}
                      onClick={() => setStep(i)}
                    />
                  ))}
                </div>
                <button
                  className="icon-button"
                  onClick={() => setStep(Math.min(3, step + 1))}
                  disabled={step === 3}
                  aria-label="Next sample step"
                >
                  <ChevronRight size={20} />
                </button>
                <button
                  className="text-link"
                  onClick={openDemo}
                  disabled={busy}
                >
                  Open full workspace <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="principles">
          <div>
            <Quote size={22} />
            <h3>
              Clarity without
              <br />
              the guesswork.
            </h3>
            <p>
              The board is the source of truth. BoardReplay separates what was
              captured, what was inferred, and what still needs your attention.
            </p>
          </div>
          <div>
            <span className="evidence-badge observed">Observed</span>
            <h4>Grounded in your photos</h4>
            <p>
              Jump from any step to its original photograph. Check an equation
              for yourself.
            </p>
          </div>
          <div>
            <span className="evidence-badge derived">Derived</span>
            <h4>Explanation, made explicit</h4>
            <p>
              Helpful reasoning is labeled, so it never gets confused with the
              original lecture.
            </p>
          </div>
          <div>
            <span className="evidence-badge uncertain">Uncertain</span>
            <h4>Honest about the gaps</h4>
            <p>
              Unclear writing stays flagged. Uncaptured, erased content cannot
              be recovered.
            </p>
          </div>
        </section>
        <section className="landing-cta">
          <div>
            <span className="eyebrow">
              GIVE YOUR NEXT LECTURE A SECOND LOOK
            </span>
            <h2>It starts with a few photos.</h2>
          </div>
          <Link href="/lessons/new" className="btn btn-primary">
            Create your first lesson <ArrowUpRight size={17} />
          </Link>
        </section>
      </main>
    </AppShell>
  );
}
