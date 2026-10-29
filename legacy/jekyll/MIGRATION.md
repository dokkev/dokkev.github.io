# Archived Jekyll implementation

The Astro app now lives at the repository root. This directory preserves the
original theme, plugins, Docker setup, theme documentation, and GitHub workflows
for reference. The original theme README is `README.md` in this directory.

Content is maintained once, outside this archive:

- `_posts` → `../../content/blog`
- `_projects` → `../../content/projects`
- `_news` → `../../content/news`
- `_bibliography` → `../../content/publications`
- `_pages/about.md` → `../../../content/about.md`
- `assets` → `../../public/assets`
- `CNAME` → `../../public/CNAME`

Archived workflows in `.github/workflows/` do not run from this location. Their
paths reflect the original root layout and require adaptation if reused.
Likewise the old devcontainer and Docker tooling are retained as historical
configuration; they have not been validated from the relocated directory.

The live Jekyll site is still built from the unchanged `main` branch. Nothing in
this archive is required for `pnpm dev`, `pnpm check`, or `pnpm build`.
