import fs from "fs";
import path from "path";
import Link from "next/link";
import { renderMarkdown } from "@/lib/renderMarkdown";

export const metadata = { title: "Architecture — Mazer" };

export default function ArchitecturePage() {
  const raw = fs.readFileSync(
    path.join(process.cwd(), "architecture.md"),
    "utf-8",
  );
  const html = renderMarkdown(raw);

  return (
    <div className="archPage">
      <header className="archHeader">
        <Link href="/docs" className="archBackBtn">
          ← Docs
        </Link>
        <span className="archHeaderTitle">architecture.md</span>
        <span className="archHeaderBadge">Claude</span>
      </header>
      <main
        className="archContent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
