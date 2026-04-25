import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { buildIgnoreFilter } from '../utils/ignore.js';
import {
  estimateComplexity,
  detectLanguage,
  maybeeTruncate,
  isMinified,
} from '../utils/complexity.js';
import { getChangedFiles, getDiffFiles, getLastCommitDate, isGitRepo } from '../utils/git.js';
import type { FileEntry, ScanOptions } from '../types.js';

/**
 * Full-project scanner.
 * Walks the file system, respects ignore rules, and returns enriched FileEntry objects.
 */
export async function scanFiles(options: ScanOptions): Promise<FileEntry[]> {
  const {
    root,
    depth,
    extraIgnores = [],
    respectGitignore,
    respectAiignore,
    since,
    diff,
  } = options;

  // Load config for default ignores
  const { loadConfig } = await import('../utils/config.js');
  const config = loadConfig(root);

  const shouldIgnore = buildIgnoreFilter(
    root,
    config.defaultIgnores,
    [...config.excludes, ...extraIgnores],
    respectGitignore,
    respectAiignore,
  );

  // Resolve which changed files matter (for --diff / --since)
  const gitAvailable = isGitRepo(root);
  let changedSet: Set<string> | null = null;
  if (diff && gitAvailable) {
    changedSet = getDiffFiles(root);
  } else if (since && gitAvailable) {
    changedSet = getChangedFiles(root, since);
  }

  // Glob for all files
  const globPattern = depth ? `**/${'*/'.repeat(depth - 1)}*` : '**/*';

  const rawFiles = await fg(globPattern, {
    cwd: root,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    deep: depth,
  });

  const entries: FileEntry[] = [];

  for (const relPath of rawFiles) {
    // Apply ignore filter
    if (shouldIgnore(relPath)) continue;

    // Apply diff/since filter
    if (changedSet !== null && !changedSet.has(relPath)) continue;

    const absolutePath = path.join(root, relPath);

    let rawContent: string;
    try {
      rawContent = fs.readFileSync(absolutePath, 'utf-8');
    } catch {
      continue; // Binary or unreadable — skip
    }

    // Skip minified files unless explicitly included
    if (isMinified(rawContent)) continue;

    const { content, truncated } = maybeeTruncate(rawContent);
    const stat = fs.statSync(absolutePath);
    const language = detectLanguage(relPath);
    const complexity = estimateComplexity(content, language);

    // Try to get last modified date from git, fall back to fs mtime
    const gitDate = gitAvailable ? getLastCommitDate(root, relPath) : null;
    const lastModified = gitDate ?? stat.mtime.toISOString().split('T')[0];

    entries.push({
      path: relPath.replace(/\\/g, '/'),
      absolutePath,
      content,
      language,
      lastModified,
      sizeBytes: stat.size,
      complexity,
      isTruncated: truncated,
    });
  }

  return entries;
}
