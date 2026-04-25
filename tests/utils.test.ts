import { describe, it, expect } from 'vitest';
import { buildTree, renderTree } from '../src/utils/tree.js';
import { estimateComplexity, detectLanguage, isMinified } from '../src/utils/complexity.js';

describe('buildTree + renderTree', () => {
  it('renders a simple flat tree', () => {
    const tree = buildTree(['src/index.ts', 'src/utils/config.ts'], 'project');
    const rendered = renderTree(tree);
    expect(rendered).toContain('project/');
    expect(rendered).toContain('src/');
    expect(rendered).toContain('index.ts');
    expect(rendered).toContain('config.ts');
  });

  it('sorts directories before files', () => {
    const tree = buildTree(['a.ts', 'utils/b.ts'], 'root');
    const rendered = renderTree(tree);
    const utilsIdx = rendered.indexOf('utils/');
    const aIdx = rendered.indexOf('a.ts');
    expect(utilsIdx).toBeLessThan(aIdx);
  });
});

describe('estimateComplexity', () => {
  it('rates a trivial file as Low', () => {
    const code = 'export const x = 1;\nexport const y = 2;\n';
    expect(estimateComplexity(code, 'typescript')).toBe('Low');
  });

  it('rates a file with many branches as Medium or High', () => {
    // 50 if/else pairs = 100 lines, 100 branch keywords → guaranteed Medium/High
    const branches = Array.from(
      { length: 50 },
      (_, i) => `if (x > ${i}) {\n  return ${i};\n} else {\n  continue;\n}`,
    ).join('\n');
    const result = estimateComplexity(branches, 'typescript');
    expect(result).toSatisfy((r: string) => ['Medium', 'High'].includes(r));
  });
});

describe('detectLanguage', () => {
  it('detects TypeScript', () => expect(detectLanguage('foo.ts')).toBe('typescript'));
  it('detects Python', () => expect(detectLanguage('main.py')).toBe('python'));
  it('detects Rust', () => expect(detectLanguage('lib.rs')).toBe('rust'));
  it('falls back to text for unknown', () => expect(detectLanguage('foo.xyz')).toBe('text'));
});

describe('isMinified', () => {
  it('returns false for normal code', () => {
    const code = 'const x = 1;\nconst y = 2;\nconst z = x + y;\n';
    expect(isMinified(code)).toBe(false);
  });

  it('returns true for a very long single line', () => {
    const longLine = 'a'.repeat(2000);
    expect(isMinified(longLine)).toBe(true);
  });
});
