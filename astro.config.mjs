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
    // Robot Hardware restructure: old 05 (torque ripple) and 06 (backlash) merged into the new 04
    "/hardware05-kr/": "/hardware-torque-ripple-backlash-kr/",
    "/hardware06-kr/": "/hardware-torque-ripple-backlash-kr/",
  },
  integrations: [react(), mdx(), sitemap()],
  markdown: {
    shikiConfig: { theme: "github-light" },
    processor: unified({ remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }),
  },
});
