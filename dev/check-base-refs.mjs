// Временная проверка grep-запрета (w3 №7): абсолютных ссылок от корня быть
// не должно — всё через __SHOP_BASE__ или относительное; /static/* исключён
// (платформенный маунт от корня сайта). Запуск: node dev/check-base-refs.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RE = /(?:href|src|action)\s*=\s*["']\/(?!static\/)|fetch\(\s*["'`]\/(?!static\/)/;
const bad = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
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
if (bad.length) {
  console.error(bad.join('\n'));
  process.exit(1);
}
console.log('CLEAN: root-absolute refs (except /static/): 0');
