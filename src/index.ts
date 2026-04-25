export { scanFiles } from './core/scanner.js';
export { traceImports } from './core/analyzer.js';
export { buildXmlBundle, writeBundle, appendToBundle } from './core/bundler.js';
export { buildTokenReport, countTokens, formatTokenCount } from './core/tokenizer.js';
export { buildIgnoreFilter, initAiIgnore } from './utils/ignore.js';
export { loadConfig, saveConfig, ensureOutputDir, addToGitignore } from './utils/config.js';
export { buildTree, renderTree } from './utils/tree.js';
export { estimateComplexity, detectLanguage } from './utils/complexity.js';
export { isGitRepo, getDiffFiles, getChangedFiles } from './utils/git.js';
export type {
  CtxRayConfig,
  FileEntry,
  ScanOptions,
  BundleOptions,
  TokenReport,
  DirectoryNode,
} from './types.js';
