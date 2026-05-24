import { APP_VERSION } from "@/lib/version";

export function SiteFooter() {
  return (
    <footer className="mt-4 pt-4 pb-4 text-center text-xs text-slate-400 dark:text-slate-500 border-t border-slate-200/60 dark:border-slate-700/40">
      <span className="font-medium" style={{ fontFamily: "var(--font-space-grotesk)" }}>OneNav</span>{" "}
      v{APP_VERSION} · Built with Next.js &amp; Prisma · &copy; {new Date().getFullYear()}
    </footer>
  );
}
