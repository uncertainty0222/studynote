import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "우리 가계부",
  description: "부부 공유 돈 관리 앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
