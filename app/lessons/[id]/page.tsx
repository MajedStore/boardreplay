"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Expand,
  FlaskConical,
  Focus,
  History,
  Image as ImageIcon,
  Images,
  Layers3,
  List,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Content } from "@/components/Content";
import { UploadPanel } from "@/components/upload/UploadPanel";
import { StepEditor } from "@/components/board/StepEditor";
import { request } from "@/lib/client";
import type {
  Lesson,
  ProviderId,
  ProviderInfo,
  Reconstruction,
  ReconstructionStep,
} from "@/lib/types";

const evidenceNames = {
  OBSERVED: "Observed",
  DERIVED: "Derived",
  UNCERTAIN: "Uncertain",
  USER_EDITED: "User edited",
};
const evidenceDetail = {
  OBSERVED: "Directly supported by the referenced photographs.",
  DERIVED:
    "Inferred from visible evidence. This reasoning may not have appeared on the original board.",
  UNCERTAIN:
    "The captured evidence is unclear or incomplete. Review the source before relying on this step.",
  USER_EDITED:
    "Manually supplied or corrected by you. This version is not an untouched AI extraction.",
};
function stepLabel(step: ReconstructionStep) {
  return (
    step.text.replace(/[#*$`\\]/g, "").slice(0, 85) ||
    step.latex?.slice(0, 60) ||
    "Untitled step"
  );
}
const activeStatuses = ["UPLOADING", "EXTRACTING", "RECONSTRUCTING"];

export default function LessonPage() {
  const params = useParams<{ id: string }>(),
    id = params.id;
  const [lesson, setLesson] = useState<Lesson | null>(null),
    [providers, setProviders] = useState<ProviderInfo[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [current, setCurrent] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [showAll, setShowAll] = useState(false),
    [mobileTab, setMobileTab] = useState("board"),
    [selectedImage, setSelectedImage] = useState(""),
    [zoom, setZoom] = useState(100),
    [preview, setPreview] = useState(false),
    [manageImages, setManageImages] = useState(false),
    [history, setHistory] = useState(false),
    [menu, setMenu] = useState(false),
    [metadata, setMetadata] = useState(false),
    [title, setTitle] = useState("");
  const [editor, setEditor] = useState<{
      step: ReconstructionStep;
      reconstruction: Reconstruction;
    } | null>(null),
    [saving, setSaving] = useState(false),
    [starting, setStarting] = useState(false);
  const boardRef = useRef<HTMLElement>(null);
  const steps = lesson?.reconstruction?.steps || [],
    activeStep = steps[current];
  const isProcessing = !!lesson && activeStatuses.includes(lesson.status);
  const refresh = useCallback(async () => {
    const value = await request<Lesson>(`/api/lessons/${id}`);
    setLesson(value);
    return value;
  }, [id]);
  useEffect(() => {
    let mounted = true;
    Promise.all([
      request<Lesson>(`/api/lessons/${id}`),
      request<ProviderInfo[]>("/api/providers"),
    ])
      .then(([value, options]) => {
        if (mounted) {
          setLesson(value);
          setProviders(options);
        }
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);
  useEffect(() => {
    if (!isProcessing) return;
    const timer = setInterval(() => {
      void refresh().catch((e) => setError(e.message));
    }, 1800);
    return () => clearInterval(timer);
  }, [isProcessing, refresh]);
  useEffect(() => {
    if (activeStep?.sourceImageIds[0]) {
      setSelectedImage(activeStep.sourceImageIds[0]);
      setZoom(100);
    }
  }, [activeStep?.id, activeStep?.sourceImageIds]);
  useEffect(() => {
    if (steps.length && current >= steps.length) setCurrent(steps.length - 1);
  }, [steps.length, current]);
  useEffect(() => {
    if (!playing || !steps.length) return;
    const timer = setInterval(
      () =>
        setCurrent((value) => {
          if (value >= steps.length - 1) {
            setPlaying(false);
            return value;
          }
          return value + 1;
        }),
      3200 / speed,
    );
    return () => clearInterval(timer);
  }, [playing, speed, steps.length]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  const next = useCallback(() => {
    setPlaying(false);
    setCurrent((i) => Math.min(steps.length - 1, i + 1));
  }, [steps.length]);
  const previous = useCallback(() => {
    setPlaying(false);
    setCurrent((i) => Math.max(0, i - 1));
  }, []);
  function play() {
    if (current === steps.length - 1) setCurrent(0);
    setShowAll(false);
    setPlaying(!playing);
  }
  useEffect(() => {
    function keys(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) ||
        editor ||
        manageImages ||
        history ||
        metadata ||
        !steps.length
      )
        return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      }
      if (event.key === " ") {
        event.preventDefault();
        setShowAll(false);
        setPlaying((v) => !v);
      }
      if (event.key === "Home") {
        event.preventDefault();
        setCurrent(0);
        setPlaying(false);
      }
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [next, previous, steps.length, editor, manageImages, history, metadata]);
  useEffect(() => {
    if (playing && activeStep) {
      document
        .getElementById(`step-${activeStep.id}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [current, playing, activeStep]);
  const image =
    lesson?.images.find((i) => i.id === selectedImage) || lesson?.images[0];
  const imageIndex = lesson?.images.findIndex((i) => i.id === image?.id) ?? 0;
  function selectStep(index: number) {
    setCurrent(index);
    setPlaying(false);
  }
  function navigateImage(offset: number) {
    if (!lesson) return;
    const index = Math.max(
      0,
      Math.min(lesson.images.length - 1, imageIndex + offset),
    );
    setSelectedImage(lesson.images[index].id);
    setZoom(100);
  }
  async function process(provider: ProviderId) {
    if (!lesson || starting || isProcessing) return;
    setStarting(true);
    setError("");
    setManageImages(false);
    try {
      await request(`/api/lessons/${id}/process`, {
        method: "POST",
        body: JSON.stringify({ provider }),
      });
      await refresh();
      setPlaying(false);
      setCurrent(0);
      setShowAll(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not start reconstruction.",
      );
    } finally {
      setStarting(false);
    }
  }
  async function save(value: Reconstruction) {
    setSaving(true);
    try {
      const updated = await request<Lesson>(`/api/lessons/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ reconstruction: value }),
      });
      setLesson(updated);
      setEditor(null);
      setToast("Your correction is saved. The previous version is in history.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save correction.");
    } finally {
      setSaving(false);
    }
  }
  function addNote() {
    if (!lesson?.reconstruction) return;
    const reconstruction = structuredClone(lesson.reconstruction);
    const step: ReconstructionStep = {
      id: crypto.randomUUID(),
      type: "paragraph",
      sectionId: activeStep?.sectionId || reconstruction.sections[0].id,
      text: "",
      stepIndex: current + 1,
      sourceImageIds: [],
      evidenceStatus: "USER_EDITED",
      explanation: true,
    };
    reconstruction.steps.splice(current + 1, 0, step);
    reconstruction.steps = reconstruction.steps.map((s, i) => ({
      ...s,
      stepIndex: i,
    }));
    setEditor({ step, reconstruction });
    setPlaying(false);
  }
  async function restore(revisionId: string) {
    setSaving(true);
    try {
      setLesson(
        await request<Lesson>(`/api/lessons/${id}/restore`, {
          method: "POST",
          body: JSON.stringify({ revisionId }),
        }),
      );
      setHistory(false);
      setCurrent(0);
      setPlaying(false);
      setShowAll(false);
      setToast("Previous reconstruction restored.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore revision.");
    } finally {
      setSaving(false);
    }
  }
  async function rename(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      setLesson(
        await request<Lesson>(`/api/lessons/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ title }),
        }),
      );
      setMetadata(false);
      setToast("Lesson name updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename lesson.");
    } finally {
      setSaving(false);
    }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await boardRef.current?.requestFullscreen();
    } catch {
      setError(
        "Fullscreen is unavailable in this browser. You can use the browser’s presentation or fullscreen option.",
      );
    }
  }
  if (loading)
    return (
      <AppShell>
        <main className="page-content" style={{ paddingTop: 40 }}>
          <div className="loading-card" style={{ height: 65 }} />
          <div className="grid-2" style={{ marginTop: 25 }}>
            <div className="loading-card" style={{ height: 400 }} />
            <div className="loading-card" style={{ height: 400 }} />
          </div>
        </main>
      </AppShell>
    );
  if (!lesson)
    return (
      <AppShell>
        <main className="page-content">
          <div className="empty-state">
            <AlertCircle size={35} />
            <h1 style={{ fontSize: 27 }}>This lesson could not be opened.</h1>
            <p>{error || "It may have been deleted."}</p>
            <Link className="btn btn-primary" href="/lessons">
              <ArrowLeft size={14} />
              Back to lessons
            </Link>
          </div>
        </main>
      </AppShell>
    );
  const reconstruction = lesson.reconstruction;
  const lastRun = lesson.runs.find((run) => run.status === "COMPLETED");
  return (
    <AppShell>
      <main className="workspace-page">
        <div className="workspace-heading">
          <div>
            <div className="workspace-breadcrumb">
              <Link href="/lessons">My lessons</Link>
              <ChevronRight size={10} />
              <span>{lesson.course || "Independent study"}</span>
            </div>
            <div className="workspace-title-line">
              <h1>{lesson.title}</h1>
              {lesson.isDemo && (
                <span className="sample-label">SAMPLE DATA</span>
              )}
            </div>
            <div className="workspace-course">
              <span>{lesson.topic || "Your whiteboard, reconstructed"}</span>
              <span>·</span>
              <span>{lesson.images.length} photographs</span>
              {lesson.date && <span>· {lesson.date}</span>}
            </div>
          </div>
          <div className="workspace-actions">
            {reconstruction && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setManageImages(true);
                    setPlaying(false);
                  }}
                  disabled={isProcessing}
                >
                  <Images size={13} />
                  <span>Manage photos</span>
                </button>
                <Link
                  className="btn btn-primary"
                  href={`/lessons/${id}/print`}
                  target="_blank"
                >
                  <Download size={13} />
                  <span>Export PDF</span>
                </Link>
              </>
            )}
            <button
              className="icon-button"
              aria-label="Lesson options"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>
        {menu && (
          <div className="settings-menu">
            <button
              onClick={() => {
                setTitle(lesson.title);
                setMetadata(true);
                setMenu(false);
              }}
            >
              <Pencil size={13} />
              Rename lesson
            </button>
            {reconstruction && (
              <>
                <button
                  onClick={() => {
                    setHistory(true);
                    setMenu(false);
                  }}
                >
                  <History size={13} />
                  Revision history
                </button>
                <Link href={`/lab?lessonId=${id}`}>
                  <FlaskConical size={13} />
                  Compare AI tools
                </Link>
              </>
            )}
            <Link href="/lessons">
              <BookOpen size={13} />
              All lessons
            </Link>
          </div>
        )}
        {error && (
          <div
            className="alert error workspace-alert"
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 15,
            }}
          >
            {error}
            <button
              className="icon-button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {lesson.status === "FAILED" && lesson.error && (
          <div className="alert error workspace-alert" role="alert">
            {lesson.error}{" "}
            <button className="text-link" onClick={() => setManageImages(true)}>
              Review provider and retry
            </button>
          </div>
        )}
        {lesson.needsReprocessing && reconstruction && !isProcessing && (
          <div className="alert info workspace-alert" style={{ fontSize: 10 }}>
            Your photograph sequence has changed. These notes reflect an earlier
            sequence.{" "}
            <button className="text-link" onClick={() => setManageImages(true)}>
              Review and reconstruct again
            </button>
          </div>
        )}
        {!reconstruction || isProcessing || starting ? (
          <div className="page-content" style={{ maxWidth: 1100 }}>
            {isProcessing || starting ? (
              <div
                className="processing-state"
                role="status"
                aria-live="polite"
              >
                <div className="processing-symbol">
                  <Sparkles className="spin" size={30} />
                </div>
                <span className="eyebrow">
                  GIVING YOUR LECTURE A SECOND LOOK
                </span>
                <h2>
                  {lesson.status === "RECONSTRUCTING"
                    ? "Connecting the explanation…"
                    : lesson.status === "UPLOADING"
                      ? "Saving your photographs…"
                      : "Reading what’s on the board…"}
                </h2>
                <p>
                  Your photographs are being read in chronological order.
                  Unclear content stays flagged, and every reconstructed step is
                  linked to its evidence.
                </p>
                <div className="processing-stages">
                  <span
                    className={lesson.status === "EXTRACTING" ? "active" : ""}
                  >
                    <ScanIcon />
                    {lesson.status === "RECONSTRUCTING"
                      ? "Images read"
                      : "Read images"}
                  </span>
                  <ChevronRight size={12} />
                  <span
                    className={
                      lesson.status === "RECONSTRUCTING" ? "active" : ""
                    }
                  >
                    <Layers3 size={13} />
                    Connect steps
                  </span>
                  <ChevronRight size={12} />
                  <span>
                    <CheckCircle2 size={13} />
                    Ready to review
                  </span>
                </div>
                <p style={{ fontSize: 10 }}>
                  This is an actual processing state. Completion time depends on
                  the provider and image set. You can return to this lesson
                  later.
                </p>
              </div>
            ) : (
              <UploadPanel
                lesson={lesson}
                providers={providers}
                onChange={setLesson}
                onProcess={process}
                onError={setError}
              />
            )}
          </div>
        ) : (
          <>
            <div className="workspace-mobile-tabs">
              <button
                className={mobileTab === "board" ? "active" : ""}
                onClick={() => setMobileTab("board")}
              >
                <Layers3 size={13} />
                Digital board
              </button>
              <button
                className={mobileTab === "timeline" ? "active" : ""}
                onClick={() => setMobileTab("timeline")}
              >
                <List size={13} />
                Timeline
              </button>
              <button
                className={mobileTab === "source" ? "active" : ""}
                onClick={() => setMobileTab("source")}
              >
                <ImageIcon size={13} />
                Source & evidence
              </button>
            </div>
            <div className={`workspace-content tab-${mobileTab}`}>
              <aside className="workspace-sidebar">
                <div className="panel-label">
                  LESSON WORKSPACE <BookOpen size={11} />
                </div>
                <Link className="sidebar-lesson-link" href="/lessons">
                  <ArrowLeft size={12} />
                  Back to my lessons
                </Link>
                <div className="panel-label">
                  STEP TIMELINE<span>{steps.length} STEPS</span>
                </div>
                {reconstruction.sections.map((section) => (
                  <div className="timeline-section" key={section.id}>
                    <div className="timeline-section-title">
                      <span>{section.title}</span>
                      <span className="muted" style={{ fontSize: 8 }}>
                        {steps.filter((s) => s.sectionId === section.id).length}
                      </span>
                    </div>
                    {steps.map((step, index) =>
                      step.sectionId === section.id ? (
                        <button
                          key={step.id}
                          className={`timeline-step ${index === current ? "active" : index < current ? "done" : ""}`}
                          onClick={() => {
                            selectStep(index);
                            setMobileTab("board");
                          }}
                        >
                          <span>
                            {index < current ? (
                              <Check size={9} />
                            ) : (
                              String(index + 1).padStart(2, "0")
                            )}
                          </span>
                          <span>{stepLabel(step)}</span>
                        </button>
                      ) : null,
                    )}
                  </div>
                ))}
                <button
                  className="text-link"
                  style={{ padding: "7px 5px", fontSize: 9, marginBottom: 20 }}
                  onClick={addNote}
                >
                  <Plus size={12} />
                  Add your own explanation
                </button>
                <div className="sidebar-bottom">
                  <div className="status-line">
                    <CheckCircle2 size={13} />
                    {lesson.isDemo
                      ? "Sample ready to explore"
                      : "Reconstruction saved"}
                  </div>
                  <p>
                    {lesson.isDemo
                      ? "This synthetic example was prepared as sample data. It is not a live AI response."
                      : "Your original photographs remain the source of truth. Review uncertain steps before relying on them."}
                  </p>
                </div>
              </aside>
              <section
                className="workspace-center"
                ref={boardRef}
                aria-label="Reconstructed digital board"
              >
                <div className="board-top">
                  <span>
                    <span className="mini-dot" />
                    DIGITAL BOARD
                  </span>
                  <button
                    className="text-link"
                    onClick={() => {
                      setShowAll(!showAll);
                      setPlaying(false);
                    }}
                  >
                    {showAll ? "Replay one step at a time" : "Show all steps"}
                    <Layers3 size={11} />
                  </button>
                </div>
                <div className="digital-board">
                  <div className="board-overview">
                    <span className="eyebrow">
                      {lesson.isDemo
                        ? "SYNTHETIC LECTURE EXAMPLE"
                        : "RECONSTRUCTED FROM YOUR PHOTOGRAPHS"}
                    </span>
                    <h2>{reconstruction.title}</h2>
                    <p>{reconstruction.overview}</p>
                  </div>
                  {steps
                    .filter((_, index) => showAll || index <= current)
                    .map((step) => {
                      const index = steps.findIndex((s) => s.id === step.id);
                      return (
                        <article
                          id={`step-${step.id}`}
                          tabIndex={0}
                          role="button"
                          aria-label={`Step ${index + 1}: ${stepLabel(step)}`}
                          onClick={() => selectStep(index)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") selectStep(index);
                          }}
                          key={step.id}
                          className={`board-step ${current === index ? "active" : ""}`}
                        >
                          <div className="board-step-heading">
                            <strong>
                              STEP {String(index + 1).padStart(2, "0")}
                            </strong>
                            <span>
                              ·{" "}
                              {
                                reconstruction.sections.find(
                                  (s) => s.id === step.sectionId,
                                )?.title
                              }
                            </span>
                            <span
                              className={`evidence-badge ${step.evidenceStatus.toLowerCase()}`}
                            >
                              {evidenceNames[step.evidenceStatus]}
                            </span>
                          </div>
                          {step.explanation && (
                            <div className="explanation-label">
                              ADDED EDUCATIONAL EXPLANATION
                            </div>
                          )}
                          {step.text && <Content text={step.text} />}{" "}
                          {step.latex && (
                            <Content
                              className="equation-content"
                              text={`$$\n${step.latex}\n$$`}
                            />
                          )}{" "}
                          {step.type === "diagram" && !step.latex && (
                            <div className="board-section-note">
                              Refer to the linked source photograph for the
                              original diagram.
                            </div>
                          )}
                          {step.uncertainty && (
                            <div className="step-warning">
                              <AlertCircle
                                size={11}
                                style={{
                                  display: "inline",
                                  verticalAlign: "middle",
                                  marginRight: 5,
                                }}
                              />
                              {step.uncertainty}
                            </div>
                          )}
                          <div className="board-step-footer">
                            {step.sourceImageIds.length > 0 ? (
                              <>
                                <Focus size={11} />
                                <span>Source</span>
                                {step.sourceImageIds.map((imageId) => {
                                  const found = lesson.images.find(
                                    (i) => i.id === imageId,
                                  );
                                  return found ? (
                                    <button
                                      key={imageId}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        selectStep(index);
                                        setSelectedImage(imageId);
                                        setMobileTab("source");
                                      }}
                                    >
                                      Photo{" "}
                                      {String(found.sequence + 1).padStart(
                                        2,
                                        "0",
                                      )}
                                    </button>
                                  ) : null;
                                })}
                              </>
                            ) : (
                              <span>
                                <Pencil
                                  size={10}
                                  style={{ display: "inline", marginRight: 4 }}
                                />
                                Added explanation · no original photo cited
                              </span>
                            )}
                            <button
                              className="edit-step"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPlaying(false);
                                setEditor({ step, reconstruction });
                              }}
                            >
                              <Pencil size={10} />
                              Edit step
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  {!showAll && current < steps.length - 1 && (
                    <div className="step-remaining">
                      <Layers3 size={12} />
                      {steps.length - current - 1} more{" "}
                      {steps.length - current - 1 === 1 ? "step" : "steps"} to
                      discover
                    </div>
                  )}
                  {reconstruction.unresolved.length > 0 && showAll && (
                    <div
                      className="alert"
                      style={{ fontSize: 10, marginTop: 20 }}
                    >
                      <strong>Unresolved from the captured evidence</strong>
                      {reconstruction.unresolved.map((text, index) => (
                        <p style={{ margin: "8px 0 0" }} key={index}>
                          {text}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="replay-controls" aria-label="Replay player">
                  <input
                    className="replay-progress"
                    type="range"
                    min={0}
                    max={Math.max(1, steps.length - 1)}
                    value={current}
                    aria-label="Seek to step"
                    onChange={(e) => {
                      setCurrent(Number(e.target.value));
                      setPlaying(false);
                    }}
                  />
                  <div className="player-row">
                    <button
                      className="icon-button"
                      onClick={() => {
                        setCurrent(0);
                        setPlaying(false);
                        setShowAll(false);
                      }}
                      aria-label="Restart replay"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={previous}
                      disabled={current === 0}
                      aria-label="Previous step"
                    >
                      <SkipBack size={14} />
                    </button>
                    <button
                      className="play-button"
                      onClick={play}
                      aria-label={playing ? "Pause replay" : "Play replay"}
                    >
                      {playing ? (
                        <Pause size={15} fill="currentColor" />
                      ) : (
                        <Play size={14} fill="currentColor" />
                      )}
                    </button>
                    <button
                      className="icon-button"
                      onClick={next}
                      disabled={current === steps.length - 1}
                      aria-label="Next step"
                    >
                      <SkipForward size={14} />
                    </button>
                    <span className="player-step-count">
                      Step{" "}
                      <strong>{String(current + 1).padStart(2, "0")}</strong> /{" "}
                      {String(steps.length).padStart(2, "0")}
                    </span>
                    <select
                      className="speed-select"
                      aria-label="Playback speed"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    >
                      {[0.5, 1, 1.5, 2].map((value) => (
                        <option key={value} value={value}>
                          {value}×
                        </option>
                      ))}
                    </select>
                    <button
                      className="icon-button"
                      onClick={fullscreen}
                      aria-label="Enter presentation fullscreen"
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>
                  <div className="player-caption">
                    <span>
                      Reconstructed sequence · not a recording of original
                      timing
                    </span>
                    <span>← → navigate · space to play / pause</span>
                  </div>
                </div>
              </section>
              <aside
                className="workspace-right"
                aria-label="Source evidence inspector"
              >
                <div className="panel-label">
                  ORIGINAL PHOTOGRAPHS <Images size={12} />
                </div>
                <div className="source-head">
                  <strong>
                    Board capture {String(imageIndex + 1).padStart(2, "0")}
                  </strong>
                  <div className="source-navigation">
                    <button
                      className="icon-button"
                      aria-label="Previous photograph"
                      onClick={() => navigateImage(-1)}
                      disabled={imageIndex <= 0}
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span>
                      {imageIndex + 1} / {lesson.images.length}
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Next photograph"
                      onClick={() => navigateImage(1)}
                      disabled={imageIndex >= lesson.images.length - 1}
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
                <div>
                  {image ? (
                    <>
                      <div
                        className={`source-image-container ${zoom > 100 ? "zoomed" : ""}`}
                      >
                        <img
                          src={image.url}
                          alt={`Original source: ${image.originalFilename}`}
                          style={{
                            transform: `rotate(${image.rotation}deg)`,
                            width: `${zoom}%`,
                          }}
                        />
                      </div>
                      <div className="source-image-tools">
                        <button
                          className="icon-button"
                          disabled={zoom <= 50}
                          onClick={() => setZoom((z) => Math.max(50, z - 25))}
                          aria-label="Zoom out photograph"
                        >
                          <ZoomOut size={14} />
                        </button>
                        <span className="zoom-label">{zoom}%</span>
                        <button
                          className="icon-button"
                          disabled={zoom >= 300}
                          onClick={() => setZoom((z) => Math.min(300, z + 25))}
                          aria-label="Zoom in photograph"
                        >
                          <ZoomIn size={14} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => setZoom(100)}
                          aria-label="Reset photograph zoom"
                        >
                          <RotateCcw size={12} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => setPreview(true)}
                          aria-label="Expand original photograph"
                        >
                          <Expand size={13} />
                        </button>
                      </div>
                      <div className="source-thumbnails">
                        {lesson.images.map((photo, index) => (
                          <button
                            key={photo.id}
                            className={`source-thumbnail ${photo.id === image.id ? "active" : ""}`}
                            onClick={() => {
                              setSelectedImage(photo.id);
                              setZoom(100);
                            }}
                            aria-label={`View board photograph ${index + 1}`}
                          >
                            <img
                              src={photo.url}
                              alt=""
                              style={{
                                transform: `rotate(${photo.rotation}deg)`,
                              }}
                            />
                            <span>{String(index + 1).padStart(2, "0")}</span>
                          </button>
                        ))}
                      </div>
                      <p className="source-filename">
                        {image.originalFilename} · {image.width} ×{" "}
                        {image.height}
                      </p>
                    </>
                  ) : (
                    <div className="no-sources">
                      No original photographs are available.
                    </div>
                  )}
                </div>
                <div className="evidence-inspector">
                  <h3>
                    <ShieldCheck size={14} />
                    Evidence inspector
                  </h3>
                  {activeStep && (
                    <>
                      <dl>
                        <dt>Selected step</dt>
                        <dd>
                          Step {current + 1} ·{" "}
                          {
                            reconstruction.sections.find(
                              (s) => s.id === activeStep.sectionId,
                            )?.title
                          }
                        </dd>
                        <dt>Evidence status</dt>
                        <dd>
                          <span
                            className={`evidence-badge ${activeStep.evidenceStatus.toLowerCase()}`}
                          >
                            {evidenceNames[activeStep.evidenceStatus]}
                          </span>
                        </dd>
                        <dt>What this means</dt>
                        <dd>{evidenceDetail[activeStep.evidenceStatus]}</dd>
                        <dt>Extraction source</dt>
                        <dd>
                          {activeStep.evidenceStatus === "USER_EDITED"
                            ? "Manual user correction"
                            : lesson.isDemo
                              ? "Bundled synthetic sample · no live model"
                              : lastRun
                                ? `${lastRun.provider} · ${lastRun.model}`
                                : "Saved reconstruction"}
                        </dd>
                        {activeStep.originalText && (
                          <>
                            <dt>Original transcription</dt>
                            <dd>
                              <Content text={activeStep.originalText} />
                            </dd>
                          </>
                        )}
                        {activeStep.uncertainty && (
                          <>
                            <dt>Needs your attention</dt>
                            <dd style={{ color: "#a18137" }}>
                              {activeStep.uncertainty}
                            </dd>
                          </>
                        )}
                      </dl>
                      {activeStep.verification && (
                        <div
                          className="verification-note"
                          style={{ marginTop: 15 }}
                        >
                          {activeStep.verification.status === "VERIFIED" ? (
                            <CheckCircle2 size={12} />
                          ) : activeStep.verification.status ===
                            "SUSPICIOUS" ? (
                            <AlertCircle size={12} />
                          ) : (
                            <CircleHelp size={12} />
                          )}
                          <span>{activeStep.verification.message}</span>
                        </div>
                      )}
                      <p className="inspector-note">
                        Only photographed content can be reconstructed. Writing
                        erased before any capture cannot be recovered.
                      </p>
                    </>
                  )}
                </div>
                <button
                  className="text-link"
                  style={{ fontSize: 9, marginTop: "auto" }}
                  onClick={() => {
                    setHistory(true);
                    setPlaying(false);
                  }}
                >
                  <History size={12} />
                  Review revision history{" "}
                  {lesson.revisions.length > 0 &&
                    `(${lesson.revisions.length})`}
                </button>
              </aside>
            </div>
          </>
        )}
        {manageImages && (
          <div className="modal-overlay">
            <div className="modal wide">
              <div className="modal-head">
                <h2>Original photographs</h2>
                <button
                  className="icon-button"
                  onClick={() => setManageImages(false)}
                  aria-label="Close photo manager"
                >
                  <X size={20} />
                </button>
              </div>
              <UploadPanel
                lesson={lesson}
                providers={providers}
                onChange={setLesson}
                onProcess={process}
                onError={setError}
                compact
              />
            </div>
          </div>
        )}
        {editor && (
          <StepEditor
            reconstruction={editor.reconstruction}
            step={editor.step}
            onClose={() => setEditor(null)}
            onSave={save}
            busy={saving}
          />
        )}{" "}
        {history && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-head">
                <h2>Revision history</h2>
                <button
                  className="icon-button"
                  onClick={() => setHistory(false)}
                  disabled={saving}
                  aria-label="Close revision history"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="muted" style={{ fontSize: 11, lineHeight: 1.8 }}>
                Edits and reruns preserve the previous reconstruction. Restoring
                a revision also saves your current version.
              </p>
              {lesson.revisions.length ? (
                lesson.revisions.map((revision) => (
                  <div className="revision-row" key={revision.id}>
                    <div>
                      <strong>{revision.reason}</strong>
                      <small>
                        {new Date(revision.createdAt).toLocaleString()}
                      </small>
                    </div>
                    <button
                      className="btn btn-secondary btn-small"
                      disabled={saving}
                      onClick={() => void restore(revision.id)}
                    >
                      <History size={11} />
                      Restore
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-state" style={{ padding: "35px 10px" }}>
                  <History size={26} />
                  <p>
                    No older versions yet. Your first correction creates a
                    revision.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        {preview && image && (
          <div className="modal-overlay">
            <div className="modal image-preview-modal">
              <div className="modal-head">
                <h2 style={{ fontSize: 16 }}>{image.originalFilename}</h2>
                <button
                  className="icon-button"
                  onClick={() => setPreview(false)}
                  aria-label="Close photograph"
                >
                  <X size={20} />
                </button>
              </div>
              <img
                className="preview-image"
                src={image.url}
                alt="Original board photograph"
                style={{ transform: `rotate(${image.rotation}deg)` }}
              />
              <a
                className="text-link"
                style={{ marginTop: 12 }}
                href={image.url}
                target="_blank"
                rel="noreferrer"
              >
                Open original image for full-resolution inspection{" "}
                <Expand size={13} />
              </a>
            </div>
          </div>
        )}
        {metadata && (
          <div className="modal-overlay">
            <form className="modal" onSubmit={rename}>
              <div className="modal-head">
                <h2>Rename lesson</h2>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setMetadata(false)}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              <label className="field">
                <span className="label">Lesson name</span>
                <input
                  className="input"
                  required
                  autoFocus
                  maxLength={180}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setMetadata(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={saving || !title.trim()}
                >
                  {saving ? "Saving…" : "Save name"}
                </button>
              </div>
            </form>
          </div>
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function ScanIcon() {
  return <Loader2 size={13} />;
}
