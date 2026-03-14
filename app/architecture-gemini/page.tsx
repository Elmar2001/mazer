import fs from "fs";
import path from "path";
import Link from "next/link";
import { renderMarkdown } from "@/lib/renderMarkdown";

export const metadata = { title: "Architecture (Gemini) — Mazer" };

export default function ArchitectureGeminiPage() {
  const raw = fs.readFileSync(
    path.join(process.cwd(), "architecture_gemini.md"),
    "utf-8",
  );
  const html = renderMarkdown(raw);

  return (
    <div className="archPage">
      <header className="archHeader">
        <Link href="/docs" className="archBackBtn">
          ← Docs
        </Link>
        <span className="archHeaderTitle">architecture_gemini.md</span>
        <span className="archHeaderBadge archHeaderBadgeGemini">Gemini</span>
      </header>
      <main
        className="archContent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
