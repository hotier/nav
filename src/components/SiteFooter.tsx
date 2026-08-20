import { APP_VERSION } from "@/lib/version";

export function SiteFooter() {
  return (
    <footer className="mt-4 pt-4 pb-4 text-center text-xs text-muted-foreground border-t border-border">
      <span className="font-medium" style={{ fontFamily: "var(--font-space-grotesk)" }}>OneNav</span>{" "}
      v{APP_VERSION} · Built with Next.js &amp; Prisma · &copy; {new Date().getFullYear()}
    </footer>
  );
}
