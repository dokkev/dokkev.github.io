#!/usr/bin/env python3
"""Check internal links in the Robot Hardware series.

Collects every page URL the site generates from content/blog and
content/projects (same rules as src/lib/content.ts), then checks, for each
file in content/blog/hardware/{kr,en}:

  - internal links (Markdown, HTML href/src, selective_figure rows) point to
    an existing page URL or a file under public/
  - translations[].url values exist
  - the "다음 포스트 / Next post" link text names the target's exact title

Exit code is 1 if any problem is found.
Usage: python3 scripts/check-hardware-links.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
PUBLIC = ROOT / "public"
SERIES_DIRS = [CONTENT / "blog/hardware/kr", CONTENT / "blog/hardware/en"]
# Routes that come from src/pages rather than Markdown.
STATIC_ROUTES = {"/", "/blog/", "/projects/", "/about/", "/cv/", "/news/"}


def front_matter(text):
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    return (m.group(1), text[m.end():]) if m else ("", text)


def field(fm, key):
    m = re.search(rf"^{key}:\s*(.+)$", fm, re.M)
    return m.group(1).strip().strip('"').strip("'") if m else None


def page_urls():
    urls = {}
    for folder in ("blog", "projects"):
        for f in (CONTENT / folder).rglob("*.md*"):
            if not re.match(r"\d{4}-\d{2}-\d{2}-", f.name):
                continue
            fm, _ = front_matter(f.read_text(encoding="utf-8"))
            if not field(fm, "title") or field(fm, "published") == "false":
                continue
            slug = re.sub(r"\.mdx?$", "", f.name)[11:]
            url = field(fm, "permalink") or (
                f"/projects/{slug}/" if folder == "projects" else f"/blog/{f.name[:4]}/{slug}/"
            )
            urls[url] = (f, field(fm, "title"))
    return urls


def normalize(url):
    url = url.split("#")[0].split("?")[0]
    return url if url.endswith("/") or "." in url.rsplit("/", 1)[-1] else url + "/"


def main():
    urls = page_urls()
    problems = 0
    for d in SERIES_DIRS:
        for f in sorted(d.glob("*.md")):
            text = f.read_text(encoding="utf-8")
            fm, body = front_matter(text)
            rel = f.relative_to(ROOT)
            links = re.findall(r"\]\((/[^)\s]*)\)", body)
            links += re.findall(r'(?:href|src)="(/[^"]*)"', body)
            links += re.findall(r'path="(assets/[^"]*)"', body)
            links += [l.strip() for l in re.findall(r"\|\s*(/[^|\n]+?)\s*$", body, re.M)]
            links += re.findall(r"^\s*url:\s*(/\S+)", fm, re.M)
            for link in links:
                link = "/" + link.lstrip("/")
                target = normalize(link)
                if target.startswith("/assets/") or "." in target.rsplit("/", 1)[-1]:
                    ok = (PUBLIC / target.lstrip("/")).exists()
                else:
                    ok = target in urls or target in STATIC_ROUTES
                if not ok:
                    problems += 1
                    print(f"BROKEN  {rel}: {link}")
            for title, link in re.findall(
                r"\[(?:다음 포스트|Next [Pp]ost)\s*:\s*(.+?)\]\((/[^)\s]+)\)", body
            ):
                target = urls.get(normalize(link))
                if target and title.strip() != target[1]:
                    problems += 1
                    print(f"TITLE   {rel}: next-post text {title.strip()!r} != target title {target[1]!r}")
    print(f"{problems} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
