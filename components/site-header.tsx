"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { btnPrimary } from "./button-styles";

const LINKS = [
  { id: "features", label: "功能" },
  { id: "pricing", label: "价格" },
  { id: "how", label: "怎么用" },
] as const;

function Mark() {
  return (
    <span className="grid size-8 place-items-center rounded-lg bg-brand text-on-brand shadow-card">
      <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none">
        <path
          d="M12 3.2 5.2 6.1v5.7c0 4.1 2.7 7.2 6.8 8.4 4.1-1.2 6.8-4.3 6.8-8.4V6.1L12 3.2Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M8.6 12.1h6.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <header
      ref={rootRef}
      className="sticky top-0 z-40 border-b border-line/80 bg-background/80 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-3 px-5">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <Mark />
          NegGuard
        </Link>

        <nav aria-label="页面" className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.id}
              href={`/#${link.id}`}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/#upload" className={`${btnPrimary} px-3 sm:px-4`}>
            免费快检
          </Link>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-card text-foreground md:hidden"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="sr-only">{open ? "关闭菜单" : "打开菜单"}</span>
            <svg viewBox="0 0 20 20" aria-hidden className="size-5" fill="none">
              {open ? (
                <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              ) : (
                <path d="M3.5 6h13M3.5 10h13M3.5 14h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id={panelId} aria-label="移动端页面" className="border-t border-line bg-card md:hidden">
          <ul className="mx-auto flex w-full max-w-[1120px] flex-col px-3 py-2">
            {LINKS.map((link) => (
              <li key={link.id}>
                <Link
                  href={`/#${link.id}`}
                  className="block rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-brand-soft"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
