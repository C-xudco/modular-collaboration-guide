import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "协作指南 · Codex 模块化助手",
  description: "选择协作方法，管理个人记忆，让每个任务更容易开始。",
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
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
