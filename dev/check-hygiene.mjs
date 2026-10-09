// Гигиена (w3): в публичном репо витрины нет платформенных внутренностей.
// B1 (спейсинг-аудит владельца): в shop.css запрещён сырой px в
// margin/padding (отступы — только rem-шкала --shop-space-*) и в
// box-shadow (тени — только rem-токены --shop-shadow-*).
// Разрешено: 0, 1px-класс (см. построчные маркеры «px-допустимо: причина»).
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

/* ── B1: сырой px в margin/padding и box-shadow — запрещён ──
   Отступы: только rem-шкала --shop-space-* (tokens.css); тени: только
   rem-токены --shop-shadow-*. Допущено: 0; 1px-класс (швы/канон-паттерны) —
   ТОЛЬКО с построчным маркером «px-допустимо: <причина>» (маркер живёт в
   CSS-комментарии той же строки — гвард читает сырoй текст файла). */
const css = readFileSync(join(root, 'static', 'css', 'shop.css'), 'utf8');
const pxBad = [];
for (const [i, line] of css.split('\n').entries()) {
  if (!/(?:margin|padding|box-shadow)[^:]*:\s*[^;]*\dpx/.test(line)) continue;
  if (line.includes('px-допустимо')) continue;
  // 0px без размерного смысла не встречается; 1px/-1px без маркера тоже флагаем —
  // исключение обязано быть объяснено маркером (причина рядом с местом).
  pxBad.push(`shop.css:${i + 1}: ${line.trim().slice(0, 100)}`);
}
if (pxBad.length) {
  console.error('CLEAN-FAIL: сырой px в margin/padding/box-shadow (нужен rem/токен или маркер «px-допустимо: причина»):');
  console.error(pxBad.join('\n'));
  process.exit(1);
}
console.log('CLEAN: сырой px в margin/padding/box-shadow = 0 (исключения помечены «px-допустимо»)');
