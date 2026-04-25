import { execSync } from 'child_process';
import path from 'path';

/**
 * Returns a set of relative file paths that have changed since the given ref.
 * `since` can be a git ref, branch, or time expression like "1 hour ago".
 */
export function getChangedFiles(root: string, since: string): Set<string> {
  try {
    // Try as a time-based expression first: git diff --name-only @{1 hour ago}
    const refArg = since.includes(' ') ? `"@{${since}}"` : since;
    const output = execSync(`git diff --name-only ${refArg}`, {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const files = output
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
    return new Set(files);
  } catch {
    // Fall back to uncommitted changes vs HEAD
    try {
      const output = execSync('git diff --name-only HEAD', {
        cwd: root,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const files = output
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
      return new Set(files);
    } catch {
      return new Set();
    }
  }
}

/**
 * Returns relative paths of all files staged or unstaged vs HEAD.
 */
export function getDiffFiles(root: string): Set<string> {
  try {
    const staged = execSync('git diff --cached --name-only', {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const unstaged = execSync('git diff --name-only', {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const files = [...staged.split('\n'), ...unstaged.split('\n')]
      .map((f) => f.trim())
      .filter(Boolean);
    return new Set(files);
  } catch {
    return new Set();
  }
}

/**
 * Check whether the given directory is a git repository.
 */
export function isGitRepo(root: string): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the ISO date string of the last commit touching a file.
 */
export function getLastCommitDate(root: string, relativePath: string): string | null {
  try {
    const result = execSync(`git log -1 --format="%aI" -- "${relativePath}"`, {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}
