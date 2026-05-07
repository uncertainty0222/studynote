import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "우리가족 혜택 모아보기 🥭",
  description: "창원 거주 다문화가정·출산가정을 위한 정부·지자체 혜택 정보 모음",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
