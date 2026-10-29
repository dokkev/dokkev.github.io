# Astro portfolio deployment

The Astro app runs from the repository root. The `Astro build and deploy`
workflow checks `main`, `codex/astro-portfolio`, and relevant pull requests.
Pushes to `main` and manual runs on `main` build `dist/` and deploy it through
GitHub Pages Actions to https://www.dongho.dev. Other branches only run checks.

The Pages publishing source is GitHub Actions. The custom domain remains in
`public/CNAME`. The previous Jekyll source and workflows are archived under
`legacy/jekyll/`; they do not run as active workflows.

## Run locally

Use Node.js 24 and pnpm 11.25.0:

```sh
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

- `content/publications/papers.bib` remains the publication source, including custom
  preview, contribution, selected, PDF, and website fields.
- `content/blog/` and `content/projects/` remain the article sources. Published articles keep
  their frontmatter permalinks. Drafts and template files are excluded. Hidden
  posts retain direct URLs and series links but do not enter the main blog list.
- `content/about.md` and `content/news/` supply the existing introduction and news.
- `public/assets/` holds the original images, videos, and downloads. Public URLs
  remain `/assets/...`. The archived Jekyll tree links to this directory.
- `src/lib/content.ts` translates existing Liquid figure includes and selective
  figure galleries to static HTML. Selective galleries currently show all cards;
  the original gallery interaction is not ported.
- Markdown, equations (KaTeX), bibliographies, and article text render at build
  time. Canonical URLs, Open Graph tags, structured data, robots.txt, and a sitemap
  are generated. Search indexing and AI citations are not guaranteed by this.
- React islands use `client:visible` on `/can01/`, `/can05/`, and `/can06/`.
  Their initial charts, outputs, explanations, and tables are present in HTML
  without JavaScript. These are teaching models, not measured research data.
- Interactive series posts can be authored as MDX in `content/blog/`, preserving
  their frontmatter permalinks and series navigation. CAN 01 imports four React
  demos from `src/components/demos/` and hydrates them with `client:visible`.
  CAN 06 runs a deterministic queue and timeout model with animated playback,
  scrubbing, and I/O policy controls. It does not model physical bus arbitration
  or actuator dynamics.
  Route-specific examples can also live under `src/pages/blog/`.
- Optional series sub-posts declare `parent` with the parent article URL. They
  appear beneath that article in series navigation and link back to it in their
  header. CAN 02A lives at `/can02/pcan/`; `/can05/` now holds the
  renumbered command-packing article. The I/O scheduling article is `/can06/`,
  with `/can07/` redirecting there. Sub-posts
  are reached through their parent or series navigation rather than the latest
  articles list.

## Content scope and known limitations

The current build has 60 HTML pages, including About, Publications, Projects, Blog,
and the existing published article routes.

Legacy archive/tag/year URLs, RSS, the standalone News archive, coauthor
profile links, and site-specific article widgets have not all been ported or
verified. Syntax highlighting uses GitHub Light.

Two old project sources reference images absent from the repository:
`assets/img/mec/4demo.gif` and `assets/img/whisker/fig12.png`. They remain source
issues to resolve rather than substituting unrelated figures.

The full legacy asset directory is copied into the static output, but only assets
referenced by a page are downloaded by its visitors. Asset pruning and image
optimization can be considered after the visual design is settled.
