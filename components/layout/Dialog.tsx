"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal supplies focus containment, Escape handling and focus restoration. */
export function Dialog({ title, children, onClose, className = "", busy = false }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <dialog ref={ref} className={`lesson-dialog ${className}`} aria-label={title}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="lesson-dialog-content">
        <header className="lesson-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose} disabled={busy}><X size={20} /></button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
