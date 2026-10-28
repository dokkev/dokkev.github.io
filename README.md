# Dong Ho Kang — portfolio

An Astro portfolio with static research pages and React islands for interactive
blog demos. The Astro migration is being developed on `codex/astro-portfolio`.
The live site still uses the Jekyll version on `main`.

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
  pages/                  Routes and the interactive MDX example
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
  CNAME                   Custom domain for a future production switch
scripts/                  Research figure generation tools
docs/                     Migration status and known limitations
legacy/jekyll/            Archived Jekyll theme, tooling, and documentation
.github/workflows/        Astro build check; no production deployment
```

## Editing content

- Add or update publications in `content/publications/papers.bib`. Preview images
  live in `public/assets/img/publication_preview/`.
- Edit blog articles in `content/blog/` and project entries in `content/projects/`.
  Existing frontmatter permalinks keep their public URLs after files move.
- Use `/assets/...` in web links and images; the `public/` directory is not part
  of a public URL.
- Add interactive MDX posts under `src/pages/blog/`. The working example is
  `src/pages/blog/contact-response.mdx`, with a React island in
  `src/components/ContactDemo.tsx`.
- Keep essential explanations, equations, and representative results in HTML.
  JavaScript adds interaction to the article.

See [migration status](docs/astro-migration.md) for remaining work before a
production switch. Archived Jekyll files are retained for reference and share
content/assets through relative symlinks; they are not included in Astro output.
