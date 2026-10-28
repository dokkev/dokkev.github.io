# Astro portfolio prototype

This app lives on `codex/astro-portfolio`. It builds independently of the existing
Jekyll site. The production deployment workflow still builds Jekyll from `main`.
The Astro workflow checks this branch; it does not publish to GitHub Pages.

## Run locally

Use Node.js 24 and pnpm 11.25.0:

```sh
cd astro
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:4321. For the production output:

```sh
pnpm check
pnpm build
pnpm preview
```

## Content and rendering

- `_bibliography/papers.bib` remains the publication source, including custom
  preview, contribution, selected, PDF, and website fields.
- `_posts/` and `_projects/` remain the article sources. Published articles keep
  their frontmatter permalinks. Drafts and template files are excluded. Hidden
  posts retain direct URLs and series links but do not enter the main blog list.
- `_pages/about.md` and `_news/` supply the existing introduction and news.
- `public/assets` is a relative symlink to the existing repository assets, so
  images, videos, and downloads are not duplicated in Git.
- `src/lib/content.ts` translates existing Liquid figure includes and selective
  figure galleries to static HTML. Selective galleries currently show all cards;
  the original gallery interaction is not ported.
- Markdown, equations (KaTeX), bibliographies, and article text render at build
  time. Canonical URLs, Open Graph tags, structured data, robots.txt, and a sitemap
  are generated. Search indexing and AI citations are not guaranteed by this.
- Only `/blog/contact-response/` hydrates React, with `client:visible`. Its initial
  chart, output, explanation, and table are present in HTML without JavaScript.
  It is an illustrative linear spring model, not measured research data.
- New interactive posts can be authored as MDX under `src/pages/blog/`, using
  `src/layouts/Article.astro` and importing React components as needed.

## Prototype scope and remaining migration work

The first build has 61 HTML pages, including About, Publications, Projects, Blog,
the existing published article routes, and one MDX demo. The live domain remains
on Jekyll until an explicit production switch.

Before a production switch, port and verify any legacy archive/tag/year URLs,
RSS, the standalone News archive, coauthor profile links, syntax highlighting,
and site-specific article widgets that should be retained. Add the `CNAME` and
GitHub Pages deployment configuration for the Astro output at that point.

Two old project sources reference images absent from the repository:
`assets/img/mec/4demo.gif` and `assets/img/whisker/fig12.png`. They remain source
issues to resolve rather than substituting unrelated figures.

The full legacy asset directory is copied into the static output, but only assets
referenced by a page are downloaded by its visitors. Asset pruning and image
optimization can be considered after the visual design is settled.
