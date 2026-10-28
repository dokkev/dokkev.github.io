/// <reference types="astro/client" />
declare module "@citation-js/core" {
  export class Cite {
    constructor(input: string);
    data: any[];
  }
  export const plugins: { input: { data(input: string, type: string): unknown } };
}
