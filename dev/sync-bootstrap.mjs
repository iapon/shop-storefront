// Синхронизация канонического бутстрапа настроек (dev/site-config-bootstrap.liquid)
// во все entry-шаблоны. Регион ищется ПО МАРКЕРАМ (не по длине канона — правка
// канона меняет длину, наивная резка s+canon.length рвёт хвост блока):
// старт = маркер комментария, конец = канон_base-хвост блока
// (`{%- assign canon_base = "https://" | append: canon_base -%}` + `{%- endif -%}`).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const canon = readFileSync(join(root, 'dev', 'site-config-bootstrap.liquid'), 'utf8');
const START = '{%- comment -%}\n  БУТСТРАП НАСТРОЕК (W8)';
const END =
  '{%- assign canon_base = "https://" | append: canon_base -%}\n{%- endif -%}\n';
const endIdxCanon = canon.lastIndexOf(END);
// хвост замыкает канон (конец файла)
if (endIdxCanon < 0 || endIdxCanon + END.length !== canon.length) {
  console.error('канон: хвост не в конце файла — обнови sync-bootstrap.mjs');
  process.exit(1);
}

const entries = ['404.liquid', 'account.liquid', 'catalog.liquid', 'category.liquid', 'checkout.liquid',
  'login.liquid', 'order-status.liquid', 'product.liquid', 'register.liquid',
  'email-order-customer.liquid', 'email-order-vendor.liquid', 'email-layout.liquid'];
for (const e of entries) {
  const p = join(root, 'templates', e);
  const src = readFileSync(p, 'utf8');
  const s = src.indexOf(START);
  if (s < 0) { console.error(`${e}: не найден старт маркера`); process.exit(1); }
  const t = src.indexOf(END, s);
  if (t < 0) { console.error(`${e}: не найден хвост блока`); process.exit(1); }
  const out = src.slice(0, s) + canon + src.slice(t + END.length);
  if (out !== src) { writeFileSync(p, out); console.log(`synced ${e}`); } else { console.log(`ok ${e}`); }
}
