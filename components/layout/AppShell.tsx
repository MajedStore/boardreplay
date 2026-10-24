"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  FlaskConical,
  Menu,
  Moon,
  Sun,
  FileText,
  X,
} from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="BoardReplay home">
      <span className="brand-mark">
        <span />
        <span />
        <span />
      </span>
      {!compact && (
        <span>
          Board<span className="brand-light">Replay</span>
          <span className="brand-dot">.</span>
        </span>
      )}
    </Link>
  );
}

export default function AppShell({
  children,
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const path = usePathname();
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const value = localStorage.getItem("boardreplay-theme") === "dark";
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
  }, []);
  function toggleTheme() {
    const value = !dark;
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
    localStorage.setItem("boardreplay-theme", value ? "dark" : "light");
  }
  const links = [
    { href: "/lessons", title: "My lessons", icon: BookOpen },
    { href: "/lab", title: "AI Comparison Lab", icon: FlaskConical },
    { href: "/report", title: "Academic report", icon: FileText },
  ];
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="nav-inner">
          <Brand />
          <nav
            className={menu ? "main-nav is-open" : "main-nav"}
            aria-label="Main navigation"
          >
            {links.map(({ href, title: name, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenu(false)}
                className={
                  path.startsWith(href) ? "nav-link active" : "nav-link"
                }
              >
                <Icon size={15} />
                {name}
              </Link>
            ))}
          </nav>
          <div className="nav-actions">
            <span className="local-badge">
              <span />
              Local workspace
            </span>
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label={dark ? "Use light theme" : "Use dark theme"}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link className="nav-create" href="/lessons/new">
              New lesson <ArrowUpRight size={15} />
            </Link>
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle menu"
            >
              {menu ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
      </header>
      {title && (
        <div className="page-header">
          <div>
            <span className="eyebrow">YOUR LEARNING, CONNECTED</span>
            <h1>{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
      <footer className="app-footer">
        <Brand />
        <span>A clearer picture of what you learned.</span>
        <span className="footer-note">
          Private by default · Stored on this device&apos;s server
        </span>
      </footer>
    </div>
  );
}
