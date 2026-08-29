import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { TopLoader } from "@/components/TopLoader";
import { PageLoadComplete } from "@/components/PageLoadComplete";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "OneNav",
  description: "简洁高效的书签导航管理系统",
  icons: {
    icon: "/icon.svg",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geist.variable} ${spaceGrotesk.variable} antialiased`}
      >
        {/* 主题初始化脚本：由服务端渲染进 HTML，在首帧绘制前执行以避免闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(e){}})();',
          }}
        />
        <Suspense fallback={null}>
          <TopLoader />
        </Suspense>
        <ThemeProvider>
          <AuthProvider>
            <ServiceWorkerRegistration />
            <PageLoadComplete>{children}</PageLoadComplete>
            <Toaster position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
