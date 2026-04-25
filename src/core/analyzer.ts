import fs from 'fs';
import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { estimateComplexity, detectLanguage, maybeeTruncate } from '../utils/complexity.js';
import { getLastCommitDate, isGitRepo } from '../utils/git.js';
import type { FileEntry } from '../types.js';

/**
 * Surgical mode — traces the import graph from an entry point and
 * collects only the files that are actually depended upon.
 *
 * Supports TypeScript/JavaScript import tracing via ts-morph AST.
 * Falls back to regex-based extraction for non-TS files.
 */
export async function traceImports(
  entryPoint: string,
  root: string,
  maxDepth = 5,
): Promise<FileEntry[]> {
  const absEntry = path.resolve(root, entryPoint);

  if (!fs.existsSync(absEntry)) {
    throw new Error(`Entry point not found: ${absEntry}`);
  }

  const ext = absEntry.split('.').pop()?.toLowerCase() ?? '';
  const isTs = ['ts', 'tsx'].includes(ext);
  const isJs = ['js', 'jsx', 'mjs', 'cjs'].includes(ext);

  if (isTs || isJs) {
    return traceWithTsMorph(absEntry, root, maxDepth);
  }

  // Fallback for other languages — regex-based relative import extraction
  return traceWithRegex(absEntry, root, maxDepth);
}

async function traceWithTsMorph(
  absEntry: string,
  root: string,
  maxDepth: number,
): Promise<FileEntry[]> {
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      resolveJsonModule: true,
    },
    skipAddingFilesFromTsConfig: true,
  });

  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = [{ file: absEntry, depth: 0 }];
  const results: FileEntry[] = [];
  const gitAvailable = isGitRepo(root);

  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);

    if (!fs.existsSync(file)) continue;

    let rawContent: string;
    try {
      rawContent = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const { content, truncated } = maybeeTruncate(rawContent);
    const relPath = path.relative(root, file).replace(/\\/g, '/');
    const language = detectLanguage(relPath);
    const complexity = estimateComplexity(content, language);
    const stat = fs.statSync(file);
    const gitDate = gitAvailable ? getLastCommitDate(root, relPath) : null;
    const lastModified = gitDate ?? stat.mtime.toISOString().split('T')[0];

    results.push({
      path: relPath,
      absolutePath: file,
      content,
      language,
      lastModified,
      sizeBytes: stat.size,
      complexity,
      isTruncated: truncated,
    });

    if (depth >= maxDepth) continue;

    // Parse imports with ts-morph
    const sourceFile = project.addSourceFileAtPath(file);

    // Static imports: import ... from '...'
    const importDecls = sourceFile.getImportDeclarations();
    for (const decl of importDecls) {
      const specifier = decl.getModuleSpecifierValue();
      if (!isLocalImport(specifier)) continue;
      const resolved = resolveImportPath(file, specifier);
      if (resolved) queue.push({ file: resolved, depth: depth + 1 });
    }

    // Dynamic imports: import('...')
    const callExprs = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of callExprs) {
      if (call.getExpression().getText() !== 'import') continue;
      const arg = call.getArguments()[0];
      if (!arg) continue;
      const specifier = arg.getText().replace(/['"`]/g, '');
      if (!isLocalImport(specifier)) continue;
      const resolved = resolveImportPath(file, specifier);
      if (resolved) queue.push({ file: resolved, depth: depth + 1 });
    }

    // require('...')
    const requires = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of requires) {
      if (call.getExpression().getText() !== 'require') continue;
      const arg = call.getArguments()[0];
      if (!arg) continue;
      const specifier = arg.getText().replace(/['"`]/g, '');
      if (!isLocalImport(specifier)) continue;
      const resolved = resolveImportPath(file, specifier);
      if (resolved) queue.push({ file: resolved, depth: depth + 1 });
    }
  }

  return results;
}

async function traceWithRegex(
  absEntry: string,
  root: string,
  maxDepth: number,
): Promise<FileEntry[]> {
  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = [{ file: absEntry, depth: 0 }];
  const results: FileEntry[] = [];
  const gitAvailable = isGitRepo(root);

  // Matches: import/require/from with single or double quoted relative paths
  const IMPORT_RE = /(?:import|require|from)\s*['"`](\.\.?\/[^'"`]+)['"`]/g;

  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);

    if (!fs.existsSync(file)) continue;

    let rawContent: string;
    try {
      rawContent = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const { content, truncated } = maybeeTruncate(rawContent);
    const relPath = path.relative(root, file).replace(/\\/g, '/');
    const language = detectLanguage(relPath);
    const complexity = estimateComplexity(content, language);
    const stat = fs.statSync(file);
    const gitDate = gitAvailable ? getLastCommitDate(root, relPath) : null;
    const lastModified = gitDate ?? stat.mtime.toISOString().split('T')[0];

    results.push({
      path: relPath,
      absolutePath: file,
      content,
      language,
      lastModified,
      sizeBytes: stat.size,
      complexity,
      isTruncated: truncated,
    });

    if (depth >= maxDepth) continue;

    let match: RegExpExecArray | null;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(rawContent)) !== null) {
      const specifier = match[1];
      const resolved = resolveImportPath(file, specifier);
      if (resolved) queue.push({ file: resolved, depth: depth + 1 });
    }
  }

  return results;
}

function isLocalImport(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

const EXTENSIONS_TO_TRY = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '/index.ts',
  '/index.js',
];

function resolveImportPath(fromFile: string, specifier: string): string | null {
  const dir = path.dirname(fromFile);
  const base = path.resolve(dir, specifier);

  for (const ext of EXTENSIONS_TO_TRY) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}
