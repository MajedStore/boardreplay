"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, FileText, FlaskConical, Moon, MoreHorizontal, Sun } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="BoardReplay home">
      <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
      {!compact && <span>Board<span className="brand-light">Replay</span></span>}
    </Link>
  );
}

export default function AppShell({ children, title, subtitle, action }: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const path = usePathname();
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const value = localStorage.getItem("boardreplay-theme") === "dark";
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
  }, []);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function dismiss(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);

  function toggleTheme() {
    const value = !dark;
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
    localStorage.setItem("boardreplay-theme", value ? "dark" : "light");
    setMenu(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="app-shell simple-app-shell">
      <header className="app-header simple-app-header">
        <div className="simple-nav">
          <Brand />
          <nav className="simple-nav-actions" aria-label="Main navigation">
            <Link href="/lessons" className={path === "/lessons" ? "simple-nav-link active" : "simple-nav-link"} aria-current={path === "/lessons" ? "page" : undefined}>Lessons</Link>
            <div className="simple-menu-wrap" ref={menuRef}>
              <button ref={triggerRef} className="icon-button" aria-label="More options" aria-haspopup="menu" aria-expanded={menu} aria-controls="app-options" onClick={() => setMenu(!menu)}><MoreHorizontal size={21} /></button>
              {menu && (
                <div id="app-options" className="simple-menu" role="menu" aria-label="More options" onKeyDown={(event) => {
                  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
                  const index = items.indexOf(document.activeElement as HTMLElement);
                  let next = index;
                  if (event.key === "ArrowDown") next = (index + 1) % items.length;
                  else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = items.length - 1;
                  else if (event.key === "Tab") { setMenu(false); return; }
                  else return;
                  event.preventDefault();
                  items[next]?.focus();
                }}>
                  <Link role="menuitem" href="/lessons" className="simple-menu-item" onClick={() => setMenu(false)}><BookOpen size={17} />All lessons</Link>
                  <Link role="menuitem" href="/lab" className="simple-menu-item" onClick={() => setMenu(false)}><FlaskConical size={17} />AI Comparison Lab</Link>
                  <Link role="menuitem" href="/report" className="simple-menu-item" onClick={() => setMenu(false)}><FileText size={17} />Academic report</Link>
                  <div className="simple-menu-divider" />
                  <button role="menuitem" className="simple-menu-item" onClick={toggleTheme}>{dark ? <Sun size={17} /> : <Moon size={17} />}{dark ? "Use light theme" : "Use dark theme"}</button>
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>
      {title && <div className="page-header simple-page-header"><div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>{action}</div>}
      {children}
    </div>
  );
}
