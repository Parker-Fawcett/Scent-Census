import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your shelf",
  description: "Track the bottles you own and their market value.",
  robots: { index: false, follow: false },
};

export default function ShelfLayout({ children }: { children: React.ReactNode }) {
  return children;
}
