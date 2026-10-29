# Dong Ho Kang — portfolio

An Astro portfolio with static research pages and React islands for interactive
blog demos. GitHub Pages deploys the Astro build from `main` to
https://www.dongho.dev.

## Local development

Use Node.js 24 and pnpm 11.25.0. Run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the address printed by Astro, normally http://127.0.0.1:4321.
Changes to source files are reflected in the development server.

```sh
pnpm check       # Astro / TypeScript diagnostics
pnpm build       # Static site in dist/
pnpm preview     # Serve the built site
```

## Directory layout

```text
src/
  pages/                  Page routes
  layouts/                Shared page and article layouts
  components/             Publication cards and React demos
  lib/                    Content loading and Markdown / BibTeX conversion
  styles/                 Site styling
content/
  about.md                Introduction
  publications/papers.bib Publication records and preview filenames
  blog/                   Existing blog articles and translations
  projects/               Project records and article bodies
  news/                   News entries
public/
  assets/                 Images, videos, PDFs, and existing static files
  CNAME                   Custom domain for GitHub Pages
scripts/                  Research figure generation tools
docs/                     Migration status and known limitations
legacy/jekyll/            Archived Jekyll theme, tooling, and documentation
.github/workflows/        Astro checks and GitHub Pages deployment
```

## Editing content

- Add or update publications in `content/publications/papers.bib`. Preview images
  live in `public/assets/img/publication_preview/`.
- Edit blog articles in `content/blog/` and project entries in `content/projects/`.
  Existing frontmatter permalinks keep their public URLs after files move.
- Use `/assets/...` in web links and images; the `public/` directory is not part
  of a public URL.
- Add interactive series articles as `.mdx` files in `content/blog/`, with the
  same frontmatter and permalink as Markdown articles. Import React demos from
  `src/components/demos/` and activate them with `client:visible`. CAN 01 is the
  first example. Omit the old Jekyll `layout: distill` field in MDX; the article
  route supplies its layout. Route-specific MDX pages can also live under
  `src/pages/blog/`.
- Keep essential explanations, equations, and representative results in HTML.
  JavaScript adds interaction to the article.

All blog posts, project descriptions, documentation, and website copy follow the
[shared writing style guide](docs/writing/style-guide.md).

See [migration notes](docs/astro-migration.md) for deployment details and known
limitations. Archived Jekyll files are retained for reference and share
content/assets through relative symlinks; they are not included in Astro output.
