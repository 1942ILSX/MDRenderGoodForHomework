import { build } from 'esbuild';
import { mkdir, copyFile, readdir, writeFile } from 'node:fs/promises';
await mkdir('static/vendor', { recursive: true });
await build({ entryPoints: ['src/app.js', 'src/renderer.js'], bundle: true, minify: true, format: 'esm', outdir: 'static', loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, assetNames: 'fonts/[name]-[hash]', legalComments: 'linked' });
const licenses = [];
for (const name of ['markdown-it', 'markdown-it-texmath', 'markdown-it-task-lists', 'katex', 'highlight.js']) {
  const files = await readdir(`node_modules/${name}`);
  const license = files.find(f => /^licen[sc]e(?:\.|$)/i.test(f));
  if (license) {
    await copyFile(`node_modules/${name}/${license}`, `static/vendor/${name}-LICENSE`);
    licenses.push(`${name}: ${license}`);
  }
}
await writeFile('static/vendor/README.txt', 'Bundled third-party licenses\n' + licenses.join('\n'));
console.log('Built static assets, KaTeX fonts, and third-party licenses.');
