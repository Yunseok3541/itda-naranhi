import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#F7F5FA",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "나란히",
  appleWebApp: { capable: true, title: "나란히", statusBarStyle: "default" },
  description: "자기 속도로 바깥과 이어지는 작은 걸음 — 팀 잇다 (시연용 서비스)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
