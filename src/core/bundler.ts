import path from 'path';
import fs from 'fs';
import { create } from 'xmlbuilder2';
import { buildTree, renderTree } from '../utils/tree.js';
import type { BundleOptions, FileEntry } from '../types.js';

/**
 * Strip null bytes and other non-XML control characters from content.
 * XML 1.0 only allows: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD]
 */
function sanitiseForXml(content: string): string {
  // Remove null bytes and C0/C1 control chars except tab, LF, CR
  // eslint-disable-next-line no-control-regex
  return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Generate the full XML bundle as a string using xmlbuilder2.
 * Content is written via .txt() — xmlbuilder2 handles XML escaping internally.
 */
export function buildXmlBundle(options: BundleOptions): string {
  const { files, root, includeTree, includeMetadata } = options;

  const rootName = path.basename(root);
  const generatedAt = new Date().toISOString();

  const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('repository', {
    name: rootName,
    generated: generatedAt,
    fileCount: files.length,
  });

  // ── Directory Blueprint ────────────────────────────────────────────────────
  if (includeTree) {
    const relativePaths = files.map((f) => f.path);
    const tree = buildTree(relativePaths, rootName);
    const treeText = renderTree(tree);
    doc.ele('directory_blueprint').txt(treeText).up();
  }

  // ── File Blocks ────────────────────────────────────────────────────────────
  const filesEle = doc.ele('files');

  for (const file of files) {
    const fileEle = filesEle.ele('file', { path: file.path });

    if (includeMetadata) {
      fileEle
        .ele('metadata')
        .ele('language')
        .txt(file.language)
        .up()
        .ele('last_modified')
        .txt(file.lastModified)
        .up()
        .ele('size_bytes')
        .txt(String(file.sizeBytes))
        .up()
        .ele('complexity')
        .txt(file.complexity)
        .up()
        .ele('truncated')
        .txt(String(file.isTruncated))
        .up()
        .up();
    }

    // Sanitise then let xmlbuilder2 escape via .txt()
    const safeContent = sanitiseForXml(file.content);
    fileEle.ele('content').txt(safeContent).up();

    fileEle.up();
  }

  filesEle.up();

  return doc.end({ prettyPrint: true });
}

/**
 * Write the XML bundle to disk, creating the output directory if needed.
 * Returns the final output path.
 */
export function writeBundle(xmlContent: string, outputDir: string, outputFile: string): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, outputFile);
  fs.writeFileSync(outputPath, xmlContent, 'utf-8');
  return outputPath;
}

/**
 * Append additional file blocks to an existing XML bundle.
 * Used by the --append flag to add changed files to a prior context.
 */
export function appendToBundle(existingPath: string, newFiles: FileEntry[]): string {
  if (!fs.existsSync(existingPath)) {
    throw new Error(`Bundle not found for append: ${existingPath}`);
  }

  const existingContent = fs.readFileSync(existingPath, 'utf-8');

  const xmlEscape = (s: string) =>
    s.replace(
      /[<>&"']/g,
      (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[m] ?? m,
    );

  // Build just the new file blocks using safe escaped strings
  const newBlocks = newFiles
    .map((file) => {
      const safeContent = xmlEscape(sanitiseForXml(file.content));
      const safePath = xmlEscape(file.path);

      return `  <file path="${safePath}">
    <metadata>
      <language>${file.language}</language>
      <last_modified>${file.lastModified}</last_modified>
      <size_bytes>${file.sizeBytes}</size_bytes>
      <complexity>${file.complexity}</complexity>
      <truncated>${file.isTruncated}</truncated>
    </metadata>
    <content>${safeContent}</content>
  </file>`;
    })
    .join('\n');

  // Splice the new blocks before the closing </files> tag
  const updatedContent = existingContent.replace('</files>', `${newBlocks}\n</files>`);

  fs.writeFileSync(existingPath, updatedContent, 'utf-8');
  return existingPath;
}
