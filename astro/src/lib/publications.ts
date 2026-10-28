import fs from "node:fs";
import path from "node:path";
import { Cite, plugins } from "@citation-js/core";
import "@citation-js/plugin-bibtex";

const source = fs.readFileSync(path.resolve("../_bibliography/papers.bib"), "utf8").replace(/^---\s*\n---/, "");
const originals = plugins.input.data(source, "@bibtex/text") as { label: string; properties: Record<string, string> }[];
const entries = new Cite(source).data;
export const publications = entries.map((entry: any) => ({
  ...entry,
  custom: originals.find((raw) => raw.label === entry.id)?.properties || {},
}));
