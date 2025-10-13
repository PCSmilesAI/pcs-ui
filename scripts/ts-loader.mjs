import { readFile } from 'fs/promises';
import path from 'path';
import ts from 'typescript';

const TS_EXTENSIONS = new Set(['.ts', '.tsx']);

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    if (specifier.startsWith('.') && !path.extname(specifier)) {
      const withTs = `${specifier}.ts`;
      return defaultResolve(withTs, context, defaultResolve);
    }
    throw error;
  }
}

export async function load(url, context, defaultLoad) {
  const parsedUrl = new URL(url);
  const ext = path.extname(parsedUrl.pathname);

  if (TS_EXTENSIONS.has(ext)) {
    const source = await readFile(parsedUrl, 'utf8');
    const output = ts.transpileModule(source, {
      fileName: parsedUrl.pathname,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2019,
        jsx: ts.JsxEmit.Preserve,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        resolveJsonModule: true,
      },
    });

    return {
      format: 'module',
      source: output.outputText,
      shortCircuit: true,
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
