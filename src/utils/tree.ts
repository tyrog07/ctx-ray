import type { DirectoryNode } from '../types.js';

/**
 * Render a directory tree as an ASCII string — similar to the `tree` command.
 *
 * Example output:
 * src/
 * ├── cli.ts
 * ├── core/
 * │   ├── scanner.ts
 * │   └── bundler.ts
 * └── utils/
 *     └── config.ts
 */
export function renderTree(node: DirectoryNode, prefix = '', isLast = true): string {
  const connector = isLast ? '└── ' : '├── ';
  const childPrefix = isLast ? '    ' : '│   ';

  let result = '';
  if (prefix === '' && node.type === 'directory') {
    // Root node — no connector
    result += `${node.name}/\n`;
  } else {
    result += `${prefix}${connector}${node.name}${node.type === 'directory' ? '/' : ''}\n`;
  }

  if (node.children && node.children.length > 0) {
    const sorted = [...node.children].sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    sorted.forEach((child, i) => {
      const last = i === sorted.length - 1;
      const newPrefix = prefix === '' ? childPrefix : prefix + childPrefix;
      result += renderTree(child, newPrefix, last);
    });
  }

  return result;
}

/**
 * Build a DirectoryNode tree from a list of relative file paths.
 */
export function buildTree(relativePaths: string[], rootName: string): DirectoryNode {
  const root: DirectoryNode = {
    name: rootName,
    type: 'directory',
    path: '',
    children: [],
  };

  for (const filePath of relativePaths) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const existingChild = current.children?.find((c) => c.name === part);

      if (existingChild) {
        current = existingChild;
      } else {
        const newNode: DirectoryNode = {
          name: part,
          type: isFile ? 'file' : 'directory',
          path: parts.slice(0, i + 1).join('/'),
          children: isFile ? undefined : [],
        };
        current.children = current.children ?? [];
        current.children.push(newNode);
        current = newNode;
      }
    }
  }

  return root;
}
