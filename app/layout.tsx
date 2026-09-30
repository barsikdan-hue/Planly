import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal SMM Planner",
  description: "Твой персональный центр управления контентом. Создавай, планируй и проверяй публикации.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
