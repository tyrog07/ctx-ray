import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';

const isWatch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/cli.ts', 'src/index.ts'],
  bundle: true,
  outdir: 'dist',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  packages: 'external',
  minify: true,
  sourcemap: false,
};

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('esbuild watching for changes...');
  } else {
    await esbuild.build(options);
    console.log('esbuild completed successfully.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
