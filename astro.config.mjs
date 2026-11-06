import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export default defineConfig({
  site: "https://www.dongho.dev",
  output: "static",
  trailingSlash: "always",
  redirects: {
    // Robot Hardware: KR permalinks follow the post numbers (01-06); old content-based/shifted URLs redirect
    "/hardware-torque-ripple-backlash-kr/": "/hardware05-kr/",
    "/hardware07-kr/": "/hardware06-kr/",
    "/hardware07/": "/hardware06/",
  },
  integrations: [react(), mdx(), sitemap()],
  markdown: {
    shikiConfig: { theme: "github-light" },
    processor: unified({ remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }),
  },
});
