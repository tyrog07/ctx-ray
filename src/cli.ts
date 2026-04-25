#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import { scanFiles } from './core/scanner.js';
import { traceImports } from './core/analyzer.js';
import { buildXmlBundle, writeBundle, appendToBundle } from './core/bundler.js';
import { buildTokenReport, formatTokenCount } from './core/tokenizer.js';
import { loadConfig, saveConfig, ensureOutputDir, addToGitignore } from './utils/config.js';
import { initAiIgnore } from './utils/ignore.js';
import { isGitRepo } from './utils/git.js';
import type { FileEntry } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BANNER = `
  ${chalk.cyan.bold('ctx-ray')} ${chalk.dim('v1.0.0')}
  ${chalk.dim('Surgical AI context bundler')}
`;

function printBanner() {
  console.log(BANNER);
}

function printTokenReport(report: Awaited<ReturnType<typeof buildTokenReport>>) {
  const total = formatTokenCount(report.totalTokens);
  const limit = formatTokenCount(report.limit);

  if (report.exceeded) {
    console.log(chalk.yellow.bold(`\n  ⚠  Token budget exceeded: ${total} / ${limit}\n`));
    console.log(chalk.dim('  Largest files by token count:'));
    report.largestFiles.slice(0, 5).forEach((f) => {
      console.log(
        `    ${chalk.red('●')} ${chalk.white(f.path)} ${chalk.dim(`(${formatTokenCount(f.tokens)} tokens)`)}`,
      );
    });
    console.log(
      chalk.dim('\n  Tip: Add these to .aiignore or use --exclude to reduce context size.\n'),
    );
  } else {
    console.log(chalk.green(`\n  ✓ Token budget: ${total} / ${limit}\n`));
  }
}

function printSummary(files: FileEntry[], outputPath: string) {
  const totalBytes = files.reduce((s, f) => s + f.sizeBytes, 0);
  const kb = (totalBytes / 1024).toFixed(1);

  console.log(chalk.bold('\n  Bundle Summary'));
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log(`  ${chalk.cyan('Files packed')}   ${chalk.white(String(files.length))}`);
  console.log(`  ${chalk.cyan('Source size')}    ${chalk.white(`${kb} KB`)}`);
  console.log(`  ${chalk.cyan('Output')}         ${chalk.white(outputPath)}`);

  // Complexity breakdown
  const high = files.filter((f) => f.complexity === 'High').length;
  const med = files.filter((f) => f.complexity === 'Medium').length;
  const low = files.filter((f) => f.complexity === 'Low').length;
  console.log(
    `  ${chalk.cyan('Complexity')}     ${chalk.red(`H:${high}`)} ${chalk.yellow(`M:${med}`)} ${chalk.green(`L:${low}`)}`,
  );
  console.log(chalk.dim('  ─────────────────────────────────────────\n'));
}

// ─── CLI Definition ──────────────────────────────────────────────────────────

const program = new Command();

program
  .name('ctx-ray')
  .description(
    'A surgical CLI tool that bundles your codebase into an LLM-friendly XML context file.',
  )
  .version('1.0.0');

// ─── Command: pack (default) ─────────────────────────────────────────────────
program
  .command('pack [entry]', { isDefault: true })
  .description(
    'Bundle your codebase into an XML context file.\n' +
      "  If [entry] is provided, surgical mode traces only that file's import graph.\n" +
      '  Otherwise, the full project is scanned.',
  )
  .option('-d, --depth <n>', 'Maximum directory depth to scan', parseInt)
  .option('-o, --output <file>', 'Output file name', 'ai-context.xml')
  .option('--output-dir <dir>', 'Output directory', '.ctx')
  .option('-l, --limit <n>', 'Token limit (warns if exceeded)', parseInt)
  .option('--no-tree', 'Omit directory tree from output')
  .option('--no-metadata', 'Omit per-file metadata blocks')
  .option('--no-gitignore', 'Do not respect .gitignore')
  .option('--no-aiignore', 'Do not respect .aiignore')
  .option('--exclude <patterns...>', 'Additional glob patterns to exclude')
  .option('--diff', 'Only include files changed vs HEAD (requires git)')
  .option('--since <ref>', 'Only include files changed since a git ref or time (e.g. "1 hour ago")')
  .option('--append', 'Append to an existing bundle instead of overwriting')
  .option('--clip', 'Copy output to clipboard instead of writing a file')
  .option('--name <name>', 'Named snapshot (overrides --output)')
  .option('--tmp', 'Delete the output file after 5 minutes')
  .action(async (entry: string | undefined, opts) => {
    printBanner();

    const cwd = process.cwd();
    const config = loadConfig(cwd);

    // Override config with CLI flags
    const outputFile = opts.name ? `${opts.name}.ctx.xml` : (opts.output ?? config.outputFile);
    const outputDir = opts.outputDir ?? config.outputDir;
    const tokenLimit = opts.limit ?? config.tokenLimit;

    const spinner = ora({ text: 'Scanning files…', color: 'cyan' }).start();

    let files: FileEntry[];

    try {
      if (entry) {
        // ── Surgical Mode ──────────────────────────────────────────────────
        spinner.text = `Tracing imports from ${chalk.cyan(entry)}…`;
        files = await traceImports(entry, cwd, opts.depth ?? 5);
        spinner.succeed(
          `Surgical trace complete — ${chalk.cyan(String(files.length))} files found`,
        );
      } else {
        // ── Full-Project Mode ──────────────────────────────────────────────
        files = await scanFiles({
          root: cwd,
          depth: opts.depth,
          extraIgnores: opts.exclude ?? [],
          respectGitignore: opts.gitignore !== false,
          respectAiignore: opts.aiignore !== false,
          diff: opts.diff ?? false,
          since: opts.since,
        });
        spinner.succeed(`Scan complete — ${chalk.cyan(String(files.length))} files found`);
      }
    } catch (err) {
      spinner.fail('Scan failed');
      console.error(chalk.red(`\n  Error: ${(err as Error).message}\n`));
      process.exit(1);
    }

    if (files.length === 0) {
      console.log(chalk.yellow('\n  No files matched. Check your ignore rules.\n'));
      process.exit(0);
    }

    // ── Token Budget Check ─────────────────────────────────────────────────
    const tokenSpinner = ora({ text: 'Counting tokens…', color: 'cyan' }).start();
    const report = await buildTokenReport(files, tokenLimit);
    tokenSpinner.stop();
    printTokenReport(report);

    // ── Build XML ──────────────────────────────────────────────────────────
    const bundleSpinner = ora({ text: 'Building XML bundle…', color: 'cyan' }).start();
    const xml = buildXmlBundle({
      files,
      root: cwd,
      outputFormat: 'xml',
      includeTree: opts.tree !== false,
      includeMetadata: opts.metadata !== false,
    });
    bundleSpinner.succeed('XML bundle built');

    // ── Output ─────────────────────────────────────────────────────────────
    if (opts.clip) {
      const clipSpinner = ora({ text: 'Copying to clipboard…', color: 'cyan' }).start();
      try {
        const { default: clipboardy } = await import('clipboardy');
        await clipboardy.write(xml);
        clipSpinner.succeed('Copied to clipboard — no file written');
      } catch {
        clipSpinner.fail('Clipboard copy failed — falling back to file output');
        const outPath = writeBundle(xml, path.join(cwd, outputDir), outputFile);
        printSummary(files, outPath);
      }
      return;
    }

    const resolvedDir = path.join(cwd, outputDir);

    let outPath: string;
    if (opts.append) {
      const existingPath = path.join(resolvedDir, outputFile);
      if (fs.existsSync(existingPath)) {
        outPath = appendToBundle(existingPath, files);
        console.log(chalk.cyan(`  Appended ${files.length} file(s) to existing bundle`));
      } else {
        outPath = writeBundle(xml, resolvedDir, outputFile);
      }
    } else {
      outPath = writeBundle(xml, resolvedDir, outputFile);
    }

    printSummary(files, outPath);

    // ── Auto-purge (--tmp) ─────────────────────────────────────────────────
    if (opts.tmp) {
      console.log(chalk.dim('  ⏱  File will be deleted in 5 minutes…\n'));
      setTimeout(
        () => {
          try {
            fs.unlinkSync(outPath);
          } catch {
            // File already gone — no problem
          }
        },
        5 * 60 * 1000,
      ).unref();
    }
  });

// ─── Command: init ────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Initialise ctx-ray in the current project')
  .action(async () => {
    printBanner();

    const cwd = process.cwd();

    console.log(chalk.bold('  Initialising ctx-ray…\n'));

    // 1. Write .ctx-ray.json
    saveConfig(cwd, {});
    console.log(chalk.green('  ✓') + '  Created ' + chalk.cyan('.ctx-ray.json'));

    // 2. Create .aiignore
    const created = initAiIgnore(cwd);
    if (created) {
      console.log(chalk.green('  ✓') + '  Created ' + chalk.cyan('.aiignore'));
    } else {
      console.log(chalk.dim('  ·  .aiignore already exists — skipped'));
    }

    // 3. Update .gitignore
    addToGitignore(cwd, ['.ctx/', '*.ctx.xml']);
    console.log(
      chalk.green('  ✓') + '  Added ' + chalk.cyan('.ctx/') + ' to ' + chalk.cyan('.gitignore'),
    );

    // 4. Create .ctx/ directory
    const dir = path.join(cwd, '.ctx');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    console.log(chalk.green('  ✓') + '  Created ' + chalk.cyan('.ctx/') + ' directory');

    console.log(chalk.bold('\n  Ready! Try:\n'));
    console.log(chalk.cyan('    ctx-ray pack') + chalk.dim('           # Bundle entire project'));
    console.log(chalk.cyan('    ctx-ray pack ./src/index.ts') + chalk.dim('  # Surgical mode'));
    console.log(chalk.cyan('    ctx-ray pack --diff') + chalk.dim('      # Changed files only'));
    console.log(chalk.cyan('    ctx-ray pack --clip') + chalk.dim('      # Copy to clipboard\n'));
  });

// ─── Command: ls ─────────────────────────────────────────────────────────────
program
  .command('ls')
  .description('List all context snapshots in the .ctx/ directory')
  .action(() => {
    printBanner();

    const cwd = process.cwd();
    const config = loadConfig(cwd);
    const dir = path.join(cwd, config.outputDir);

    if (!fs.existsSync(dir)) {
      console.log(chalk.yellow('  No .ctx/ directory found. Run ctx-ray init first.\n'));
      return;
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.xml'));

    if (files.length === 0) {
      console.log(chalk.dim('  No bundles found in .ctx/\n'));
      return;
    }

    console.log(chalk.bold('  Context Snapshots\n'));
    files.forEach((f) => {
      const stat = fs.statSync(path.join(dir, f));
      const kb = (stat.size / 1024).toFixed(1);
      const date = stat.mtime.toLocaleDateString();
      console.log(`  ${chalk.cyan('●')} ${chalk.white(f)} ${chalk.dim(`${kb} KB · ${date}`)}`);
    });
    console.log();
  });

// ─── Command: clean ──────────────────────────────────────────────────────────
program
  .command('clean')
  .description('Delete all XML bundles in the .ctx/ directory')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (opts) => {
    printBanner();

    const cwd = process.cwd();
    const config = loadConfig(cwd);
    const dir = path.join(cwd, config.outputDir);

    if (!fs.existsSync(dir)) {
      console.log(chalk.dim('  Nothing to clean.\n'));
      return;
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.xml'));

    if (files.length === 0) {
      console.log(chalk.dim('  Nothing to clean.\n'));
      return;
    }

    if (!opts.force) {
      const { createInterface } = await import('readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      await new Promise<void>((resolve) => {
        rl.question(chalk.yellow(`  Delete ${files.length} bundle(s)? (y/N) `), (answer) => {
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.log(chalk.dim('  Aborted.\n'));
            process.exit(0);
          }
          resolve();
        });
      });
    }

    files.forEach((f) => fs.unlinkSync(path.join(dir, f)));
    console.log(chalk.green(`  ✓ Deleted ${files.length} bundle(s)\n`));
  });

// ─── Run ─────────────────────────────────────────────────────────────────────
program.parse(process.argv);
