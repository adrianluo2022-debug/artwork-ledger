import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "画簿 · 作品与授权工作台",
  description: "把每张作品的创作、约稿与授权，好好记下来。",
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
