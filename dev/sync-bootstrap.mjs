// Разовая синхронизация канонического бутстрапа (dev/ui-text-bootstrap.liquid)
// во все entry-шаблоны: блок от маркера комментария до последней строки-assign
// заменяется байт-в-байт на канон.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const canon = readFileSync(join(root, 'dev', 'ui-text-bootstrap.liquid'), 'utf8');
const START = '{%- comment -%}\n  БУТСТРАП СЛОВАРЯ И НАСТРОЕК';
const END_LINE = '{%- assign t_row = ui_rows | find: "key", "email_phone_label" -%}';
const endIdxCanon = canon.lastIndexOf(END_LINE);
if (endIdxCanon < 0) { console.error('канон: не найден хвост'); process.exit(1); }
const canonEnd = endIdxCanon + END_LINE.length;
const canonBlock = canon; // весь канон, включая новые секции

const entries = ['404.liquid', 'account.liquid', 'catalog.liquid', 'category.liquid', 'checkout.liquid',
  'login.liquid', 'order-status.liquid', 'product.liquid', 'register.liquid',
  'email-order-customer.liquid', 'email-order-vendor.liquid', 'email-layout.liquid'];
for (const e of entries) {
  const p = join(root, 'templates', e);
  const src = readFileSync(p, 'utf8');
  const s = src.indexOf(START);
  if (s < 0) { console.error(`${e}: не найден старт маркера`); process.exit(1); }
  const tail = src.lastIndexOf(END_LINE);
  if (tail < s) { console.error(`${e}: не найден хвост блока`); process.exit(1); }
  const out = src.slice(0, s) + canonBlock + src.slice(tail + END_LINE.length);
  if (out !== src) { writeFileSync(p, out); console.log(`synced ${e}`); } else { console.log(`ok ${e}`); }
}
