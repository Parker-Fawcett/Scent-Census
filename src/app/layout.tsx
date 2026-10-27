import { Suspense } from "react";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { signOutAction } from "./actions";
import type { Metadata } from "next";
import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";

// The type pairing, chosen deliberately: Fraunces carries the display
// voice (a reference work about scent, not a dashboard about software)
// and Instrument Sans does the reading. Geist was the old default, and a
// single family doing every job is the reason a page reads as generated.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const SITE_URL = "https://scentcensus.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Scent Census: which clone actually smells close?",
    template: "%s · Scent Census",
  },
  description:
    "Clone fragrances ranked by census votes from people who own both bottles. Track your shelf across 140,000+ fragrances and 8,000+ houses. Free.",
  openGraph: {
    type: "website",
    siteName: "Scent Census",
    locale: "en_US",
    url: SITE_URL,
    title: "Scent Census: which clone actually smells close?",
    description:
      "Clone fragrances ranked by census votes from people who own both bottles. Track your shelf across 140,000+ fragrances and 8,000+ houses. Free.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scent Census: which clone actually smells close?",
    description:
      "Clone fragrances ranked by census votes from people who own both bottles. Track your shelf across 140,000+ fragrances and 8,000+ houses. Free.",
  },
  robots: { index: true, follow: true },
};

// The unit that ties the brand to the census moat for AI systems: "clone
// census" is how the product is described in discussion, so say it inside
// the structured data too.
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Scent Census",
  alternateName: "Clone Census",
  url: SITE_URL,
};

// The app shell is cached by the CDN, and the shell is where the Suspense
// fallback lives. A cached shell whose flight payload references chunks from
// a build that no longer exists is a page that streams its content and never
// renders it: the reader sees "Loading..." forever while the server response
// looks perfectly fine.
//
// "instant = false" lets the route block on request-time data instead of
// being prerendered, which is what every page that reads the census needs.
export const instant = false;

/**
 * The nav knows whether you have an account.
 *
 * The static fallback keeps the shell honest for any route that still
 * prerenders, and the streamed nav swaps in per request. The difference
 * between the two is one row: an account gets its picks, its index and its
 * shelf, and a way out.
 */
async function SessionNav() {
  await connection();
  const session = await auth();
  if (session?.user?.id) {
    return (
      <nav>
        <NavLink href="/">For you</NavLink>
        <NavLink href="/explore">Explore</NavLink>
        <NavLink href="/shelf">Shelf</NavLink>
        <NavLink href="/creators">Creators</NavLink>
        <form action={signOutAction}>
          <button type="submit" className="nav-plain">
            Sign out
          </button>
        </form>
      </nav>
    );
  }
  return (
    <nav>
      <NavLink href="/explore">Explore</NavLink>
      <NavLink href="/creators">Creators</NavLink>
      <Link href="/signin" className="nav-cta">
        Sign in
      </Link>
    </nav>
  );
}

function NavFallback() {
  return (
    <nav>
      <Link href="/explore">Explore</Link>
      <Link href="/creators">Creators</Link>
      <Link href="/signin" className="nav-cta">
        Sign in
      </Link>
    </nav>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${instrumentSans.variable}`}
    >
      <body>
        <header className="masthead">
          <Link href="/" className="logo">
            Scent Census
          </Link>
          {/* The search box is the front door. Without it a visitor can only
              reach the seven bottles on the wall, and the other 140,000
              fragrances are unreachable. */}
          <form action="/search" method="get" className="masthead-search">
            <input
              type="search"
              name="q"
              placeholder="Find a fragrance or a house"
              aria-label="Search the catalogue"
            />
          </form>
          <Suspense fallback={<NavFallback />}>
            <SessionNav />
          </Suspense>
        </header>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
