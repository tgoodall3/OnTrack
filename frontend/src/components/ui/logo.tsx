"use client";

import Link from "next/link";

interface LogoProps {
  href?: string;
  className?: string;
}

export function Logo({ href = "/dashboard", className }: LogoProps) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2 font-semibold tracking-tight text-primary transition hover:text-accent ${className ?? ""}`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-all group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-accent/50">
        <span className="text-lg font-bold leading-none">OT</span>
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-lg font-semibold">OnTrack</span>
        <span className="text-xs font-medium text-muted-foreground">
          Contractor Ops
        </span>
      </div>
    </Link>
  );
}
