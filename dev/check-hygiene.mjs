// Гигиена (w3): в публичном репо витрины нет платформенных внутренностей.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RE = /yookassa|webhook|dynflow|secret:\/\//i;
const bad = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'dist' || f.startsWith('check-')) continue; // check-* — сами проверки
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else {
      const m = RE.exec(readFileSync(p, 'utf8'));
      if (m) bad.push(p + ': ' + m[0]);
    }
  }
};
walk(join(root, 'templates'));
walk(join(root, 'static'));
walk(join(root, 'mock'));
walk(join(root, 'dev'));
if (bad.length) {
  console.error(bad.join('\n'));
  process.exit(1);
}
console.log('CLEAN: yookassa|webhook|dynflow|secret:// = 0');
