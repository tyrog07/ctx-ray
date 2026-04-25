import fs from 'fs';
import path from 'path';
import ignore, { type Ignore } from 'ignore';

/**
 * Loads patterns from a file (e.g. .gitignore or .aiignore).
 * Returns an `ignore` instance ready to `.ignores()` paths.
 */
export function loadIgnoreFile(filePath: string): Ignore | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  return ignore().add(content);
}

/**
 * Build a composite ignore filter from:
 *  1. Built-in smart defaults (passed in)
 *  2. .gitignore in root
 *  3. .aiignore in root
 *  4. Any extra patterns passed at call time
 */
export function buildIgnoreFilter(
  root: string,
  defaultPatterns: string[],
  extraPatterns: string[] = [],
  respectGitignore = true,
  respectAiignore = true,
): (relativePath: string) => boolean {
  const ig = ignore().add(defaultPatterns).add(extraPatterns);

  if (respectGitignore) {
    const gi = loadIgnoreFile(path.join(root, '.gitignore'));
    if (gi) ig.add(fs.readFileSync(path.join(root, '.gitignore'), 'utf-8'));
  }

  if (respectAiignore) {
    const ai = loadIgnoreFile(path.join(root, '.aiignore'));
    if (ai) ig.add(fs.readFileSync(path.join(root, '.aiignore'), 'utf-8'));
  }

  return (relativePath: string) => {
    // `ignore` expects forward-slash paths without leading slash
    const normalised = relativePath.replace(/\\/g, '/').replace(/^\//, '');
    return ig.ignores(normalised);
  };
}

/**
 * Creates a .aiignore template in the project root if one doesn't exist.
 */
export function initAiIgnore(root: string): boolean {
  const aiIgnorePath = path.join(root, '.aiignore');
  if (fs.existsSync(aiIgnorePath)) return false;

  const template = `# .aiignore — ctx-ray smart filter
# Files here are excluded from AI context bundles but NOT from Git.

# Large generated files
package-lock.json
yarn.lock
pnpm-lock.yaml

# Binary assets
*.png
*.jpg
*.jpeg
*.gif
*.svg
*.ico
*.pdf
*.zip
*.wasm

# Build outputs
dist/
build/
.next/
out/

# Test snapshots & coverage
coverage/
**/__snapshots__/

# Minified bundles
*.min.js
*.min.css
*.map
`;

  fs.writeFileSync(aiIgnorePath, template, 'utf-8');
  return true;
}
