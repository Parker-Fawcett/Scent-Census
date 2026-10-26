import { ImageResponse } from "next/og";

// The share card for every route without its own OG image: the wall, the
// product's question, and the honest breadth numbers. Static text keeps the
// counts rounded so the file only needs regenerating when the catalogue
// grows by an order of magnitude.
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(180deg, #f4e9d4 0%, #e9dcc6 60%, #e9dcc6 100%)",
          color: "#2a241c",
          padding: "64px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>Scent Census</div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            maxWidth: 980,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.15 }}>
            Which clone actually smells like the real thing?
          </div>
          <div style={{ fontSize: 30, color: "#6b5c44", lineHeight: 1.3 }}>
            Ranked by census votes from people who own both bottles.
          </div>
        </div>
        <div style={{ fontSize: 24, color: "#8a7759" }}>
          140,000+ fragrances · 8,000+ houses · Free
        </div>
      </div>
    ),
    size,
  );
}
