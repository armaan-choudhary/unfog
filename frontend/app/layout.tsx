import type { Metadata } from "next";
import "../styles/tokens.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "Unfog 2.0",
  description: "A source-grounded codebase learning platform.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
