import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Four answers, one bottle",
  description:
    "Name a bottle you own, pick scent families, say whether you would wear a clone, and set a budget. Every step is skippable.",
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
