"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  RotateCw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { request } from "@/lib/client";
import type {
  Lesson,
  LectureImage,
  ProviderId,
  ProviderInfo,
} from "@/lib/types";

export function UploadPanel({
  lesson,
  providers,
  onChange,
  onProcess,
  onError,
  compact = false,
}: {
  lesson: Lesson;
  providers: ProviderInfo[];
  onChange: (value: Lesson) => void;
  onProcess: (provider: ProviderId) => Promise<void>;
  onError: (message: string) => void;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<LectureImage | null>(null),
    [selected, setSelected] = useState<ProviderId | "">(""),
    [localError, setLocalError] = useState("");
  const provider = selected || providers.find((p) => p.configured)?.id || "";
  function reportError(message: string) {
    setLocalError(message);
    onError(message);
  }
  async function upload(files: FileList | File[] | null) {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (selectedFiles.some((file) => !allowed.includes(file.type))) {
      reportError(
        "Choose JPG, PNG, or WebP images. File contents are also checked by the server.",
      );
      return;
    }
    if (selectedFiles.some((file) => file.size > 10 * 1024 * 1024)) {
      reportError("Each photograph must be 10 MB or smaller.");
      return;
    }
    if (selectedFiles.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024) {
      reportError("Upload at most 100 MB in one batch.");
      return;
    }
    if (selectedFiles.length + lesson.images.length > 20) {
      reportError("A lesson can contain up to 20 photographs.");
      return;
    }
    setBusy(true);
    reportError("");
    try {
      const body = new FormData();
      selectedFiles.forEach((file) => body.append("files", file));
      onChange(
        await request<Lesson>(`/api/lessons/${lesson.id}/images`, {
          method: "POST",
          body,
        }),
      );
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  }
  async function mutate(url: string, method: string, body?: unknown) {
    setBusy(true);
    reportError("");
    try {
      await request(url, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      onChange(await request<Lesson>(`/api/lessons/${lesson.id}`));
    } catch (e) {
      reportError(
        e instanceof Error ? e.message : "Could not update photograph.",
      );
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, offset: number) {
    const ids = lesson.images.map((i) => i.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    void mutate(`/api/lessons/${lesson.id}/images`, "PATCH", { imageIds: ids });
  }
  return (
    <div
      className="upload-intro"
      style={compact ? { paddingTop: 0 } : undefined}
    >
      {!compact && (
        <>
          <span className="eyebrow">01 / GATHER THE EVIDENCE</span>
          <h2>A lecture worth a second look.</h2>
          <p>
            Add your whiteboard photographs, then arrange them in the order they
            were captured. Overlapping content helps connect the explanation.
          </p>
        </>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => void upload(e.target.files)}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => void upload(e.target.files)}
      />
      {localError && (
        <div className="alert error" role="alert" style={{ marginBottom: 15 }}>
          {localError}
        </div>
      )}
      <div
        className={`dropzone ${drag ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!busy) void upload(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <Loader2 size={28} className="spin" />
        ) : (
          <ImagePlus size={31} strokeWidth={1.4} />
        )}
        <h3>
          {busy ? "Saving your photographs…" : "Drop your board photos here"}
        </h3>
        <p>
          {busy
            ? "Original files are being checked and stored."
            : "A few clear photos are all you need to get started."}
        </p>
        <div className="dropzone-actions">
          <button
            className="btn btn-primary"
            disabled={busy || lesson.images.length >= 20}
            onClick={() => input.current?.click()}
          >
            <Upload size={14} />
            Choose photographs
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy || lesson.images.length >= 20}
            onClick={() => camera.current?.click()}
          >
            <Camera size={14} />
            Use camera
          </button>
        </div>
        <small>
          JPG, PNG, WebP · 10 MB per image · Up to 20 images · 100 MB per batch
        </small>
      </div>
      {lesson.images.length > 0 && (
        <>
          <div
            className="section-heading"
            style={{ marginTop: 24, marginBottom: 10 }}
          >
            <h3 style={{ fontSize: 12 }}>Your board sequence</h3>
            <span className="muted" style={{ fontSize: 9 }}>
              Earliest first · {lesson.images.length} photos
            </span>
          </div>
          <div className="upload-list">
            {lesson.images.map((image, index) => (
              <div key={image.id} className="upload-row">
                <span className="upload-order-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <img
                  className="upload-thumb"
                  src={image.url}
                  alt={`Board photograph ${index + 1}`}
                  style={{ transform: `rotate(${image.rotation}deg)` }}
                  onClick={() => setPreview(image)}
                />
                <div className="upload-info">
                  <strong>{image.originalFilename}</strong>
                  <small>
                    {image.width} × {image.height} · {image.rotation}°
                  </small>
                </div>
                <div className="upload-row-actions">
                  <button
                    className="icon-button"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move photo ${index + 1} earlier`}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy || index === lesson.images.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move photo ${index + 1} later`}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    onClick={() =>
                      void mutate(`/api/images/${image.id}`, "PATCH", {
                        rotation: (image.rotation + 90) % 360,
                      })
                    }
                    aria-label={`Rotate photo ${index + 1}`}
                  >
                    <RotateCw size={14} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    onClick={() =>
                      void mutate(`/api/images/${image.id}`, "DELETE")
                    }
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="provider-options">
        <h3>Choose your reconstruction provider</h3>
        <div className="provider-radio-list">
          {providers.map((p) => (
            <label
              key={p.id}
              className={`provider-radio ${p.configured ? "" : "unavailable"}`}
            >
              <input
                type="radio"
                name={`provider-${lesson.id}`}
                value={p.id}
                checked={provider === p.id}
                onChange={() => setSelected(p.id)}
                disabled={!p.configured || busy}
              />
              <span>
                {p.name}
                <small>
                  {p.configured ? (
                    <>
                      <Check
                        size={8}
                        style={{ display: "inline", marginRight: 2 }}
                      />
                      {p.model}
                    </>
                  ) : (
                    "API key not configured"
                  )}
                </small>
              </span>
            </label>
          ))}
        </div>
        {!providers.some((p) => p.configured) && (
          <p
            className="field-help"
            style={{ margin: "14px 0 0", lineHeight: 1.8 }}
          >
            Add a provider API key to the server&apos;s <code>.env</code> file
            and restart to process your photos. The{" "}
            <Link className="text-link" href="/lessons">
              sample lesson
            </Link>{" "}
            works without a key.
          </p>
        )}
      </div>
      {lesson.reconstruction && (
        <div className="alert info" style={{ fontSize: 10 }}>
          Reconstructing again saves the current version, including your
          corrections, to revision history. It creates a fresh reconstruction
          from the current photograph sequence.
        </div>
      )}
      <div className="upload-bottom">
        <p>
          <ShieldCheck
            size={11}
            style={{
              display: "inline",
              verticalAlign: "middle",
              marginRight: 4,
            }}
          />
          Your original files stay on this server. Processing sends the selected
          images to your chosen AI provider. Never include information you
          don&apos;t want to share.
        </p>
        <button
          className="btn btn-primary"
          disabled={busy || !lesson.images.length || !provider}
          onClick={() => {
            if (provider) void onProcess(provider);
          }}
        >
          {lesson.reconstruction ? "Reconstruct again" : "Reconstruct lesson"}
          <ArrowRight size={15} />
        </button>
      </div>
      {preview && (
        <div className="modal-overlay">
          <div className="modal image-preview-modal">
            <div className="modal-head">
              <h2 style={{ fontSize: 16 }}>{preview.originalFilename}</h2>
              <button
                className="icon-button"
                onClick={() => setPreview(null)}
                aria-label="Close image preview"
              >
                <X size={20} />
              </button>
            </div>
            <img
              className="preview-image"
              src={preview.url}
              alt="Full board photograph"
              style={{ transform: `rotate(${preview.rotation}deg)` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
