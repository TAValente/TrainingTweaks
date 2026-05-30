import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrainingTweaks",
  description: "A chat-first running decision assistant for adapting an existing training plan."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
