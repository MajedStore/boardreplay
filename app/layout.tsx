import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "BoardReplay — Your lecture, reconstructed.",
  description:
    "Turn whiteboard photos into clear, source-linked notes and replayable lessons.",
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
