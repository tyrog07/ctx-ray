export interface CtxRayConfig {
  excludes: string[];
  defaultIgnores: string[];
  tokenLimit: number;
  outputDir: string;
  outputFile: string;
}

export interface FileEntry {
  path: string; // relative path from project root
  absolutePath: string;
  content: string;
  language: string;
  lastModified: string; // ISO date string
  sizeBytes: number;
  complexity: 'Low' | 'Medium' | 'High';
  isTruncated: boolean;
}

export interface ScanOptions {
  root: string;
  entryPoint?: string; // surgical mode entry file
  depth?: number; // max directory depth
  includes?: string[];
  extraIgnores?: string[];
  respectGitignore: boolean;
  respectAiignore: boolean;
  since?: string; // git --since filter
  diff?: boolean; // only changed files
}

export interface BundleOptions {
  files: FileEntry[];
  root: string;
  outputFormat: 'xml' | 'markdown';
  includeTree: boolean;
  includeMetadata: boolean;
  prompt?: string;
}

export interface TokenReport {
  totalTokens: number;
  limit: number;
  exceeded: boolean;
  largestFiles: Array<{ path: string; tokens: number }>;
}

export interface DirectoryNode {
  name: string;
  type: 'file' | 'directory';
  children?: DirectoryNode[];
  path: string;
}
