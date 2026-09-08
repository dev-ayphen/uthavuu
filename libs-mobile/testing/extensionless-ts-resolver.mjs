import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Teaches Node's ESM loader the extensionless relative imports this workspace
 * is written with.
 *
 * WHY IT IS NEEDED. `libs-mobile` is bundler-resolved everywhere it actually
 * runs — Metro for the app, `moduleResolution: "bundler"` for tsc — so
 * `import './categories'` is the house style in every file here. Node's own ESM
 * resolver is spec-strict and requires the extension, so a `node --test` run
 * fails on the first hop and then on every transitive one after it.
 *
 * The alternative was to append `.ts` to the imports in the source files. That
 * cascades — `category-state` -> `categories` -> `theme/tokens` -> ... — and it
 * would mean changing what the SHIPPING app imports in order to satisfy a test
 * runner, which is the tail wagging the dog. A resolver hook keeps the change
 * entirely inside the test path: no source file knows this exists.
 *
 * Deliberately narrow. It only rewrites RELATIVE specifiers that have no
 * extension and for which a `.ts` file exists on disk; everything else —
 * packages, `node:` builtins, anything already extensioned — is handed straight
 * to the default resolver. So it cannot mask a genuinely missing module.
 */
export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);

  if (isRelative && !hasExtension && context.parentURL?.startsWith('file:')) {
    const parentDir = dirname(fileURLToPath(context.parentURL));

    for (const extension of ['.ts', '.tsx']) {
      const candidate = resolvePath(parentDir, `${specifier}${extension}`);
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }

  return nextResolve(specifier, context);
}
