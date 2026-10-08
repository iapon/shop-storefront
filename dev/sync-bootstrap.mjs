// Синхронизация канонического бутстрапа настроек (dev/site-config-bootstrap.liquid)
// во все entry-шаблоны: регион от старт-маркера комментария длиной ровно
// canon.length байт заменяется байт-в-байт на канон (регион, а не includes —
// «хвост-мусор» после канона ловится смоком, sync его не тиражирует).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const canon = readFileSync(join(root, 'dev', 'site-config-bootstrap.liquid'), 'utf8');
const START = '{%- comment -%}\n  БУТСТРАП НАСТРОЕК (W8)';

const entries = ['404.liquid', 'account.liquid', 'catalog.liquid', 'category.liquid', 'checkout.liquid',
  'login.liquid', 'order-status.liquid', 'product.liquid', 'register.liquid',
  'email-order-customer.liquid', 'email-order-vendor.liquid', 'email-layout.liquid'];
for (const e of entries) {
  const p = join(root, 'templates', e);
  const src = readFileSync(p, 'utf8');
  const s = src.indexOf(START);
  if (s < 0) { console.error(`${e}: не найден старт маркера`); process.exit(1); }
  const out = src.slice(0, s) + canon + src.slice(s + canon.length);
  if (out !== src) { writeFileSync(p, out); console.log(`synced ${e}`); } else { console.log(`ok ${e}`); }
}
