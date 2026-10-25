import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./simple.css";
export const metadata: Metadata = {
  title: "BoardReplay — Your lecture, organized.",
  description:
    "Organize lecture photographs automatically and study a contextual explanation directly below each photo.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
