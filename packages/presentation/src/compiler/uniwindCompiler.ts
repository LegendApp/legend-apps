import path from "node:path";
import { pathToFileURL } from "node:url";

export type UniwindCompileVirtual = (options: {
  css: string;
  cssPath: string;
  debug: boolean;
  platform: string;
  polyfills: undefined;
  themes: string[];
}) => Promise<string>;

/** Source checkouts load uniwind's TypeScript entry; the shipped bundle replaces this module with a static import. */
export async function loadUniwindCompiler(): Promise<UniwindCompileVirtual> {
  const compilerModulePath = path.resolve(import.meta.dirname, "../../../../shell/node_modules/uniwind/src/metro/compileVirtual.ts");
  return (await import(pathToFileURL(compilerModulePath).href)).compileVirtual;
}
