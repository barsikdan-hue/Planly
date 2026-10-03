import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/') || (specifier.startsWith('.') && context.parentURL?.startsWith('file:'))) {
    const base = specifier.startsWith('@/')
      ? path.join(root, specifier.slice(2))
      : fileURLToPath(new URL(specifier, context.parentURL));
    for (const suffix of ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']) {
      const candidate = base + suffix;
      if ((await stat(candidate).catch(() => null))?.isFile()) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && /\.tsx?$/.test(url)) {
    const source = await readFile(new URL(url), 'utf8');
    const result = ts.transpileModule(source, {
      fileName: fileURLToPath(url), reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
    });
    const error = result.diagnostics?.find(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
    if (error) throw new SyntaxError(`${url}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
    return {
      format: 'module', shortCircuit: true,
      source: result.outputText,
    };
  }
  return nextLoad(url, context);
}
