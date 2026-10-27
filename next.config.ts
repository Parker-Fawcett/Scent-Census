import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The census pages are rendered per request because they read runtime data
  // (votes, prices, a family graph). Their static shell must never be cached
  // by the CDN: a cached shell points at the chunks from the build that made
  // it, so after the next deploy the browser loads the current chunks, the
  // flight payload does not match, and React never renders the page. The
  // reader sees "Loading..." forever while the server response looks fine.
  async headers() {
    return [
      {
        source: "/fragrance/:slug*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/house/:slug*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/creator/:slug*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/explore",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/search",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
