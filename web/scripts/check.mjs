// Cek sintaks semua file JS (setara `node --check`) sebelum commit.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = ['src', 'public'];
let files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (['.js', '.mjs'].includes(extname(p))) files.push(p);
  }
};
roots.forEach(walk);

let failed = 0;
for (const f of files) {
  try {
    // --input-type=module agar import/export & top-level await diterima
    execFileSync(process.execPath, ['--check', '--input-type=module'], { input: readFileSync(f), stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    failed++;
    console.error(`✗ ${f}\n${e.stderr?.toString() || e.message}`);
  }
}
console.log(failed ? `${failed} file bermasalah` : `✓ ${files.length} file JS lolos cek sintaks`);
process.exit(failed ? 1 : 0);
