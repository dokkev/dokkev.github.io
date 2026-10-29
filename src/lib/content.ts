import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { rehypeShiki } from "@astrojs/markdown-remark";

const root = path.resolve("content");
const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const attributes = (s: string) => Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1], m[2]]));

// Translate the two Liquid figure forms used by the existing source articles.
// Text, equations, references, and URLs stay in their original Markdown files.
export function legacyMarkdown(source: string) {
  const fenced: string[] = [];
  let s = source.replace(/```[\s\S]*?```/g, (block) => `CODEBLOCKPLACEHOLDER${fenced.push(block) - 1}END`);
  s = s.replace(/{%\s*include\s+figure\.liquid\s+([\s\S]*?)%}/g, (_, args) => {
    const a = attributes(args);
    if (!a.path) throw new Error(`Figure has no path: ${args}`);
    return `<figure><img src="/${escape(a.path.replace(/^\//, ""))}" alt="${escape(a.alt || a.title || "")}" loading="lazy" /></figure>`;
  });
  s = s.replace(/{%\s*selective_figure[^%]*%}([\s\S]*?){%\s*endselective_figure\s*%}/g, (_, body: string) => {
    const cards = body
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [, title, , image, alt, description, link] = line.split("|").map((x) => x.trim());
        return `<figure><img src="${escape(image)}" alt="${escape(alt || title)}" loading="lazy" /><figcaption><strong>${escape(
          title
        )}</strong><p>${escape(description || "")}</p>${link ? `<a href="${escape(link)}">Read more →</a>` : ""}</figcaption></figure>`;
      });
    return `<div class="figure-grid">${cards.join("")}</div>`;
  });
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math}$`).replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math}\n$$\n`);
  s = s.replace(/CODEBLOCKPLACEHOLDER(\d+)END/g, (_, i) => fenced[Number(i)]);
  if (/{%/.test(s)) throw new Error("Unconverted Liquid tag in Markdown");
  return s;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeKatex)
  .use(rehypeShiki, { theme: "github-light" })
  .use(rehypeStringify);
export async function markdown(source: string) {
  return String(await processor.process(legacyMarkdown(source)));
}

export interface Document {
  title: string;
  description: string;
  url: string;
  body: string;
  date: string;
  updated?: string;
  mdx?: string;
  lang: string;
  hidden: boolean;
  series?: string;
  parent?: string;
  seriesOrder: number;
  image?: string;
  group?: string;
  importance: number;
  redirect?: string;
  translations: { lang: string; label: string; url: string }[];
}
function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : /\.mdx?$/.test(filename) ? [filename] : [];
  });
}
function documents(folder: "blog" | "projects"): Document[] {
  return files(path.join(root, folder)).flatMap((filename) => {
    const { data, content } = matter(fs.readFileSync(filename, "utf8"));
    const basename = path.basename(filename).replace(/\.mdx?$/, "");
    if (!data.title || data.published === false || !/^\d{4}-\d{2}-\d{2}-/.test(basename)) return [];
    const date = basename.slice(0, 10);
    const slug = basename.slice(11);
    const url = data.permalink || (folder === "projects" ? `/projects/${slug}/` : `/blog/${date.slice(0, 4)}/${slug}/`);
    return [
      {
        title: data.title,
        description: data.description || "",
        url,
        body: content,
        date,
        updated: data.updated,
        mdx: filename.endsWith(".mdx") ? path.relative(root, filename) : undefined,
        lang: data.lang || "en",
        hidden: data.hidden === true,
        series: data.series,
        parent: data.parent,
        seriesOrder: data.series_order || 0,
        image: data.img ? "/" + data.img.replace(/^\//, "") : undefined,
        group: data.project_group,
        importance: data.importance || 99,
        redirect: data.redirect,
        translations: data.translations || [],
      },
    ];
  });
}
export const posts = documents("blog").sort((a, b) => b.date.localeCompare(a.date));
export const projects = documents("projects").sort((a, b) => a.importance - b.importance);
export const listedPosts = posts.filter((p) => !p.hidden && !p.parent && p.lang !== "ko");
export const seriesNames = [...new Set(posts.filter((p) => p.lang !== "ko" && p.series).map((p) => p.series!))];
export const about = matter(fs.readFileSync(path.join(root, "about.md"), "utf8")).content;
export const news = files(path.join(root, "news"))
  .map((filename) => {
    const { data, content } = matter(fs.readFileSync(filename, "utf8"));
    return { date: String(data.date).slice(0, 10), body: content };
  })
  .sort((a, b) => b.date.localeCompare(a.date));
