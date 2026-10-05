// Smoke: liquidjs рендерит все страницы витрины с моками БЕЗ исключений,
// плюс поведенческие пробы статики (тоггл темы меняет data-theme и пишет
// ОБЕ формы выбора — localStorage и куку с domain).
// Запуск: npm run smoke (из dev/) — падает с ненулевым кодом при ошибке рендера
// или отсутствии ключевых маркеров в HTML.
import { createEngine, renderMockPage, SHOP_BASE, withShopBase } from './harness.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const engine = createEngine();
const q = { cat: '', page: '' };

const cases = [
  ['catalog', null, ['Кружка «Лён»', '990.00', 'Керамика', 'product-card', 'Каталог', 'pagination', '&amp;page=3']],
  ['product', null, ['Кружка «Лён»', '990.00', 'В корзину', 'В наличии']],
  ['product', 'not_found', ['Товар не найден']],
  ['checkout', 'guest', ['Ваш заказ', 'Контакты', '1980.00', 'name="website"', 'Перейти к оплате', 'data-cart-remove=', 'data-cart-clear', 'Очистить корзину']],
  ['checkout', 'member', ['Ваш заказ', '1490.00']],
  ['checkout', 'empty', ['Корзина пуста']],
  ['cart', 'guest', ['Ваш заказ', '990.00']],
  ['order', null, ['Заказ принят', '232.90', 'Заказ №']],
  ['order', 'paid', ['Заказ оплачен']],
  ['order', 'not_found', ['Заказ не найден']],
  ['404', null, ['Страница не найдена', 'В каталог']]
];

let failed = 0;
for (const [mock, variant, markers] of cases) {
  const label = mock + (variant ? '/' + variant : '');
  try {
    const html = await renderMockPage(engine, mock, variant, { query: { ...q } });
    // Гигиена базы магазина: сентинел не доезжает до выдачи — в живом HTML
    // все ссылки на страницы магазина несут базу (dev: /shop, прод: ответ
    // шага store_path). Статика платформы (/static/…) — исключение: её
    // монтирует сам рендер-сервис, префикс магазина ей не нужен.
    if (html.includes('__SHOP_BASE__')) {
      failed++;
      console.log(`FAIL ${label}: в выдаче остался сентинел __SHOP_BASE__`);
      continue;
    }
    const missing = markers.filter((m) => !html.includes(m));
    if (missing.length) {
      failed++;
      console.log(`FAIL ${label}: не найдены маркеры: ${missing.join(' | ')}`);
    } else {
      console.log(`OK   ${label} (${html.length} байт)`);
    }
  } catch (err) {
    failed++;
    console.log(`FAIL ${label}: ${err && err.message}`);
  }
}

/* ── Проба базы магазина: ссылки уходят под SHOP_BASE (/shop) ──────────── */
{
  const html = await renderMockPage(engine, 'catalog', null, { query: { ...q } });
  const rawCart = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js', 'cart.js'), 'utf8');
  const checks = [
    [html.includes(`href="${SHOP_BASE}/checkout"`), `catalog: ссылка на корзину = ${SHOP_BASE}/checkout`],
    [html.includes(`href="${SHOP_BASE}/?`), `catalog: пагинация под ${SHOP_BASE}`],
    [html.includes(`href="${SHOP_BASE}/product/`), `catalog: карточки под ${SHOP_BASE}`],
    [rawCart.includes("SHOP_BASE = '__SHOP_BASE__'"), 'cart.js источник несёт сентинел __SHOP_BASE__'],
    [!withShopBase(rawCart).includes('__SHOP_BASE__'), 'withShopBase вычищает сентинел из cart.js'],
    [withShopBase(rawCart).includes(`var SHOP_BASE = '${SHOP_BASE}';`), 'cart.js после подстановки база = /shop'],
  ];
  const bad = checks.filter(([ok]) => !ok).map(([, m]) => m);
  if (bad.length) {
    failed++;
    console.log('FAIL shop-base: ' + bad.join(' | '));
  } else {
    console.log(`OK   shop-base (сентинел в источниках, ${SHOP_BASE} в выдаче)`);
  }
}

/* ── Поведенческая проба: тоггл темы (мини-DOM над static/js/theme.js) ────
   Контракт: клик меняет data-theme и пишет ОБЕ формы выбора — localStorage
   dynamica-theme И куку dynamica-theme с domain=.<родительский домен>
   (boot-скрипт платформы кладёт куку на .dynapi.ru — тоггл обязан её
   перезаписывать 1:1, иначе «тоггл не работает», страницы в разных темах). */

function makeToggleDom(hostname) {
  // Куковая банка с браузерной семантикой: domain-кука и host-only кука с
  // одним именем — РАЗНЫЕ записи; max-age=0 удаляет запись с тем же domain.
  const jar = [];
  const parseCookie = (s) => {
    const parts = String(s).split(';').map((x) => x.trim());
    const eq = parts[0].indexOf('=');
    const kv = {};
    for (const p of parts.slice(1)) {
      const i = p.indexOf('=');
      if (i > -1) kv[p.slice(0, i)] = p.slice(i + 1);
    }
    return { name: parts[0].slice(0, eq), value: parts[0].slice(eq + 1), attrs: kv, domain: kv.domain ?? '' };
  };
  const writeCookie = (s) => {
    const c = parseCookie(s);
    const rest = jar.filter((x) => !(x.name === c.name && x.domain === c.domain));
    if (Number(c.attrs['max-age']) !== 0) rest.push(c);
    jar.length = 0;
    jar.push(...rest);
  };
  const cookieString = () => jar.map((c) => `${c.name}=${c.value}`).join('; ');

  function makeElement(extra = {}) {
    return {
      style: {},
      attrs: {},
      handlers: {},
      children: [],
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); },
      querySelector(sel) {
        const m = /\[data-icon="([a-z]+)"\]/.exec(sel);
        return m ? this.children.find((c) => c.attrs['data-icon'] === m[1]) ?? null : null;
      },
      appendChild(c) { this.children.push(c); },
      click() { for (const fn of this.handlers.click ?? []) fn({}); },
      ...extra,
    };
  }

  const toggle = makeElement();
  toggle.appendChild(makeElement({ attrs: { 'data-icon': 'sun' } }));
  toggle.appendChild(makeElement({ attrs: { 'data-icon': 'moon' } }));

  const html = makeElement({
    attrs: { 'data-theme': 'dynamica-light' },
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
    },
  });

  const domListeners = {};
  const document = {
    get cookie() { return cookieString(); },
    set cookie(v) { writeCookie(v); },
    documentElement: html,
    getElementById(id) { return id === 'theme-toggle' ? toggle : null; },
    addEventListener(type, fn) { (domListeners[type] ??= []).push(fn); },
  };
  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
  };
  const window = {
    location: { hostname },
    matchMedia: () => ({ matches: false }),
    setTimeout: () => 0,
  };
  return { document, window, localStorage, toggle, html, jar, domListeners };
}

function runThemeJs(dom) {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js', 'theme.js'), 'utf8');
  new Function('document', 'window', 'localStorage', src)(dom.document, dom.window, dom.localStorage);
  for (const fn of dom.domListeners.DOMContentLoaded ?? []) fn();
}

function smokeThemeToggle() {
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };

  // 1) sub.dynapi.ru: тоггл меняет data-theme и пишет ОБЕ формы; кука — на .dynapi.ru
  const dom = makeToggleDom('mag.dynapi.ru');
  runThemeJs(dom);
  check(dom.html.attrs['data-theme'] === 'dynamica-light', 'boot: ожидалась dynamica-light');
  dom.toggle.click();
  check(dom.html.attrs['data-theme'] === 'dynamica-dark', 'клик не сменил data-theme на dynamica-dark');
  check(dom.localStorage.getItem('dynamica-theme') === 'dark', 'localStorage не получил dark');
  const themeCookies = () => dom.jar.filter((c) => c.name === 'dynamica-theme');
  check(themeCookies().length === 1, `кук dynamica-theme ${themeCookies().length}, ожидалась 1: ${JSON.stringify(dom.jar)}`);
  check(themeCookies()[0]?.value === 'dark', 'кука не dark');
  check(themeCookies()[0]?.domain === '.dynapi.ru', `кука без domain=.dynapi.ru: ${JSON.stringify(themeCookies()[0])}`);
  dom.toggle.click();
  check(dom.html.attrs['data-theme'] === 'dynamica-light' && themeCookies()[0]?.value === 'light', 'обратный клик не вернул light');

  // 2) localhost: domain-атрибута быть не должно (host-only)
  const local = makeToggleDom('localhost');
  runThemeJs(local);
  local.toggle.click();
  const lc = local.jar.filter((c) => c.name === 'dynamica-theme');
  check(lc.length === 1 && lc[0].domain === '', 'для localhost кука должна быть host-only (без domain)');

  if (fails.length) {
    failed++;
    console.log('FAIL theme-toggle: ' + fails.join(' | '));
  } else {
    console.log('OK   theme-toggle (data-theme + localStorage + cookie domain; localhost host-only)');
  }
}
smokeThemeToggle();

/* ── Поведенческая проба корзины: удаление позиции и очистка ──────────────
   Контракт (w3 №2): cart.js шлёт ПОЛНЫЙ массив на POST <base>/api/cart
   (replace-семантика); удаление позиции = массив БЕЗ этой позиции, очистка =
   пустой массив (сервер не создаёт строку на пустой список — D16). Заодно
   проверяем базу магазина: запросы уходят на SHOP_BASE, подставленный из
   сентинела __SHOP_BASE__ (= /shop в дев-среде). */

async function smokeCartReplace() {
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const calls = [];
  const respond = (items) => Promise.resolve({ ok: true, json: () => Promise.resolve({ items }) });
  const fetchMock = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    let items = [{ slug: 'mug', qty: 2 }, { slug: 'tot', qty: 1 }];
    if (method === 'POST') items = JSON.parse(opts.body).items;
    calls.push({ url, method, items });
    return respond(items);
  };
  const listeners = {};
  const document = {
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  const click = (attrs) => {
    for (const fn of listeners.click ?? []) {
      fn({ preventDefault() {}, target: { closest: (sel) => (sel in attrs ? { getAttribute: () => attrs[sel] } : null) } });
    }
  };
  const src = withShopBase(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js', 'cart.js'), 'utf8'));
  new Function('document', 'window', 'fetch', src)(document, { location: {} }, fetchMock);

  const tick = () => new Promise((r) => setTimeout(r, 0));
  await tick(); await tick(); // гидратация GET
  click({ '[data-cart-remove]': 'mug' });
  await tick(); await tick(); // POST replace
  const post1 = calls.find((c) => c.method === 'POST');
  check(calls[0] && calls[0].method === 'GET' && calls[0].url === '/shop/api/cart', `гидратация GET /shop/api/cart, а не ${JSON.stringify(calls[0])}`);
  check(!!post1, 'после удаления позиции не было POST');
  if (post1) {
    check(post1.url === '/shop/api/cart', 'POST уходит не на /shop/api/cart');
    check(JSON.stringify(post1.items) === JSON.stringify([{ slug: 'tot', qty: 1 }]),
      `POST после удаления несёт ${JSON.stringify(post1.items)}, ожидался полный массив БЕЗ позиции`);
  }
  click({ '[data-cart-clear]': true });
  await tick(); await tick();
  const post2 = calls.filter((c) => c.method === 'POST')[1];
  check(!!post2 && Array.isArray(post2.items) && post2.items.length === 0,
    `очистка не отправила пустой массив: ${JSON.stringify(post2)}`);

  if (fails.length) {
    failed++;
    console.log('FAIL cart-replace: ' + fails.join(' | '));
  } else {
    console.log('OK   cart-replace (POST полного массива: без позиции / пустой при очистке, base=/shop)');
  }
}
await smokeCartReplace();

if (failed) {
  console.log('smoke: FAILED (см. FAIL выше)');
  process.exit(1);
}
console.log(`smoke done: render ${cases.length}/${cases.length} OK + theme-toggle + cart-replace`);
