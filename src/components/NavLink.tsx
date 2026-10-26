"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Masthead link that marks the page the reader is on. Screen readers announce
 * aria-current and the CSS already styles it; without the attribute the
 * visitor has no cue for which of the three links is where they are.
 */
export function NavLink({ href, children, className }: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname() ?? "/";
  const isExact = pathname === href;
  // "/" only ever means the home page, so it never marks a section prefix.
  const isSection = href !== "/" && (pathname === href || pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      className={className}
      aria-current={isExact || isSection ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
