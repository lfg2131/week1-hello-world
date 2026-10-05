import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

// Executes real app/lib TypeScript source in a sandbox. Project modules
// (relative or "@/..." imports) load for real and recursively; anything listed
// in `stubs` (framework, Supabase, network) is replaced by a test double.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function resolveFile(specifier, from) {
  const base = specifier.startsWith("@/") ? resolve(root, specifier.slice(2)) : resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    if (existsSync(candidate) && candidate.match(/\.tsx?$/)) return candidate;
  }
  throw new Error(`Cannot resolve ${specifier} from ${from}`);
}

export function loadModule(file, stubs = {}, globals = {}) {
  const cache = new Map();
  const load = (path) => {
    if (cache.has(path)) return cache.get(path).exports;
    const mod = { exports: {} };
    cache.set(path, mod);
    const output = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const require = (specifier) => {
      if (Object.hasOwn(stubs, specifier)) return stubs[specifier];
      if (specifier.startsWith(".") || specifier.startsWith("@/")) return load(resolveFile(specifier, path));
      throw new Error(`Unexpected import in ${path}: ${specifier}`);
    };
    vm.runInNewContext(output, {
      module: mod, exports: mod.exports, require,
      Response, Request, URL, Date, FormData, Blob, Buffer, AbortSignal, Intl, TextEncoder, crypto, console, setTimeout, clearTimeout,
      fetch: globals.fetch ?? (() => { throw new Error("Network disabled in tests"); }),
      process: { env: { ...(globals.env ?? {}) } },
      ...globals,
    });
    return mod.exports;
  };
  return load(resolve(root, file));
}
