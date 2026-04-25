import type { FileEntry, TokenReport } from '../types.js';

/**
 * Approximate token count using the simple rule-of-thumb:
 * ~4 characters per token (works well for code/English).
 *
 * We avoid pulling the full tiktoken WASM bundle as a hard dependency
 * since it requires native binaries that can break on some platforms.
 * Users who want exact GPT-4 token counts can set `exact: true` and
 * we'll dynamically import tiktoken if it resolves.
 */
function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function exactTokens(text: string): Promise<number | null> {
  try {
    // Dynamic import — gracefully degrades if tiktoken is not installed
    const { encoding_for_model } = await import('tiktoken');
    const enc = encoding_for_model('gpt-4');
    const tokens = enc.encode(text).length;
    enc.free();
    return tokens;
  } catch {
    return null;
  }
}

export async function countTokens(text: string, exact = false): Promise<number> {
  if (exact) {
    const count = await exactTokens(text);
    if (count !== null) return count;
  }
  return approximateTokens(text);
}

export async function buildTokenReport(
  files: FileEntry[],
  limit: number,
  exact = false,
): Promise<TokenReport> {
  const perFile: Array<{ path: string; tokens: number }> = [];

  for (const file of files) {
    const tokens = await countTokens(file.content, exact);
    perFile.push({ path: file.path, tokens });
  }

  const totalTokens = perFile.reduce((sum, f) => sum + f.tokens, 0);

  // Sort descending by token count for the warning report
  const largestFiles = [...perFile].sort((a, b) => b.tokens - a.tokens).slice(0, 10);

  return {
    totalTokens,
    limit,
    exceeded: totalTokens > limit,
    largestFiles,
  };
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
