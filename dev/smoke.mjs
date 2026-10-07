// Smoke: liquidjs рендерит все страницы витрины с моками БЕЗ исключений,
// плюс поведенческие пробы статики (тоггл темы, корзина со степперами) и
// волны A: крошки/JSON-LD/OG/canonical, словарь-фоллбек, степперы qty.
// Запуск: npm run smoke (из dev/) — падает с ненулевым кодом при ошибке рендера
// или отсутствии ключевых маркеров в HTML.
import { createEngine, renderMockPage, SHOP_BASE, withShopBase } from './harness.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const engine = createEngine();
const q = { cat: '', page: '', q: '', sort: '' };

const cases = [
  ['catalog', null, ['Кружка «Лён»', '990.00', 'product-card', 'Каталог', 'pagination', 'chip-count', 'Тарелки', 'cat-tools', 'data-sort-select']],
  ['catalog', null, ['Кружка «Лён»', '990.00', 'product-card', 'Каталог', 'pagination', 'chip-count', 'cat-tools', 'data-sort-select'], { query: { ...q, cat: 'ceramics' } }],
  ['catalog', null, ['Найдено: 26', 'value="кружка-тест"', 'q='], { query: { ...q, q: 'кружка-тест' } }],
  ['catalog', null, ['value="price_asc" selected', 'sort=price_asc&amp;page=2'], { query: { ...q, sort: 'price_asc', page: '2' } }],
  ['category', 'found', ['Керамика', 'Посуда и декор', 'Товаров: 26', 'Тарелки', 'product-card', 'data-sort-select', 'category/ceramics?page=3']],
  ['category', 'nested', ['Керамика', 'Тарелки', 'category/ceramics', 'Товаров: 1']],
  ['category', 'not_found', ['Категория не найдена']],
  ['product', null, ['Кружка «Лён»', '990.00', 'В корзину', 'В наличии: 12', 'data-gallery-thumb', 'gallery-nav', 'data-cart-qty', 'data-qty-step', 'Характеристики', 'Материал: белая глина', 'breadcrumbs']],
  ['product', 'not_found', ['Товар не найден']],
  ['checkout', 'guest', ['Ваш заказ', 'Контакты', '1980.00', 'name="website"', 'Перейти к оплате', 'data-cart-remove=', 'data-cart-clear', 'Очистить корзину', 'data-cart-qty-inc', 'data-cart-qty-dec', 'data-stock="12"']],
  ['checkout', 'member', ['Ваш заказ', '1490.00']],
  ['checkout', 'empty', ['Корзина пуста']],
  ['cart', 'guest', ['Ваш заказ', '990.00']],
  ['order', 'new', ['Заказ принят']],
  ['order', 'paid', ['Заказ оплачен']],
  ['order', 'not_found', ['Заказ не найден']],
  ['account', null, ['Мои заказы', '232.90', 'оплачен', 'ожидает оплаты', 'href="/shop/order/', 'Кружка «Лён» × 2']],
  ['account', 'empty', ['Заказов пока нет']],
  ['login', null, ['Вход', 'action="/login"', 'type="password"']],
  ['register', null, ['Регистрация', 'action="/register"', 'Создать аккаунт']],
  ['404', null, ['Страница не найдена', 'noindex']],
  ['email-customer', null, ['Магазин витрины', 'Заказ №', '232.90', 'Кружка «Лён» × 2', 'Состав заказа', 'https://shop.example.ru/shop/order/']],
  ['email-vendor', null, ['Новый заказ', '232.90', 'Иван Петров', 'ivan@example.ru', 'Позвоните за час до доставки']],
];

let failed = 0;
for (const [mock, variant, markers, overrides] of cases) {
  const label = mock + (variant ? '/' + variant : '') + (overrides?.query?.cat ? `?cat=${overrides.query.cat}` : '') + (overrides?.query?.q ? `?q=` : '') + (overrides?.query?.sort ? `?sort=` : '');
  try {
    const html = await renderMockPage(engine, mock, variant, overrides ? { query: { ...q, ...overrides.query } } : { query: { ...q } });
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

/* ── Проба словаря-фоллбека и словаря-переопределения (D25) ───────────────
   Пустой g_site (cfg/ui пусты) → вшитые фоллбеки partials/ui-text, страница
   жива; заполненный → имя магазина из shop_config, строка из ui_text
   («Купить» вместо «В корзину») вытесняет фоллбек. */
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const empty = await renderMockPage(engine, 'product', null, {
    query: { ...q },
    g_site: { data: { cfg: [], ui: [] } },
  });
  check(empty.includes('В корзину'), 'пустой g_site: кнопка несёт вшитый фоллбек «В корзину»');
  check(empty.includes('Товар не найден') === false, 'пустой g_site: страница товара жива');
  check(empty.includes('>Магазин<'), 'пустой g_site: шапка несёт фоллбек имени «Магазин»');
  const filled = await renderMockPage(engine, 'product', null, {
    query: { ...q },
    g_site: { data: { cfg: [{ name: 'Тест-магазин' }], ui: [{ key: 'add_to_cart', value: 'Купить' }] } },
  });
  check(filled.includes('Купить'), 'словарь: строка ui_text вытесняет фоллбек');
  check(!filled.includes('В корзину'), 'словарь: фоллбек «В корзину» скрыт переопределением');
  check(filled.includes('Тест-магазин'), 'словарь: имя магазина из shop_config в шапке/title');
  if (fails.length) {
    failed++;
    console.log('FAIL ui-text: ' + fails.join(' | '));
  } else {
    console.log('OK   ui-text (пустой словарь → фоллбеки и живая страница; заполненный → переопределение)');
  }
}

/* ── Проба SEO-пакета волны A (D26): canonical/OG/JSON-LD ────────────────
   Фоллбек site_url → https://{{ host }}; на странице товара — JSON-LD
   Product+Offer+BreadcrumbList (парсится), OG-пакет с og:image из первого
   фото; на категории — CollectionPage; 404 — noindex и без canonical. */
function extractJsonLd(html) {
  const out = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const host = 'https://localhost:5173';
  const cat = await renderMockPage(engine, 'catalog', null, { query: { ...q } });
  const prod = await renderMockPage(engine, 'product', null, { query: { ...q } });
  const catPage = await renderMockPage(engine, 'category', 'found', { query: { ...q } });
  const p404 = await renderMockPage(engine, '404', null, { query: { ...q } });
  check(cat.includes(`<link rel="canonical" href="${host}${SHOP_BASE}/">`), `catalog: canonical = site_url-фоллбек ${host}`);
  check(cat.includes(`property="og:url" content="${host}${SHOP_BASE}/"`), 'catalog: og:url');
  check(cat.includes('property="og:site_name" content="Магазин витрины"'), 'catalog: og:site_name из shop_config');
  check(prod.includes(`<link rel="canonical" href="${host}${SHOP_BASE}/product/mug-linen">`), 'product: canonical карточки');
  check(prod.includes('property="og:type" content="product"'), 'product: og:type=product');
  check(prod.includes(`property="og:image" content="${host}/static/photos/placeholder.svg"`), 'product: относительный og:image абсолютизирован');
  const prodLd = extractJsonLd(prod).map((s) => { try { return JSON.parse(s); } catch (e) { fails.push('product: JSON-LD не парсится: ' + e.message + ' :: ' + s.slice(0, 120)); return null; } }).filter(Boolean);
  check(prodLd.some((o) => o['@type'] === 'Product' && o.offers?.price === '990.00' && o.offers?.priceCurrency === 'RUB'
    && o.offers?.availability === 'https://schema.org/InStock'), 'product: JSON-LD Product+Offer (цена/валюта/наличие)');
  check(prodLd.some((o) => o['@type'] === 'Product' && Array.isArray(o.image) && o.image.length === 2), 'product: JSON-LD Product.image[] — все фото');
  const bc = prodLd.find((o) => o['@type'] === 'BreadcrumbList');
  check(bc && bc.itemListElement.length === 3
    && bc.itemListElement[0].item === `${host}${SHOP_BASE}/`
    && bc.itemListElement[1].item === `${host}${SHOP_BASE}/category/ceramics`
    && bc.itemListElement[2].name === 'Кружка «Лён»',
    'breadcrumbs: цепочка Главная → Категория → Товар и в разметке, и в JSON-LD');
  const catLd = extractJsonLd(catPage).map((s) => { try { return JSON.parse(s); } catch (e) { fails.push('category: JSON-LD не парсится: ' + e.message); return null; } }).filter(Boolean);
  check(catLd.some((o) => o['@type'] === 'CollectionPage'), 'category: JSON-LD CollectionPage');
  check(catLd.some((o) => o['@type'] === 'BreadcrumbList'), 'category: JSON-LD BreadcrumbList');
  check(p404.includes('noindex') && !p404.includes('rel="canonical"'), '404: noindex, canonical нет');
  if (fails.length) {
    failed++;
    console.log('FAIL seo-pack: ' + fails.join(' | '));
  } else {
    console.log('OK   seo-pack (canonical/og:host-фоллбек, JSON-LD Product/Offer/CollectionPage/BreadcrumbList парсятся, 404 noindex)');
  }
}

/* ── Проба B-1 (критик r1): query-эхо не отражается сырым ────────────────
   ?q= и ?cat= кэшируются рендером (TTL 300) — reflected XSS был бы
   кэшируемым. Регрессия на КЛАСС: вектор из пробы критика в value и в
   href; в выдаче допустимы только escape/url_encode-формы. */
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const vec = '"><script>alert(1)</script>';
  const html = await renderMockPage(engine, 'catalog', null, { query: { ...q, q: vec, cat: '"><svg onload=alert(1)>' } });
  check(!html.includes('<script>alert(1)'), 'B-1: сырой <script> из ?q= не попал в HTML');
  check(!html.includes('<svg onload'), 'B-1: сырой вектор из ?cat= не попал в HTML');
  check(html.includes('&lt;script&gt;'), 'B-1: ?q= отражён escape-формой (&lt;script&gt;)');
  check(html.includes('value="&#34;&gt;&lt;script'), 'B-1: value-атрибут не покидается (кавычка закодирована, &#34;)');
  const hrefOk = [...html.matchAll(/href="([^"]*)"/g)].every((m) => !m[1].includes('<') && !m[1].includes('"'));
  check(hrefOk, 'B-1: ни один href не содержит сырых < или "');
  if (fails.length) {
    failed++;
    console.log('FAIL xss-echo: ' + fails.join(' | '));
  } else {
    console.log('OK   xss-echo (вектора ?q=/?cat= отражаются только escape/url_encode-формой)');
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
    body: null,
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

/* ── Поведенческая проба степперов количества (D23) ───────────────────────
   Карточка: data-qty-step="+1/-1" крутит существующий [data-cart-qty]
   (контракт add(slug, qty) не меняется). Строки чекаута: data-cart-qty-inc/dec
   → setQty(slug, qty±1) — replace-семантика полным массивом; inc гасится
   data-stock'ом; dec до нуля убирает строку. */
async function smokeQtySteppers() {
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

  // Карточка товара: степпер вокруг инпута (data-qty-step крутит [data-cart-qty]).
  const qtyInput = { value: '1' };
  const stepperBox = { querySelector: (sel) => (sel === '[data-cart-qty]' ? qtyInput : null) };
  const mkBtn = (attrs) => ({
    attrs,
    getAttribute(k) { return attrs[k] ?? null; },
    closest(sel) { return sel === '[data-cart-stepper]' ? stepperBox : null; },
  });
  const addBtn = mkBtn({ 'data-cart-add': 'mug' });
  const stepBtn = mkBtn({ 'data-qty-step': '+1' });
  const incBtn = mkBtn({ 'data-cart-qty-inc': 'mug', 'data-stock': '5' });
  const decBtn = mkBtn({ 'data-cart-qty-dec': 'tot' });
  const MAP = {
    '[data-cart-add]': addBtn,
    '[data-qty-step]': stepBtn,
    '[data-cart-qty-inc]': incBtn,
    '[data-cart-qty-dec]': decBtn,
  };
  const listeners = {};
  const document = {
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    querySelectorAll: () => [],
    querySelector(sel) { return sel === '[data-cart-qty]' ? qtyInput : null; },
    body: { getAttribute: () => null },
  };
  const click = (btn) => {
    for (const fn of listeners.click ?? []) {
      fn({ preventDefault() {}, target: { closest: (sel) => (MAP[sel] === btn ? btn : (sel === '[data-cart-stepper]' ? stepperBox : null)) } });
    }
  };
  const src = withShopBase(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js', 'cart.js'), 'utf8'));
  new Function('document', 'window', 'fetch', src)(document, { location: {} }, fetchMock);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  await tick(); await tick(); // гидратация GET: [{mug:2},{tot:1}]

  // 1) карточный степпер: +1 мутирует инпут (2), сам не шлёт POST
  click(stepBtn);
  check(qtyInput.value === 2, `карточный степпер не мутировал qty: ${qtyInput.value}`);
  check(!calls.some((c) => c.method === 'POST'), 'карточный степпер не должен слать POST (шлёт только add)');

  // 2) add читает инпут: mug 2 (состояние) + 2 (инпут) = 4 в POST
  click(addBtn);
  await tick(); await tick();
  let post = calls.find((c) => c.method === 'POST');
  check(post && post.items.find((l) => l.slug === 'mug')?.qty === 4,
    `add после степпера несёт mug qty=4: ${post && JSON.stringify(post.items)}`);

  // 3) строка чекаута inc: mug 4 → 5 (data-stock=5)
  click(incBtn);
  await tick(); await tick();
  post = calls.filter((c) => c.method === 'POST').pop();
  check(post && post.items.find((l) => l.slug === 'mug')?.qty === 5,
    `inc строки: mug qty=5 ожидалась, приехало ${post && JSON.stringify(post.items)}`);

  // 4) inc сверх остатка гасится: mug уже 5 = data-stock → POST без роста
  click(incBtn);
  await tick(); await tick();
  post = calls.filter((c) => c.method === 'POST').pop();
  check(post && post.items.find((l) => l.slug === 'mug')?.qty === 5,
    `inc сверх data-stock должен гаситься (qty=5), приехало ${post && JSON.stringify(post.items)}`);

  // 5) dec до нуля убирает строку (replace-семантика)
  click(decBtn);
  await tick(); await tick();
  post = calls.filter((c) => c.method === 'POST').pop();
  check(post && !post.items.some((l) => l.slug === 'tot'),
    `dec до нуля убирает строку tot: ${post && JSON.stringify(post.items)}`);

  if (fails.length) {
    failed++;
    console.log('FAIL qty-steppers: ' + fails.join(' | '));
  } else {
    console.log('OK   qty-steppers (карточка крутит инпут без POST; inc/dec строк — replace, data-stock гасит, 0 удаляет)');
  }
}
await smokeQtySteppers();

/* ── Проба member-контура: шапка переключается по member (SSR) ────────────
   Контракт (ЛК): гость видит «Войти»/«Регистрация», вошедший — «Кабинет»/
   «Выйти» (выход — POST-форма на /logout); в шапке data-member несёт id
   сессии. Кабинет ссылается на заказы ПОД БАЗОЙ магазина (/shop/order/…). */
{
  const guest = await renderMockPage(engine, 'catalog', null, { query: { ...q } });
  const member = await renderMockPage(engine, 'account', null, { query: { ...q } });
  const login = await renderMockPage(engine, 'login', null, { query: { failed: '1' } });
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  check(guest.includes('href="/login"') && guest.includes('href="/register"'), 'гость: шапка несёт /login и /register');
  check(!guest.includes('href="/account"'), 'гость: ссылки «Кабинет» быть не должно');
  check(guest.includes('data-member=""'), 'гость: data-member пуст');
  check(member.includes('href="/account"') && member.includes('action="/logout"'), 'вошедший: шапка несёт /account и POST-форму /logout');
  check(!member.includes('href="/login"'), 'вошедшему ссылку «Войти» не показываем');
  check(/data-member="[0-9a-f-]{36}"/.test(member), 'вошедший: data-member несёт id');
  check(login.includes('Неверный email или пароль'), 'login?failed=1 показывает ошибку');
  if (fails.length) {
    failed++;
    console.log('FAIL member-menu: ' + fails.join(' | '));
  } else {
    console.log('OK   member-menu (гость: Войти/Регистрация; вошедший: Кабинет/Выйти-POST; кабинет → /shop/order/…)');
  }
}

/* ── Проба раскладки: футер прижат к низу на коротких страницах ──────────
   Контракт (w3-stretch): body — flex-колонка на весь экран (100dvh), main
   растёт (flex: 1 0 auto), футер — sibling сразу после main в base.liquid.
   Все страницы собираются через {% include "base" %}, поэтому структурный
   чек на двух коротких страницах (404, кабинет) покрывает все; CSS-контракт
   проверяем по источнику статики (смок рендерит HTML без применения стилей). */
{
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'shop.css'), 'utf8');
  const bodyRule = /body\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  const page404 = await renderMockPage(engine, '404', null, {});
  const account = await renderMockPage(engine, 'account', null, {});
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  check(bodyRule.includes('min-height: 100dvh'), 'shop.css: у body нет min-height: 100dvh');
  check(bodyRule.includes('display: flex') && bodyRule.includes('flex-direction: column'), 'shop.css: body не flex-колонка');
  check(/main\s*\{[^}]*flex:\s*1 0 auto/.test(css), 'shop.css: main не растягивается (flex: 1 0 auto)');
  check(/<\/main>\s*<footer class="shop-footer">/.test(page404), '404: футер не sibling сразу после main');
  check(/<\/main>\s*<footer class="shop-footer">/.test(account), 'account: футер не sibling сразу после main');
  if (fails.length) {
    failed++;
    console.log('FAIL layout-stretch: ' + fails.join(' | '));
  } else {
    console.log('OK   layout-stretch (body flex-колонка 100dvh, main flex-grow, футер после main)');
  }
}

/* ── Проба мобильного-фёрста: 320 без горизонтального скролла ─────────
   Контракт (w3-mobile, паттерн лендинг-плагина): базовые стили = малые
   экраны, улучшения ТОЛЬКО через @media (min-width: …). Смок рендерит
   HTML без применения стилей, поэтому контракт проверяем по источнику
   CSS: (1) ноль max-width-медиазапросов; (2) ноль px-ширин (текучие
   rem-контролы, никакой фиксированной геометрии); (3) шапка в базе
   переносится (flex-wrap: wrap) — иначе корзина с тумблером темы
   выталкиваются за 320 (это и была живая поломка 412/320);
   (4) грид каталога в базе — одна колонка minmax(0, 1fr) со ступенями
   30rem/62rem (1→2→4); (5) тап-таргеты в базе ≥ 2.75rem = 44px, D31 (тумблер темы,
   крестик корзины, чип, страница пагинации, кнопки степпера);
   (6) инпуты в базе 16px (--shop-text-md) — Safari iOS не зумит страницу
   при фокусе. */
{
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'shop.css'), 'utf8')
    // Контракт — по КОДУ: комментарии не должны влиять на пробу
    // (шапка файла документирует «никаких max-width» и сама бы матчилась).
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  check(!/@media[^{]*max-width/.test(css), 'найден max-width-медиазапрос — не мобильный-фёрст');
  check(/@media \(min-width: 30rem\)/.test(css) && /@media \(min-width: 40rem\)/.test(css)
        && /@media \(min-width: 62rem\)/.test(css), 'нет min-width-ступеней 30/40/62rem');
  const pxW = [...css.matchAll(/(min-)?width:\s*(\d+)px/g)].map((m) => Number(m[2]));
  check(pxW.every((n) => n <= 320), 'px-ширина шире 320 — фиксированная геометрия запрещена: ' + pxW.filter((n) => n > 320).join(', '));
  check(/\.shop-header-inner\s*\{[^}]*flex-wrap:\s*wrap/.test(css), 'шапка в базе не переносится (flex-wrap: wrap)');
  check(/\.product-grid,\s*\.rel-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css),
        'грид каталога в базе не одна текучая колонка minmax(0, 1fr)');
  check(/\.icon-btn\s*\{[^}]*width:\s*2\.75rem/.test(css), 'тумблер темы в базе уже 2.75rem (44px, D31)');
  check(/\.cart-line-remove\s*\{[^}]*width:\s*2\.75rem/.test(css), 'крестик корзины в базе уже 2.75rem (44px, D31)');
  check(/\.chip\s*\{[^}]*min-height:\s*2\.75rem/.test(css), 'чип категорий в базе ниже 2.75rem (44px, D31)');
  check(/\.qty-btn\s*\{[^}]*width:\s*2\.75rem/.test(css), 'кнопка степпера в базе ниже 2.75rem (44px, D31)');
  check(/\.field-input,\s*\.field-textarea\s*\{[^}]*font-size:\s*var\(--shop-text-md\)/.test(css),
        'инпуты в базе мельче 16px — iOS Safari зумит при фокусе');
  if (fails.length) {
    failed++;
    console.log('FAIL layout-mobile: ' + fails.join(' | '));
  } else {
    console.log('OK   layout-mobile (min-width-only, база 1 колонка, шапка переносится, тап-таргеты 2.75rem/44px, инпуты 16px)');
  }
}

/* ── Проба «тулбар компактен» (v1.6.1, разнос владельца) ──────────────
   Контракт: на desktop-вьюпорте поиск и сортировка НЕ растянуты на всю
   ширину страницы (rich-shop тулбар). Смок рендерит HTML без применения
   стилей, поэтому контракт — по исходнику shop.css (комментарии вычищены):
   в блоке @media (min-width: 30rem) у .search-box и .sort-box есть
   max-width в rem (поле ≤ 20rem = 320px, селект ≤ 13.75rem = 220px); в
   базе (320) панель складывается — .search-box полная строка (там это
   ок). Плюс обёртки: select не голый (appearance: none + .sort-box с
   кастомным шевроном в разметке), у поиска — иконка-лупа; легаси-классы
   растянутой вёрстки (.sort-label) ликвидированы. */

/* mediaBlock: вырезать сбалансированный по скобкам блок @media-правила
   (наивный [^}] не берёт вложенные правила). */
const mediaBlock = (cssSrc, header) => {
  const m = new RegExp(header + '\\s*\\{').exec(cssSrc);
  if (!m) return '';
  let depth = 0, i = m.index + m[0].length - 1;
  for (; i < cssSrc.length; i++) {
    if (cssSrc[i] === '{') depth++;
    else if (cssSrc[i] === '}') { depth--; if (depth === 0) break; }
  }
  return cssSrc.slice(m.index, i + 1);
};
{
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'shop.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const block30 = mediaBlock(css, '@media \\(min-width: 30rem\\)');
  const remMax = (rule) => { const m = /max-width:\s*([\d.]+)rem/.exec(rule); return m ? Number(m[1]) : null; };
  const searchRule = /\.search-box\s*\{[^}]*\}/.exec(block30)?.[0] ?? '';
  const sortRule = /\.sort-box\s*\{[^}]*\}/.exec(block30)?.[0] ?? '';
  const sw = remMax(searchRule), tw = remMax(sortRule);
  check(sw !== null && sw >= 15 && sw <= 20, `desktop: у .search-box нет компактного max-width 15–20rem: ${searchRule}`);
  check(tw !== null && tw >= 10 && tw <= 13.75, `desktop: у .sort-box нет фиксированной ширины 10–13.75rem: ${sortRule}`);
  check(/\.tools-right\s*\{[^}]*margin-left:\s*auto/.test(block30), 'desktop: группа «сортировка+кнопка» прижата вправо');
  const baseSearch = /\.search-box\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check(/flex:\s*1 1 100%/.test(baseSearch), 'база 320: поле поиска — полная строка (панель складывается)');
  check(/\.field-input\.sort-select\s*\{[^}]*appearance:\s*none/.test(css), 'select не голый: appearance: none (+ кастомный шеврон)');
  const catTpl = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'catalog.liquid'), 'utf8');
  const catPageTpl = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'category.liquid'), 'utf8');
  check(catTpl.includes('search-icon') && catTpl.includes('sort-chevron'), 'каталог: тулбар несёт иконку-лупу и шеврон сортировки');
  check(catPageTpl.includes('sort-chevron'), 'категория: сортировка тоже обёрнута (шеврон)');
  check(!/\.sort-label\s*\{/.test(css), 'легаси .sort-label растянутой вёрстки ликвидирован');
  if (fails.length) {
    failed++;
    console.log('FAIL toolbar-compact: ' + fails.join(' | '));
  } else {
    console.log('OK   toolbar-compact (desktop: поиск ≤20rem, селект ≤12.5rem, группа справа; select обёрнут, лупа на месте)');
  }
}

/* ── Проба «чипы в одну строку» (v1.6.1, второй разнос владельца) ─────
   Контракт: чипы категорий — ОДНА горизонтальная строка на ЛЮБОЙ ширине;
   multi-line ragged-wrap запрещён. По исходнику CSS (DOM-проверку
   scrollWidth>clientWidth делает живая вёрстка/скрины 320): у .chip-row
   в базе flex-wrap: nowrap + overflow-x: auto (переполнение = скролл,
   вертикальный перенос — нет) + scroll-snap + скрытый скроллбар + фейд
   справа; сами чипы не сжимаются (flex: 0 0 auto); на ≥48rem фейд
   выключен. Отступ дерева .chip-child margin-left (дыра между чипами)
   ликвидирован. Разметка чипов в ОБЕИХ точках рендера (каталог +
   категория) несёт class="chip-row". В общий паршал не выносилось:
   счётчики/дерево требуют assign, а паршалы обязаны быть чистыми
   функциями (проба partial-purity) — контракт одной строки несёт CSS. */
{
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'shop.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const rowRule = /\.chip-row\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check(/flex-wrap:\s*nowrap/.test(rowRule), 'chip-row: вертикальный перенос не запрещён (нет flex-wrap: nowrap)');
  check(/overflow-x:\s*auto/.test(rowRule), 'chip-row: переполнение не скроллится (нет overflow-x: auto)');
  check(/scroll-snap-type:\s*x/.test(rowRule), 'chip-row: нет scroll-snap');
  check(/scrollbar-width:\s*none/.test(rowRule) && /\.chip-row::-webkit-scrollbar\s*\{[^}]*display:\s*none/.test(css), 'chip-row: скроллбар не скрыт');
  check(/mask-image:\s*linear-gradient/.test(rowRule), 'chip-row: нет fade-подсказки прокрутки справа');
  check(/\.chip\s*\{[^}]*flex:\s*0 0 auto/.test(css), 'чип сжимается внутри строки (должен быть flex: 0 0 auto)');
  const allRowRules = [...css.matchAll(/\.chip-row\s*\{[^}]*\}/g)].map((m) => m[0]);
  check(allRowRules.every((r) => !/flex-wrap:\s*wrap/.test(r)), 'найден ragged-wrap: flex-wrap: wrap на .chip-row');
  const block48 = mediaBlock(css, '@media \\(min-width: 48rem\\)');
  check(/\.chip-row\s*\{[^}]*mask-image:\s*none/.test(block48), '≥48rem: фейд чипов не выключен');
  check(!/\.chip-child\s*\{[^}]*margin-left/.test(css), 'дыра чипов: .chip-child margin-left не ликвидирован');
  for (const tpl of ['catalog.liquid', 'category.liquid']) {
    const src = readFileSync(join(rootDir, 'templates', tpl), 'utf8');
    check(src.includes('class="chip-row"'), `${tpl}: чипы рендерятся без class="chip-row"`);
  }
  if (fails.length) {
    failed++;
    console.log('FAIL chips-single-row: ' + fails.join(' | '));
  } else {
    console.log('OK   chips-single-row (одна скролл-строка: nowrap+snap+скрытый скроллбар+фейд<48rem; дыра margin-left ликвидирована)');
  }
}

/* ── Инвариант скоупа паршалов (регрессия класса include-assign) ──────────
   Движок рендера (osteele/liquid) НЕ поднимает assign/capture из паршала
   включателю — паршал обязан быть чистой функцией входов (данные текут
   только вниз). (1) Статика: в templates/partials/*.liquid запрещены
   {% assign %} и {% capture %} — любое появление ловим здесь.
   (2) Синхронизация: бутстрап словаря обязан быть заинлайнен БАЙТ-В-БАЙТ
   в каждом entry-шаблоне (каноническая копия — dev/ui-text-bootstrap.liquid);
   include "partials/ui-text" больше не существует. */
{
  const { readdirSync } = await import('node:fs');
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const partDir = join(rootDir, 'templates', 'partials');
  const fails = [];
  for (const f of readdirSync(partDir)) {
    if (!f.endsWith('.liquid')) continue;
    const src = readFileSync(join(partDir, f), 'utf8');
    const body = src.replace(/\{%-?\s*comment[\s\S]*?endcomment\s*-?%\}/g, ''); // комментарии не считаются
    if (/\{%-?\s*assign/.test(body)) fails.push(`partials/${f}: найден {% assign %} — паршал должен быть чистой функцией`);
    if (/\{%-?\s*capture/.test(body)) fails.push(`partials/${f}: найден {% capture %} — capture вверх не доезжает`);
    if (/include\s+"partials\/ui-text"/.test(body)) fails.push(`partials/${f}: include ликвидированного ui-text`);
  }
  const bootstrap = readFileSync(join(rootDir, 'dev', 'ui-text-bootstrap.liquid'), 'utf8');
  const entries = ['404.liquid', 'account.liquid', 'catalog.liquid', 'category.liquid', 'checkout.liquid',
    'login.liquid', 'order-status.liquid', 'product.liquid', 'register.liquid',
    'email-order-customer.liquid', 'email-order-vendor.liquid', 'email-layout.liquid'];
  for (const e of entries) {
    const src = readFileSync(join(rootDir, 'templates', e), 'utf8');
    if (!src.includes(bootstrap)) fails.push(`${e}: бутстрап словаря отсутствует/разошёлся с dev/ui-text-bootstrap.liquid`);
    if (/include\s+"partials\/ui-text"/.test(src)) fails.push(`${e}: устаревший include partials/ui-text (assign не доедет)`);
  }
  if (fails.length) {
    failed++;
    console.log('FAIL partial-purity: ' + fails.join(' | '));
  } else {
    console.log('OK   partial-purity (паршалы без assign/capture; бутстрап байт-в-байт во всех entry)');
  }
}

if (failed) {
  console.log('smoke: FAILED (см. FAIL выше)');
  process.exit(1);
}
console.log('smoke done: render + theme-toggle + cart-replace + qty-steppers + seo-pack + xss-echo + ui-text + member-menu + layout-stretch + layout-mobile + toolbar-compact + chips-single-row + partial-purity');
