/**
 * Estimates the complexity of a source file based on heuristics.
 * Looks at: cyclomatic indicators, nesting depth, line count, and token density.
 */
export function estimateComplexity(content: string, language: string): 'Low' | 'Medium' | 'High' {
  const lines = content.split('\n');
  const lineCount = lines.length;

  // Count control flow branching points
  const branchKeywords = /\b(if|else|for|while|do|switch|case|catch|finally|try|\?\?|&&|\|\|)\b/g;
  const branchMatches = (content.match(branchKeywords) ?? []).length;

  // Count function / method / class declarations
  const funcKeywords = /\b(function|=>\s*{|async\s+function|class |def |fn |func |sub |method )\b/g;
  const funcMatches = (content.match(funcKeywords) ?? []).length;

  // Measure nesting depth by counting indented blocks
  let maxIndent = 0;
  for (const line of lines) {
    const indent = line.search(/\S/);
    if (indent > maxIndent) maxIndent = indent;
  }
  const nestingDepth = Math.floor(maxIndent / 2);

  // Score
  const score =
    (lineCount > 300 ? 2 : lineCount > 100 ? 1 : 0) +
    (branchMatches > 30 ? 2 : branchMatches > 10 ? 1 : 0) +
    (funcMatches > 20 ? 2 : funcMatches > 5 ? 1 : 0) +
    (nestingDepth > 8 ? 2 : nestingDepth > 4 ? 1 : 0);

  if (score >= 5) return 'High';
  if (score >= 2) return 'Medium';
  return 'Low';
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  cs: 'csharp',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  md: 'markdown',
  mdx: 'markdown',
  vue: 'vue',
  svelte: 'svelte',
};

export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_LANG[ext] ?? 'text';
}

/** Max content length before a file is considered "large" and truncated */
const MAX_CONTENT_BYTES = 200_000;
const TRUNCATION_NOTICE =
  '\n\n[ctx-ray: File truncated — content exceeded 200 KB. Feed the full file separately if needed.]';

export function maybeeTruncate(content: string): { content: string; truncated: boolean } {
  if (Buffer.byteLength(content, 'utf-8') > MAX_CONTENT_BYTES) {
    const truncated = content.slice(0, MAX_CONTENT_BYTES) + TRUNCATION_NOTICE;
    return { content: truncated, truncated: true };
  }
  return { content, truncated: false };
}

/** Detect minified files: very long average line length */
export function isMinified(content: string): boolean {
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;
  const avgLen = content.length / lines.length;
  return avgLen > 500;
}
