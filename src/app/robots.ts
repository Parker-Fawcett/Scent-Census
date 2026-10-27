import type { MetadataRoute } from "next";

const SITE_URL = "https://scentcensus.com";

// Everything public is crawlable. Auth-gated surfaces (feed, onboarding,
// /api) stay out of the index; the census product pages are the SEO asset.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/onboarding", "/shelf", "/shelf/add", "/signin", "/creator/claim"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
