import fs from 'fs';
import path from 'path';
import type { CtxRayConfig } from '../types.js';

const CONFIG_FILE = '.ctx-ray.json';

const DEFAULT_CONFIG: CtxRayConfig = {
  excludes: [],
  defaultIgnores: [
    // Lock files
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lockb',
    // Build artifacts
    'dist/**',
    'build/**',
    '.next/**',
    '.nuxt/**',
    'out/**',
    // Dependencies
    'node_modules/**',
    // Binary / media assets
    '**/*.png',
    '**/*.jpg',
    '**/*.jpeg',
    '**/*.gif',
    '**/*.svg',
    '**/*.ico',
    '**/*.webp',
    '**/*.mp4',
    '**/*.mp3',
    '**/*.pdf',
    '**/*.zip',
    '**/*.tar',
    '**/*.gz',
    '**/*.exe',
    '**/*.wasm',
    '**/*.ttf',
    '**/*.woff',
    '**/*.woff2',
    // Generated / noise
    '**/*.min.js',
    '**/*.min.css',
    '**/*.map',
    '.git/**',
    '.ctx/**',
    'coverage/**',
    '**/__snapshots__/**',
  ],
  tokenLimit: 50000,
  outputDir: '.ctx',
  outputFile: 'ai-context.xml',
};

export function loadConfig(root: string): CtxRayConfig {
  const configPath = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CtxRayConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      defaultIgnores: [...DEFAULT_CONFIG.defaultIgnores, ...(parsed.excludes ?? [])],
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(root: string, config: Partial<CtxRayConfig>): void {
  const configPath = path.join(root, CONFIG_FILE);
  const existing = loadConfig(root);
  const merged = { ...existing, ...config };
  // Don't persist defaultIgnores — those are built-in
  const { defaultIgnores: _d, ...persistable } = merged;
  fs.writeFileSync(configPath, JSON.stringify(persistable, null, 2) + '\n', 'utf-8');
}

export function ensureOutputDir(root: string, config: CtxRayConfig): string {
  const dir = path.join(root, config.outputDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function addToGitignore(root: string, patterns: string[]): void {
  const gitignorePath = path.join(root, '.gitignore');
  const content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';

  const toAdd = patterns.filter((p) => !content.includes(p));
  if (toAdd.length === 0) return;

  const section = `\n# ctx-ray generated context files\n${toAdd.join('\n')}\n`;
  fs.writeFileSync(gitignorePath, content + section, 'utf-8');
}
