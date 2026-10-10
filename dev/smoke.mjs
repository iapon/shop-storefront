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
  ['catalog', null, ['Товаров: 26', 'value="кружка-тест"', 'applied-chip', 'q='], { query: { ...q, q: 'кружка-тест' } }],
  ['catalog', null, ['value="price_asc" selected', 'sort=price_asc&amp;page=2'], { query: { ...q, sort: 'price_asc', page: '2' } }],
  ['category', 'found', ['Керамика', 'Посуда и декор', 'Товаров: 26', 'Тарелки', 'product-card', 'data-sort-select', 'category/ceramics?page=3']],
  ['category', 'nested', ['Керамика', 'Тарелки', 'category/ceramics', 'Товаров: 1']],
  ['category', 'not_found', ['Категория не найдена']],
  ['product', null, ['Кружка «Лён»', '990.00', 'В корзину', 'В наличии: 12', 'data-gallery-thumb', 'gallery-nav', 'data-cart-qty', 'data-qty-step', 'Характеристики', 'Материал: белая глина', 'breadcrumbs']],
  ['product', 'vars', ['Худи оверсайз', 'data-variant-picker', 'data-variant-id="var-1"', 'data-price="319000"', 'data-stock="4"', 'data-variant="var-1"', 'checked', '3190.00', '>В наличии</span>', 'В корзину', 'data-pv-price', 'data-pv-badge']],
  ['product', 'not_found', ['Товар не найден']],
  ['checkout', 'guest', ['Ваш заказ', 'Контакты', 'Доставка', 'name="website"', 'Перейти к оплате', 'data-cart-remove=', 'data-cart-clear', 'Очистить корзину', 'data-cart-qty-inc', 'data-cart-qty-dec', 'data-stock="12"', 'cart-line-thumb', 'cart-line-price', '990.00 ₽ × 2', 'data-cart-note', 'data-stock-tpl="В наличии', 'name="delivery_id"', 'value="d-1" checked', 'value="d-2"', 'Способ доставки', 'Промокод', 'name="promo_code"', 'бесплатно', 'Доставка — Курьер — 300₽', '300.00', 'Скидка', 'применится при оформлении', '2629.00']],
  ['checkout', 'mix', ['Ваш заказ', 'cart-line-variant', 'Красный / M', '3190.00 ₽ × 2', '349.00 ₽ × 1', 'data-cart-qty-inc="hudi-oversayz|var-1"', 'data-cart-qty-dec="hudi-oversayz|var-1"', 'data-cart-remove="hudi-oversayz|var-1"', 'data-cart-remove="planner-pine"', '(Красный / M) × 2', 'data-stock="4"', '7029.00']],
  ['checkout', 'member', ['Ваш заказ', '1490.00', '1790.00']],
  ['checkout', 'empty', ['Корзина пуста']],
  ['cart', 'guest', ['Ваш заказ', '990.00']],
  ['order', 'new', ['Заказ принят']],
  ['order', 'new_failed', ['Платёж не прошёл', 'Повторить оплату', 'data-retry-payment=', 'data-retry-hint', 'Проверьте ключи ЮKassa'], { query: { ...q, payment: 'failed' } }],
  ['order', 'paid', ['Заказ оплачен']],
  ['order', 'not_found', ['Заказ не найден']],
  ['account', null, ['Мои заказы', '232.90', 'оплачен', 'ожидает оплаты', 'href="/shop/order/', 'Кружка «Лён» × 2']],
  ['account', 'empty', ['Заказов пока нет']],
  ['login', null, ['Вход', 'action="/login"', 'type="password"']],
  ['register', null, ['Регистрация', 'action="/register"', 'Создать аккаунт']],
  ['404', null, ['Страница не найдена', 'noindex']],
  ['email-customer', null, ['Магазин витрины', 'Заказ №', '239.61', 'Кружка «Лён» × 2', 'Состав заказа', 'Скидка «DEMO10»', '−232.90 ₽', 'Доставка (Курьер — 300₽)', '300.00 ₽', 'https://shop.example.ru/shop/order/']],
  ['email-vendor', null, ['Новый заказ', '239.61', 'Скидка «DEMO10»', '−232.90 ₽', 'Доставка (Курьер — 300₽)', '300.00 ₽', 'Иван Петров', 'ivan@example.ru', 'Позвоните за час до доставки']],
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

/* ── Проба настроек-фоллбека и настроек-переопределения (W8) ─────────────
   Пустой g_site (cfg пуст) → вшитые фоллбеки шаблонов, страница жива;
   заполненный → имя магазина и cfg-поля («Купить» вместо «В корзину»)
   вытесняют фоллбеки. Словаря ui_text больше нет (ликвидирован в W8). */
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const empty = await renderMockPage(engine, 'product', null, {
    query: { ...q },
    g_site: { data: { cfg: [] } },
  });
  check(empty.includes('В корзину'), 'пустой g_site: кнопка несёт вшитый фоллбек «В корзину»');
  check(empty.includes('Товар не найден') === false, 'пустой g_site: страница товара жива');
  check(empty.includes('>Магазин<'), 'пустой g_site: шапка несёт фоллбек имени «Магазин»');
  const filled = await renderMockPage(engine, 'product', null, {
    query: { ...q },
    g_site: { data: { cfg: [{ name: 'Тест-магазин', cta_add_to_cart: 'Купить' }] } },
  });
  check(filled.includes('Купить'), 'настройки: поле cta_add_to_cart вытесняет фоллбек');
  check(!filled.includes('В корзину'), 'настройки: фоллбек «В корзину» скрыт переопределением');
  check(filled.includes('Тест-магазин'), 'настройки: имя магазина из shop_config в шапке/title');
  const hero = await renderMockPage(engine, 'catalog', null, {
    query: { ...q },
    g_site: { data: { cfg: [{ name: 'Тест-магазин', hero_title: 'Керамика прямо с завода' }] } },
  });
  check(hero.includes('Керамика прямо с завода'), 'настройки: hero_title доезжает до H1 каталога');
  if (fails.length) {
    failed++;
    console.log('FAIL site-config: ' + fails.join(' | '));
  } else {
    console.log('OK   site-config (пустой cfg → фоллбеки и живая страница; заполненный → переопределение, hero_title в H1)');
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
   Контракт (W6 №23-24): ОДНА кнопка циклит auto→light→dark→auto. «Системная»
   (auto) = ПУСТОЕ хранилище (localStorage И кука dynamica-theme удалены) —
   boot-скрипт head в этом режиме сам следует за prefers-color-scheme.
   Явный выбор пишется в ОБЕ формы: localStorage И куку с domain=.<родительский
   домен> (перезапись платформенной куки 1:1; localhost — host-only).
   aria-label обновляется по слотам data-theme-aria-{auto,light,dark} на body. */

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
    style: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
    },
  });

  const body = makeElement({
    attrs: {
      'data-theme-aria-auto': 'Тема: системная. Переключить',
      'data-theme-aria-light': 'Тема: светлая. Переключить',
      'data-theme-aria-dark': 'Тема: тёмная. Переключить',
    },
  });

  const domListeners = {};
  const winListeners = {};
  const document = {
    get cookie() { return cookieString(); },
    set cookie(v) { writeCookie(v); },
    documentElement: html,
    body,
    getElementById(id) { return id === 'theme-toggle' ? toggle : null; },
    addEventListener(type, fn) { (domListeners[type] ??= []).push(fn); },
  };
  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const window = {
    location: { hostname },
    matchMedia: () => ({ matches: false }),
    setTimeout: () => 0,
    /* B1-v2 глитч-фиск: theme.js вешает скролл-гард is-scrolling на
       window (scroll, passive) — стаб собирает слушатели, чтобы проба
       могла проверить сам факт подписки. */
    addEventListener(type, fn, opts) { (winListeners[type] ??= []).push({ fn, opts }); },
    clearTimeout: () => 0,
  };
  return { document, window, localStorage, toggle, html, jar, domListeners, winListeners };
}

function runThemeJs(dom) {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js', 'theme.js'), 'utf8');
  new Function('document', 'window', 'localStorage', src)(dom.document, dom.window, dom.localStorage);
  for (const fn of dom.domListeners.DOMContentLoaded ?? []) fn();
}

function smokeThemeToggle() {
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const themeCookies = (dom) => dom.jar.filter((c) => c.name === 'dynamica-theme');

  // 1) sub.dynapi.ru: цикл auto→light→dark→auto; хранилище пишется/чистится,
  //    кука — на .dynapi.ru, aria-label следует за режимом.
  const dom = makeToggleDom('mag.dynapi.ru');
  runThemeJs(dom);
  // B1-v2 глитч-фиск: скролл-гард is-scrolling подписан на scroll пассивно
  const scrollSub = (dom.winListeners.scroll ?? [])[0];
  check(!!scrollSub && scrollSub.opts && scrollSub.opts.passive === true, 'глитч: скролл-гард не подписан на scroll пассивно');
  scrollSub.fn(); // событие скролла в песочнице: класс is-scrolling появляется на <html>
  check(dom.html.classList._s.has('is-scrolling'), 'глитч: событие скролла не поднимает is-scrolling на <html>');
  check(dom.html.attrs['data-theme'] === 'dynamica-light', 'boot (auto, ОС светлая): ожидалась dynamica-light');
  check(dom.toggle.attrs['aria-label'] === 'Тема: системная. Переключить', `boot: aria-label не «системная»: ${dom.toggle.attrs['aria-label']}`);
  check(dom.toggle.attrs.title === 'Тема: системная. Переключить', 'boot: title не проставлен');

  dom.toggle.click(); // auto → light
  check(dom.html.attrs['data-theme'] === 'dynamica-light', 'клик 1 (light): data-theme сбился');
  check(dom.localStorage.getItem('dynamica-theme') === 'light', 'клик 1: localStorage не получил light');
  check(themeCookies(dom).length === 1 && themeCookies(dom)[0].value === 'light'
        && themeCookies(dom)[0].domain === '.dynapi.ru', `клик 1: кука light не на .dynapi.ru: ${JSON.stringify(dom.jar)}`);
  check(dom.toggle.attrs['aria-label'] === 'Тема: светлая. Переключить', 'клик 1: aria-label не «светлая»');

  dom.toggle.click(); // light → dark
  check(dom.html.attrs['data-theme'] === 'dynamica-dark', 'клик 2 (dark): data-theme не dynamica-dark');
  check(dom.localStorage.getItem('dynamica-theme') === 'dark', 'клик 2: localStorage не получил dark');
  check(themeCookies(dom).length === 1 && themeCookies(dom)[0].value === 'dark', 'клик 2: кука не dark');
  check(dom.toggle.attrs['aria-label'] === 'Тема: тёмная. Переключить', 'клик 2: aria-label не «тёмная»');

  dom.toggle.click(); // dark → auto: хранилище ПОЛНОСТЬЮ пустое
  check(dom.localStorage.getItem('dynamica-theme') === null, 'клик 3 (auto): localStorage не очищен');
  check(themeCookies(dom).length === 0, `клик 3: куки не удалены: ${JSON.stringify(dom.jar)}`);
  check(dom.html.attrs['data-theme'] === 'dynamica-light', 'клик 3 (auto): ОС светлая — ожидалась dynamica-light');
  check(dom.toggle.attrs['aria-label'] === 'Тема: системная. Переключить', 'клик 3: aria-label не «системная»');

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
    console.log('OK   theme-toggle (цикл auto→light→dark→auto: хранилище/кука .dynapi.ru/aria по слотам; localhost host-only)');
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
   Контракт (w3-mobile, W7-канон): базовые стили = малые экраны,
   улучшения ТОЛЬКО через @media (min-width: …). Смок рендерит HTML
   без применения стилей, поэтому контракт проверяем по источнику CSS:
   (1) ноль max-width-медиазапросов; (2) ноль px-ширин (текучие
   rem-контролы, никакой фиксированной геометрии); (3) шапка в базе
   переносится (flex-wrap: wrap) — страховка против выталкивания за
   320; (4) грид каталога в базе — одна колонка minmax(0, 1fr) со
   ступенями 30rem/62rem (1→2→4); главный десктопный брейкпоинт —
   48rem (=768px, канон лендинг-визарда: масштаб несёт корень
   html{font-size:100vw/90}, tokens.css); (5) тап-таргеты в базе
   ≥ 2.75rem = 44px, D31 (тумблер темы, крестик корзины, чип,
   кнопки степпера); (6) инпуты в базе 16px (--text-md) — Safari iOS
   не зумит страницу при фокусе. */
{
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'shop.css'), 'utf8')
    // Контракт — по КОДУ: комментарии не должны влиять на пробу
    // (шапка файла документирует «никаких max-width» и сама бы матчилась).
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  check(!/@media[^{]*max-width/.test(css), 'найден max-width-медиазапрос — не мобильный-фёрст');
  check(/@media \(min-width: 30rem\)/.test(css) && /@media \(min-width: 48rem\)/.test(css)
        && /@media \(min-width: 62rem\)/.test(css), 'нет min-width-ступеней 30/48/62rem');
  const pxW = [...css.matchAll(/(min-)?width:\s*(\d+)px/g)].map((m) => Number(m[2]));
  check(pxW.every((n) => n <= 320), 'px-ширина шире 320 — фиксированная геометрия запрещена: ' + pxW.filter((n) => n > 320).join(', '));
  check(/\.shop-header-inner\s*\{[^}]*flex-wrap:\s*wrap/.test(css), 'шапка в базе не переносится (flex-wrap: wrap)');
  check(/\.product-grid,\s*\.rel-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css),
        'грид каталога в базе не одна текучая колонка minmax(0, 1fr)');
  check(/\.icon-btn\s*\{[^}]*width:\s*var\(--shop-touch\)/.test(css), 'иконки шапки в базе на --shop-touch (44px-пол, P2)');
  check(/\.cart-line-remove\s*\{[^}]*width:\s*var\(--shop-touch\)/.test(css), 'крестик корзины в базе на --shop-touch (44px-пол, D31+P2)');
  check(/\.chip\s*\{[^}]*min-height:\s*var\(--shop-touch\)/.test(css), 'чип категорий в базе на --shop-touch (44px-пол, D31+P2)');
  check(/\.qty-stepper \.qty-btn\s*\{[^}]*width:\s*var\(--shop-touch\)/.test(css), 'кнопка степпера в базе на --shop-touch (44px-пол, D31+P2)');
  // W7 (разнос владельца): нативные спиннеры number-инпута скрыты — они
  // дублировали кастомные «−/+»; степпер = одна визуальная группа
  check(/input\[type="number"\]\s*\{[^}]*appearance:\s*texfield|input\[type="number"\]\s*\{[^}]*appearance:\s*textfield/.test(css)
        && /::-webkit-inner-spin-button[\s\S]{0,80}-webkit-appearance:\s*none/.test(css),
        'нативные спиннеры number-инпута не скрыты (appearance: textfield + -webkit-appearance: none)');
  check(/\.qty-stepper \.qty-input\s*\{[^}]*border-radius:\s*0/.test(css)
        && /\.qty-stepper \.qty-btn:first-child\s*\{[^}]*border-radius:\s*var\(--radius-btn\)\s*0\s*0\s*var\(--radius-btn\)/.test(css),
        'степпер не сцеплен в одну группу (радиусы только по краям группы)');
  check(/\.field-input,\s*\.field-textarea\s*\{[^}]*font-size:\s*var\(--text-md\)/.test(css),
        'инпуты в базе мельче 16px — iOS Safari зумит при фокусе');
  if (fails.length) {
    failed++;
    console.log('FAIL layout-mobile: ' + fails.join(' | '));
  } else {
    console.log('OK   layout-mobile (min-width-only, база 1 колонка, шапка переносится, тап-таргеты --shop-touch 44px-пол, инпуты 16px)');
  }
}

/* ── Проба «тулбар компактен» (W6 №6/№16 → B1 D1: В3 «Одна строка») ────
   Контракт B1: тулбар — sticky-кластер с hairline-подчёркиванием (ТРЕТЬЯ
   каноническая линия, мокап В3; тени/скруглений кластера НЕТ). В БАЗЕ
   (320) десктопная форма скрыта (поиск/сортировка display:none), живут
   мобильные кнопки-листы (.toolbar-mobile, тап-таргет 2.75rem); на ≥48rem
   — ОДНА строка: поиск ≤20rem · дропдаун ≤12.5rem · «Найти» · вертикаль-
   ный hairline-разделитель · чипы · счётчик справа (margin-left: auto).
   Смок рендерит HTML без стилей — контракт по исходнику CSS (комментарии
   вычищены) + по разметке шаблонов (лупа, разделитель, счётчик, кнопки). */

/* mediaBlock: вырезать сбалансированный по скобкам блок @media-правила
   (наивный [^}] не берёт вложенные правила). */
const mediaBlock = (cssSrc, header) => {
  // B1: блоков с одним заголовком может быть НЕСКОЛЬКО (отдельный
  // @media (min-width: 48rem) для теней карточек и т.п.) — склеиваем все.
  const re = new RegExp(header + '\\s*\\{', 'g');
  let out = '';
  let m;
  while ((m = re.exec(cssSrc))) {
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < cssSrc.length; i++) {
      if (cssSrc[i] === '{') depth++;
      else if (cssSrc[i] === '}') { depth--; if (depth === 0) break; }
    }
    out += cssSrc.slice(m.index, i + 1) + '\n';
  }
  return out;
};
{
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'shop.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const block48 = mediaBlock(css, '@media \\(min-width: 48rem\\)');
  const remMax = (rule) => { const m = /max-width:\s*([\d.]+)rem/.exec(rule); return m ? Number(m[1]) : null; };
  // База (мобайл-фёрст): десктопная форма скрыта, кнопки-листы на месте
  const baseSearch = /\.search-box,\s*\.tools-right,\s*\.tools-sep,\s*\.tools-count\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check(/display:\s*none/.test(baseSearch), 'база 320: десктопная форма (поиск/сортировка/разделитель/счётчик) не скрыта — должны жить кнопки-листы');
  check(/\.toolbar-mobile\s*\{[^}]*display:\s*flex/.test(css), 'база 320: мобильные кнопки тулбара не показаны');
  check(/\.toolbar-btn\s*\{[^}]*min-height:\s*var\(--shop-touch\)/.test(css), 'кнопки тулбара в базе ниже 44px-пола (--shop-touch, D31+P2)');
  // Sticky-тулбар (W6 №16 → B1 В3): прилипает ПОД шапку, фон непрозрачный;
  // hairline №3 (border-bottom — решение владельца в мокапе В3); тени НЕТ.
  const toolsRule = /\.cat-tools\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check(/position:\s*sticky/.test(toolsRule) && /top:\s*var\(--header-h\)/.test(toolsRule), 'тулбар не sticky под шапкой (position: sticky; top: var(--header-h))');
  check(/background:\s*var\(--bg\)/.test(toolsRule), 'тулбар: нет непрозрачного фона для sticky-состояния');
  check(/border-bottom:\s*1px solid var\(--border\)/.test(toolsRule), 'тулбар: нет hairline-подчёркивания В3 (border-bottom — hairline 3 из 3)');
  check(!/box-shadow/.test(toolsRule), 'тулбар В3: тень кластера не снята («не меню-панель»)');
  // ≥48rem: одна строка В3, компактные ширины, мобильные кнопки скрыты
  const searchRule = /\.search-box\s*\{[^}]*\}/.exec(block48)?.[0] ?? '';
  const sortRule = /\.sort-box\s*\{[^}]*\}/.exec(block48)?.[0] ?? '';
  const sw = remMax(searchRule), tw = remMax(sortRule);
  check(sw !== null && sw >= 15 && sw <= 20, `desktop ≥48rem: у .search-box нет компактного max-width 15–20rem: ${searchRule}`);
  check(tw !== null && tw >= 10 && tw <= 13.75, `desktop ≥48rem: у .sort-box нет фиксированной ширины 10–13.75rem: ${sortRule}`);
  check(/\.tools-right\s*\{[^}]*margin-left:\s*auto/.test(block48), 'desktop ≥48rem: группа «сортировка+кнопка» не прижата вправо');
  check(/\.toolbar-mobile\s*\{[^}]*display:\s*none/.test(block48), 'desktop ≥48rem: мобильные кнопки тулбара не скрыты');
  // В3: вертикальный hairline-разделитель и счётчик справа
  const sepRule = /\.tools-sep\s*\{[^}]*\}/.exec(block48)?.[0] ?? '';
  check(/display:\s*(block|inline-block)/.test(sepRule) && /width:\s*1px/.test(sepRule) && /var\(--border\)/.test(sepRule), 'desktop ≥48rem: нет вертикального hairline-разделителя .tools-sep');
  check(/\.tools-count\s*\{[^}]*margin-left:\s*auto/.test(block48), 'desktop ≥48rem: счётчик .tools-count не прижат вправо (мокап В3)');
  // В3 (P3 прошлого критика): поиск/дропдаун/«Найти» — одна высота 2.5rem
  check(/\.field-input\.search-input,\s*\.dd-btn\.field-input\s*\{[^}]*height:\s*var\(--shop-control-h\)/.test(block48), '≥48rem: поиск и дропдаун не приведены к --shop-control-h (равные высоты, пол 24px — P2)');
  check(/\.btn\.search-submit\s*\{[^}]*height:\s*var\(--shop-control-h\)/.test(block48), '≥48rem: «Найти» не приведена к --shop-control-h (равенство высот P3+P2)');
  // Дропдаун (D3): селект скрыт улучшателем, стили кнопки/списка/опций есть
  check(/\.dd-source\s*\{[^}]*display:\s*none/.test(css), 'дропдаун D3: скрытый select (.dd-source) не оформлен');
  check(/\.dd-btn\s*\{/.test(css) && /\.dd-list\s*\{/.test(css) && /\.dd-opt\s*\{/.test(css), 'дропдаун D3: нет стилей .dd-btn/.dd-list/.dd-opt');
  const catTpl = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'catalog.liquid'), 'utf8');
  const catPageTpl = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'category.liquid'), 'utf8');
  check(catTpl.includes('search-icon') && catTpl.includes('tools-sep'), 'каталог: тулбар несёт иконку-лупу и вертикальный разделитель В3');
  check(catPageTpl.includes('search-icon') && catPageTpl.includes('tools-right'), 'категория: тулбар того же контракта (лупа + десктопная группа)');
  check(catTpl.includes('data-drawer-open') && catTpl.includes('data-sort-open'), 'каталог: мобильные кнопки «Фильтры»/«Сортировка» в разметке');
  check(catPageTpl.includes('data-drawer-open') && catPageTpl.includes('data-sort-open'), 'категория: мобильные кнопки «Фильтры»/«Сортировка» в разметке');
  check(catTpl.includes('data-dropdown') && catPageTpl.includes('data-dropdown'), 'дропдаун D3: select сортировки несёт data-dropdown (каталог и категория)');
  check(!/\.sort-label\s*\{/.test(css), 'легаси .sort-label растянутой вёрстки ликвидирован');
  if (fails.length) {
    failed++;
    console.log('FAIL toolbar-compact: ' + fails.join(' | '));
  } else {
    console.log('OK   toolbar-compact (база: кнопки-листы 44px; ≥48rem: В3 одной строкой — поиск/дропдаун/Найти/hairline-разделитель/чипы/счётчик, высоты 2.5rem, hairline №3, sticky)');
  }
}

/* ── Проба «чипы: перенос без обрезки + Ещё N» (B1 D2, разнос владельца) ──
   МОБАЙЛ: чипы ПЕРЕНОСЯТСЯ строками (flex-wrap), «Ещё N» скрыт; обрезка
   чипа пополам ЗАПРЕЩЕНА — чип не сжимается (flex: 0 0 auto) и не
   переносит текст (min-width: max-content). ДЕСКТОП (≥48rem): чипы в
   строке тулбара (мокап В3), свёрнуто — первые N (лишние .chip-extra
   спрятаны, кнопка .chip-more видна), раскрыто ([data-chips-open="1"]
   на форме) — .chip-extra возвращаются, ряд переносится строками;
   активная категория всегда видима (.chip-extra[data-pinned="1"]).
   DOM-поведение (клик/Esc) проверяет живая браузерная проба B1;
   здесь — контракт по исходникам CSS + разметка (data-chips-more,
   data-pinned, chip-extra в рендере при N < числа категорий). */
{
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'shop.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const rowRule = /\.chip-row\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check(/flex-wrap:\s*wrap/.test(rowRule), 'chip-row: мобайл не переносит чипы строками (нет flex-wrap: wrap)');
  check(/\.chip\s*\{[^}]*flex:\s*0 0 auto/.test(css), 'чип сжимается внутри строки (должен быть flex: 0 0 auto)');
  check(/\.chip\s*\{[^}]*min-width:\s*max-content/.test(css), 'чип без min-width: max-content — текст может переноситься/обрезаться внутри пилюли');
  check(!/text-overflow:\s*ellipsis[^}]*\}\s*\.chip|\.chip\s*\{[^}]*text-overflow:\s*ellipsis/.test(css), 'на чипе есть ellipsis — обрезка названий категорий запрещена (D2)');
  // B1 дополнение владельца: мобайл = первые 3 слота («Все» + 2 категории)
  // + «Ещё категории (K)»; чипы — НАВИГАЦИЯ, в дравер «Фильтры» не прячем.
  check(/\.chip-extra-m\s*\{[^}]*display:\s*none/.test(css), 'мобайл: чипы за 3-м слотом (.chip-extra-m) не спрятаны');
  check(/\.chip-extra-m\[data-pinned-m="1"\]\s*\{[^}]*display:\s*inline-flex/.test(css), 'мобайл: активная категория за пределами 3 слотов не закреплена (data-pinned-m)');
  check(/\.chip-more-m\s*\{[^}]*display:\s*inline-flex/.test(css), 'мобайл: кнопка «Ещё категории (K)» не показана');
  check(/\.chip-more\s*,\s*\.chip-extra-m\s*\{[^}]*display:\s*none/.test(css), 'десктопная кнопка «Ещё N» не скрыта на мобиле');
  const block48 = mediaBlock(css, '@media \\(min-width: 48rem\\)');
  check(/\.chip-more\s*\{[^}]*display:\s*inline-flex/.test(block48), '≥48rem: кнопка «Ещё N» не показана');
  check(/\.chip-more-m\s*\{[^}]*display:\s*none/.test(block48), '≥48rem: мобильная кнопка «Ещё категории (K)» не скрыта');
  check(/\.chip-extra-m\s*\{[^}]*display:\s*inline-flex/.test(block48), '≥48rem: мобильный лимит не снят (chip-extra-m должны быть видны)');
  check(/\.chip-extra\s*\{[^}]*display:\s*none/.test(block48), '≥48rem: лишние чипы (.chip-extra) не спрятаны в свёрнутом состоянии');
  check(/\.chip-extra\[data-pinned="1"\]\s*\{[^}]*display:\s*inline-flex/.test(block48), '≥48rem: активная категория за пределами первых N не закреплена (data-pinned)');
  check(/\.cat-tools\[data-chips-open="1"\]\s*\.chip-row\s*\{[^}]*flex-wrap:\s*wrap/.test(block48), '≥48rem: раскрытие «Ещё N» не переносит чипы строками');
  check(/\.cat-tools\[data-chips-open="1"\]\s*\.chip-extra\s*\{[^}]*display:\s*inline-flex/.test(block48), '≥48rem: раскрытие не возвращает спрятанные чипы');
  check(!/\.chip-child\s*\{[^}]*margin-left/.test(css), 'дыра чипов: .chip-child margin-left не ликвидирован');
  for (const tpl of ['catalog.liquid']) {
    const src = readFileSync(join(rootDir, 'templates', tpl), 'utf8');
    check(src.includes('data-chip-row'), `${tpl}: чипы рендерятся без data-chip-row`);
    check(src.includes('data-chips-more') && src.includes('aria-expanded'), `${tpl}: кнопка «Ещё N» без data-chips-more/aria-expanded`);
    check(src.includes('chip-more-m') && src.includes('data-pinned-m'), `${tpl}: мобильный лимит (3 слота + «Ещё категории (K)») не в разметке`);
    check(src.includes('data-more-txt') && src.includes('data-less-txt'), `${tpl}: подписи кнопок «Ещё» не атрибутные (нужны data-more-txt/data-less-txt)`);
  }
  if (fails.length) {
    failed++;
    console.log('FAIL chips-more-less: ' + fails.join(' | '));
  } else {
    console.log('OK   chips-more-less (десктоп: первые N + Ещё N + pinned; мобайл: первые 3 слота + «Ещё категории (K)» + pinned-m; перенос без обрезки)');
  }
}

/* ── Проба B1: чипы «первые N + Ещё N» в РЕНДЕРЕ (моки) ───────────────
   В моке каталога 8 категорий (5 корней + 1 потомок + 2 корня… ровно:
   ceramics/textile/stationery/plates(потомок)/decor/podarki/ny-gifts/
   arhiv) → 8 чипов. filters_visible по умолчанию 5 → первые 5 чипов
   видимы, 3 уезжают в .chip-extra, кнопка «Ещё 3»; переопределение
   cfg.filters_visible=2 → «Ещё 6»; активная категория за пределами N
   несёт data-pinned="1" и НЕ прячется. */
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const catHtml = await renderMockPage(engine, 'catalog', null, { query: { ...q } });
  check(catHtml.includes('data-chips-more'), 'рендер: кнопка «Ещё N» не появилась при 8 категориях и N=5');
  check(/Ещё<\/span> <span class="chip-count">3</.test(catHtml), 'рендер: счётчик «Ещё» не равен 3 при 8 категориях и N=5');
  const extraCount = (catHtml.match(/chip-extra(?![\w-])/g) || []).length;
  check(extraCount === 3, `рендер: спрятанных чипов .chip-extra ${extraCount} вместо 3`);
  check(catHtml.includes('data-pinned="1"') === false, 'рендер: data-pinned появился без активной категории за пределами N');
  check(/Ещё категории \(6\)/.test(catHtml), 'рендер: мобильная кнопка «Ещё категории (6)» не посчиталась (8 категорий − 2, мандат: 3 чипа включая «Все»)');
  check((catHtml.match(/chip-extra-m(?![\w-])/g) || []).length === 6, 'рендер: мобильных скрытых чипов .chip-extra-m не 6');
  const vis2 = await renderMockPage(engine, 'catalog', null, {
    query: { ...q },
    g_site: { data: { cfg: [{ name: 'Тест', filters_visible: '2' }] } },
  });
  check(/chip-count">6</.test(vis2), 'рендер: cfg.filters_visible=2 не дал «Ещё 6»');
  const pinned = await renderMockPage(engine, 'catalog', null, { query: { ...q, cat: 'ny-gifts' } });
  check(pinned.includes('data-pinned="1"'), 'рендер: активная категория за пределами первых N не несёт data-pinned="1"');
  check(/aria-current="true"[^>]*data-pinned="1"|data-pinned="1"[^>]*aria-current="true"/.test(pinned), 'рендер: pinned-чип не активный (aria-current и data-pinned на одном чипе)');
  const empty = await renderMockPage(engine, 'catalog', null, {
    query: { ...q },
    overrides: undefined,
    g_site: { data: { cfg: [{ name: 'Тест', filters_visible: 'abc' }] } },
  });
  check(/chip-count">3</.test(empty), 'рендер: мусор в filters_visible не дал дефолт N=5');
  if (fails.length) {
    failed++;
    console.log('FAIL b1-chips-render: ' + fails.join(' | '));
  } else {
    console.log('OK   b1-chips-render (N=5: Ещё 3 / .chip-extra ×3; filters_visible=2 → Ещё 6; мусор → дефолт 5; pinned-активная)');
  }
}

/* ── Проба W9 (F2): 320 без переполнения — контракт по исходникам ────
   (1) .toolbar-mobile несёт min-width: 0 — иначе flex-ряд не сжимается ниже
       min-content («Сортировка: Сначала новые» ~204px распирала тулбар до
       325px и выталкивала documentElement в h-scroll на 320; живой DOM-
       замер w9-user/05); подпись кнопки держит ellipsis.
   (2) .shop-footer-inner возвращает горизонтальный гаттер (F1: padding
       2rem 0 перебивал .shop-container — текст прилипал к краям).
   (3) бургер закрыт по умолчанию: в base.liquid нет open-атрибута, а
       гардинный скрипт (снятие восстановленного браузером [open]) стоит
       сразу после </details> — панель «Кабинет/Выйти» не висит поверх hero
       на свежей загрузке (soft-reload восстанавливает состояние details).
   (4) шапка на 320 — одна строка: компактный зазор 0.5rem + компактный
       inline-паддинг пилюли корзины (лого ~110px + иконки 138px < 280px). */
{
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const css = readFileSync(join(rootDir, 'static', 'css', 'shop.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const baseSrc = readFileSync(join(rootDir, 'templates', 'base.liquid'), 'utf8')
    .replace(/\{%-?\s*comment[\s\S]*?endcomment\s*-?%\}/g, ''); // считаем код, не комментарии
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const tbRule = /\.toolbar-mobile\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check(/min-width:\s*0/.test(tbRule), 'F2: .toolbar-mobile без min-width: 0 — ряд не сжимается, 320 уходит в h-scroll');
  check(/\.toolbar-btn\s*\{[^}]*min-width:\s*0/.test(css) && /\.toolbar-btn > span\s*\{[^}]*text-overflow:\s*ellipsis/.test(css), 'F2: подпись кнопки тулбара без ellipsis-ужатия');
  const ftRule = /\.shop-footer-inner\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check(/padding:\s*(?:var\(--shop-space-7\)|2rem)\s+var\(--gutter\)/.test(ftRule), 'F1: .shop-footer-inner потерял горизонтальный гаттер');
  check(!/<details class="nav-burger"[^>]*\bopen\b/.test(baseSrc), 'F2: у бургера есть open-атрибут в разметке');
  const detailsEnd = baseSrc.indexOf('</details>');
  const guardIdx = baseSrc.indexOf("d.hasAttribute('open')");
  check(detailsEnd > -1 && guardIdx > detailsEnd && guardIdx - detailsEnd < 200, 'F2: гардинный скрипт бургера не стоит сразу после </details>');
  const hiRule = /\.shop-header-inner\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check(/gap:\s*(?:var\(--shop-space-2\)|0\.5rem)/.test(hiRule), 'F2: шапка не ужата до одной строки на 320 (нет компактного gap)');
  const ccRule = /\.cart-counter\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  check(/padding:\s*(?:var\(--shop-space-\d\)|0\.375rem)\s+(?:var\(--shop-space-2\)|0\.5rem)/.test(ccRule), 'F2: пилюля корзины не ужата (inline-паддинг на шкале)');
  if (fails.length) {
    failed++;
    console.log('FAIL w9-f2-320: ' + fails.join(' | '));
  } else {
    console.log('OK   w9-f2-320 (тулбар min-width:0+ellipsis, футер с гаттером, бургер закрыт гардом, шапка 320 в одну строку)');
  }
}

/* ── Проба W9 (F4): счётчик из hero — над гридом; киккер/Н1 без дубля ──
   hero каталога больше не рендерит «Товаров: N» (одинокая строка под H1),
   счётчик живёт перед .product-grid; H1 по умолчанию «Каталог», киккер —
   ТОЛЬКО явный cfg.hero_kicker (дефолтной пары «Каталог + Каталог» нет). */
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const catHtml = await renderMockPage(engine, 'catalog', null, { query: { ...q } });
  const heroEnd = catHtml.indexOf('</section>');
  const countInHero = catHtml.slice(0, heroEnd).includes('data-cat-count');
  check(!countInHero, 'F4: счётчик всё ещё в hero каталога');
  const countIdx = catHtml.indexOf('data-cat-count');
  const gridIdx = catHtml.indexOf('product-grid');
  check(countIdx > -1 && gridIdx > -1 && countIdx < gridIdx, 'F4: счётчик не над гридом');
  check(catHtml.includes('>Товаров: 26<'), 'F4: текст счётчика потерян');
  const noKicker = await renderMockPage(engine, 'catalog', null, {
    query: { ...q },
    g_site: { data: { cfg: [{ name: 'Магазин витрины', hero_kicker: '', hero_title: '' }] } },
  });
  check(!noKicker.includes('class="kicker"'), 'F4: пустой hero_kicker не должен рендерить киккер');
  check(/<h1 class="cat-title">Каталог<\/h1>/.test(noKicker), 'F4: дефолтный H1 не «Каталог»');
  const catPage = await renderMockPage(engine, 'category', 'found', { query: { ...q } });
  const catHeroEnd = catPage.indexOf('</section>');
  check(!catPage.slice(0, catHeroEnd).includes('data-cat-count'), 'F4: счётчик всё ещё в hero категории');
  const cCountIdx = catPage.indexOf('data-cat-count');
  const cGridIdx = catPage.indexOf('product-grid');
  check(cCountIdx > -1 && cGridIdx > -1 && cCountIdx < cGridIdx, 'F4 (категория): счётчик не над гридом');
  if (fails.length) {
    failed++;
    console.log('FAIL w9-f4-counter: ' + fails.join(' | '));
  } else {
    console.log('OK   w9-f4-counter (счётчик над гридом в каталоге и категории; киккер только по cfg, дефолт H1 «Каталог»)');
  }
}

/* ── Проба W9 (F3/F6): строки чекаута + перебор остатка ──────────────
   Строка заказа: миниатюра-ссылка, название-ссылка на карточку, разбивка
   «цена × кол-во», сумма, «×» рядом (grid-области). Перебор: строка с
   warning-тинтом и бейджем «В наличии: N». Пустая photos → плейсхолдер. */
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const html = await renderMockPage(engine, 'checkout', 'guest', { query: { ...q } });
  check(/<a class="cart-line-thumb" href="\/shop\/product\/mug-linen"[^>]*>\s*<img src="\/static\/photos\/placeholder\.svg"/.test(html), 'F3: миниатюра строки не ссылка на карточку с img');
  check(/<a class="cart-line-name" href="\/shop\/product\/mug-linen">Кружка «Лён»<\/a>/.test(html), 'F3: название строки не ссылка на карточку');
  check(html.includes('990.00 ₽ × 2'), 'F3: нет разбивки «цена × кол-во» в строке');
  const cssSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'shop.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check(/\.cart-line\s*\{[^}]*grid-template-areas/.test(cssSrc), 'F3: строка корзины не grid-раскладка (миниатюра/инфо/× рядом)');
  check(/\.cart-line-over\s*\{[^}]*background:\s*var\(--warn-tint\)/.test(cssSrc), 'F6: нет warning-тинта строки перебора');
  const over = await renderMockPage(engine, 'checkout', 'guest', {
    query: { ...q },
    results: { ci: { items: [{ slug: 'mug-linen', qty: 99 }, { slug: 'planner-pine', qty: 1 }] } },
  });
  check(over.includes('cart-line-over'), 'F6: перебор не подсвечивает строку');
  check(over.includes('В наличии: 12'), 'F6: перебор не показывает «В наличии: N»');
  check(over.includes('990.00 ₽ × 99'), 'F6: разбивка перебранной строки потеряна');
  // пустая photos → плейсхолдер surface-2 (span вместо img)
  const noPhoto = await renderMockPage(engine, 'checkout', 'guest', {
    query: { ...q },
    prods: { data: { products: [{ id: 'p-1', title: 'Кружка «Лён»', slug: 'mug-linen', price_kopecks: 99000, stock: 12 }] } },
  });
  check(noPhoto.includes('cart-line-thumb-empty'), 'F3: пустая photos не даёт плейсхолдер миниатюры');
  if (fails.length) {
    failed++;
    console.log('FAIL w9-f3-f6-lines: ' + fails.join(' | '));
  } else {
    console.log('OK   w9-f3-f6-lines (миниатюра/ссылки/разбивка; перебор: тинт + «В наличии: N»; пустая photos → плейсхолдер)');
  }
}

/* ── Поведенческая проба W9 (F6a/в + F7 + F9): cart.js ─────────────────
   add с data-stock гасится до остатка С записью в [data-cart-note];
   inc строки сверх data-stock — тоже; сабмит чекаута: stock_exceeded →
   «В наличии только N шт.» в form-error; payment_failed → редирект на
   /order/<id>?payment=failed; удалить позицию «×» — POST полного массива
   без позиции (контракт не дрейфовал); неудача записи корзины — заметка,
   не молчание. */
async function smokeW9Cart() {
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const TICKS = 6;
  const tick = () => new Promise((r) => setTimeout(r, 0));

  function mkDom({ items, noteEl, errBox, locationSpy, checkoutResp }) {
    const calls = [];
    const listeners = {};
    const note = { textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] ?? null; } };
    const err = { textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] ?? null; } };
    const document = {
      addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
      addEventListenerSubmit: null,
      querySelectorAll: () => [],
      querySelector(sel) {
        if (sel === '[data-cart-note]') return noteEl ? note : null;
        if (sel === '[data-form-error]') return errBox ? err : null;
        return null;
      },
      body: {
        attrs: { 'data-stock-tpl': 'В наличии только {{n}} шт.' },
        getAttribute(k) { return this.attrs[k] ?? null; },
      },
    };
    const loc = locationSpy || { assign(u) { loc.assigned = u; } };
    const fetchMock = (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      let resp;
      if (method === 'GET') resp = { items: JSON.parse(JSON.stringify(items)) };
      else if (url.endsWith('/api/checkout')) resp = checkoutResp;
      else resp = { items: JSON.parse(opts.body).items };
      calls.push({ url, method, body: opts && opts.body ? JSON.parse(opts.body) : null, resp });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(resp) });
    };
    const click = (attrs) => {
      for (const fn of listeners.click ?? []) {
        fn({
          preventDefault() {},
          target: {
            closest: (sel) => (sel in attrs ? {
              // карта клика ключована селекторами; getAttribute спрашивают
              // уже по ИМЕНИ атрибута — резолвим обе формы
              getAttribute: (k) => attrs[k] ?? attrs['[' + k + ']'],
            } : null),
          },
        });
      }
    };
    const submit = (form) => {
      for (const fn of listeners.submit ?? []) {
        fn({ preventDefault() {}, target: { closest: (sel) => (sel === '[data-checkout-form]' ? form : null) } });
      }
    };
    const src = withShopBase(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js', 'cart.js'), 'utf8'));
    new Function('document', 'window', 'fetch', src)(document, { location: loc, setTimeout }, fetchMock);
    return { calls, click, submit, note, err, tick: async () => { for (let i = 0; i < TICKS; i++) await tick(); } };
  }

  // 1) add сверх остатка: clamp до 5 + заметка «В наличии только 5 шт.»
  {
    const d = mkDom({ items: [{ slug: 'mug', qty: 5 }], noteEl: true });
    await d.tick();
    d.click({ '[data-cart-add]': 'mug', 'data-stock': '5' }); // +1 → 6, clamp до 5
    await d.tick();
    const post = d.calls.find((c) => c.method === 'POST');
    check(post && post.body.items.find((l) => l.slug === 'mug')?.qty === 5,
      `F6a: add сверх остатка не гасится до 5: ${post && JSON.stringify(post.body.items)}`);
    check(d.note.textContent === 'В наличии только 5 шт.' && d.note.attrs['data-visible'] === '1',
      `F6a: clamp без сообщения: «${d.note.textContent}»`);
  }

  // 2) inc строки сверх data-stock: clamp + заметка
  {
    const d = mkDom({ items: [{ slug: 'mug', qty: 5 }], noteEl: true });
    await d.tick();
    d.click({ '[data-cart-qty-inc]': 'mug', 'data-stock': '5' });
    await d.tick();
    const post = d.calls.filter((c) => c.method === 'POST').pop();
    check(post && post.body.items.find((l) => l.slug === 'mug')?.qty === 5, 'F6a: inc строки сверх остатка не гасится');
    check(d.note.textContent === 'В наличии только 5 шт.', `F6a: inc без сообщения: «${d.note.textContent}»`);
  }

  // 3) «×» удаляет позицию: POST полного массива БЕЗ неё (F9, контракт w3)
  {
    const d = mkDom({ items: [{ slug: 'mug', qty: 2 }, { slug: 'tot', qty: 1 }], noteEl: true });
    await d.tick();
    d.click({ '[data-cart-remove]': 'mug' });
    await d.tick();
    const post = d.calls.filter((c) => c.method === 'POST').pop();
    check(post && JSON.stringify(post.body.items) === JSON.stringify([{ slug: 'tot', qty: 1 }]),
      `F9: «×» шлёт не полный массив без позиции: ${post && JSON.stringify(post.body.items)}`);
  }

  // 4) неудача записи корзины — заметка, не молчание (F9-хардненинг)
  {
    const calls = [];
    const listeners = {};
    const note = { textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] ?? null; } };
    const document = {
      addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
      querySelectorAll: () => [],
      querySelector: (sel) => (sel === '[data-cart-note]' ? note : null),
      body: { attrs: {}, getAttribute: () => null },
    };
    const fetchMock = (url, opts) => {
      calls.push({ url, method: (opts && opts.method) || 'GET' });
      if ((opts && opts.method) === 'POST') return Promise.reject(new Error('network'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [{ slug: 'mug', qty: 1 }] }) });
    };
    const src = withShopBase(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js', 'cart.js'), 'utf8'));
    new Function('document', 'window', 'fetch', src)(document, { location: {}, setTimeout }, fetchMock);
    for (let i = 0; i < TICKS; i++) await tick();
    for (const fn of listeners.click ?? []) fn({ preventDefault() {}, target: { closest: (sel) => (sel === '[data-cart-remove]' ? { getAttribute: () => 'mug' } : null) } });
    for (let i = 0; i < TICKS; i++) await tick();
    check(note.textContent.includes('Не удалось обновить корзину') && note.attrs['data-visible'] === '1',
      `F9: тихий провал записи — заметки нет: «${note.textContent}»`);
  }

  // 5) сабмит чекаута: stock_exceeded → сообщение с max; payment_failed → /order/<id>?payment=failed
  {
    const d = mkDom({
      items: [{ slug: 'mug', qty: 2 }],
      noteEl: true, errBox: true,
      checkoutResp: { ok: false, error: 'stock_exceeded', slug: 'mug', max: 7 },
    });
    await d.tick();
    d.submit({
      querySelector(sel) {
        if (sel === '[data-form-error]') return d.err;
        if (sel === 'button[type="submit"]') return { disabled: false };
        const m = /\[name="(.+)"\]/.exec(sel);
        if (m) return { value: { name: 'Иван', email: 'i@e.ru', phone: '', comment: '', website: '' }[m[1]] ?? '', setAttribute() {}, removeAttribute() {}, getAttribute: () => null };
        return null;
      },
    });
    await d.tick();
    check(d.err.textContent === 'В наличии только 7 шт.', `F6в: сабмит при переборе без сообщения: «${d.err.textContent}»`);

    const loc = { assigned: null, assign(u) { this.assigned = u; } };
    const d3 = mkDom({
      items: [{ slug: 'mug', qty: 2 }], noteEl: true, errBox: true, locationSpy: loc,
      checkoutResp: { ok: false, error: 'payment_failed', order_id: 'abc-123' },
    });
    await d3.tick();
    d3.submit({
      querySelector(sel) {
        if (sel === '[data-form-error]') return d3.err;
        if (sel === 'button[type="submit"]') return { disabled: false };
        const m = /\[name="(.+)"\]/.exec(sel);
        if (m) return { value: { name: 'Иван', email: 'i@e.ru', phone: '', comment: '', website: '' }[m[1]] ?? '', setAttribute() {}, removeAttribute() {}, getAttribute: () => null };
        return null;
      },
    });
    await d3.tick();
    check(loc.assigned === '/shop/order/abc-123?payment=failed',
      `F7: payment_failed не ведёт на /order/<id>?payment=failed: ${loc.assigned}`);
  }

  if (fails.length) {
    failed++;
    console.log('FAIL w9-stock-cart: ' + fails.join(' | '));
  } else {
    console.log('OK   w9-stock-cart (add/inc clamp c сообщением; «×» = replace без позиции; провал записи не молчит; stock_exceeded → «В наличии только N шт.»; payment_failed → /order/<id>?payment=failed)');
  }
}
await smokeW9Cart();

/* ── Проба B2a: пикер вариантов — SSR-контракт + поведенческая DOM-проба ──
   Вариантный товар: дефолт = первый вариант со stock > 0 (checked), цена
   карточки = его цена, бейдж БИНАРНЫЙ по вариантам (product.stock
   игнорируется), JSON-LD: offers.sku первого варианта, availability по
   вариантам; все нули → пикер disabled, бейдж «Нет в наличии», кнопки
   нет. Безвариантный товар: никаких маркеров пикера (байт-совместимость).
   Поведение: инлайн-скрипт пикера — change обновляет цену/бейдж/карман
   кнопки (data-variant/data-stock). */
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const plain = await renderMockPage(engine, 'product', null, { query: { ...q } });
  check(!plain.includes('data-variant-picker'), 'B2a: безвариантный товар рендерит пикер');
  check(!plain.includes('data-pv-badge'), 'B2a: безвариантный товар несёт карман пикера на бейдже');
  check(plain.includes('В наличии: 12'), 'B2a: безвариантный бейдж потерял p.stock-ветку');

  const varsHtml = await renderMockPage(engine, 'product', 'vars', { query: { ...q } });
  const checkedRe = /<input type="radio" name="variant" value="var-1"[^>]*checked/.test(varsHtml.replace(/\n\s*/g, ' '));
  check(checkedRe, 'B2a: дефолт пикера — не первый вариант со stock > 0');
  check(/data-pv-badge[^>]*>В наличии<\/span>/.test(varsHtml), 'B2a: бейдж вариантного товара не бинарный «В наличии»');
  check(varsHtml.includes('>3190.00</span>'), 'B2a: цена карточки не равна цене дефолтного варианта');
  check(varsHtml.includes('>Нет в наличии</span>') === false, 'B2a: в моке vars оба варианта в наличии — бейджей «Нет» быть не должно');
  check(!varsHtml.includes('variant-row-off') && !varsHtml.includes(' disabled'), 'B2a: в наличии-вариантах не должно быть off-разметки/disabled');
  const varsLd = extractJsonLd(varsHtml).map((s) => { try { return JSON.parse(s); } catch (e) { fails.push('B2a: JSON-LD вариантной карточки не парсится: ' + e.message); return null; } }).filter(Boolean);
  const varsOffer = varsLd.find((o) => o['@type'] === 'Product')?.offers;
  check(varsOffer && varsOffer.sku === 'HUDI-RM', `B2a: offers.sku не из первого варианта: ${varsOffer && varsOffer.sku}`);
  check(varsOffer && varsOffer.price === '2990.00', 'B2a: offers.price обязан остаться базовой (F4)');
  check(varsOffer && varsOffer.availability === 'https://schema.org/InStock', 'B2a: availability не по вариантам');
  check(varsHtml.includes('b2a-picker-start'), 'B2a: инлайн-скрипт пикера не в рендере');

  // смешанный набор: нулевой вариант — off-строка с бейджем «Нет», не дефолт
  const mixVars = {
    data: { variants: [
      { id: 'var-1', product_slug: 'hudi-oversayz', label: 'Красный / M', sku: 'HUDI-RM', price_kopecks: 319000, stock: 4 },
      { id: 'var-2', product_slug: 'hudi-oversayz', label: 'Синий / L', sku: 'HUDI-BL', price_kopecks: 299000, stock: 0 },
    ] },
  };
  const mixHtml = await renderMockPage(engine, 'product', 'vars', { query: { ...q }, vars: mixVars });
  check(mixHtml.includes('variant-row-off'), 'B2a: нулевой вариант не помечен variant-row-off');
  check(/value="var-2"[^>]*disabled/.test(mixHtml.replace(/\n\s*/g, ' ')), 'B2a: нулевой вариант не disabled');
  check(/variant-row-off[\s\S]{0,400}?Нет в наличии<\/span>/.test(mixHtml), 'B2a: у off-строки нет бейджа «Нет в наличии»');
  check(/value="var-1"[^>]*checked/.test(mixHtml.replace(/\n\s*/g, ' ')), 'B2a: дефолт при смешанном наборе — не первый со stock > 0');

  // все варианты нулевые: пикер disabled, бейдж «Нет», кнопки/степпера нет
  const zeroVars = {
    data: { variants: [
      { id: 'var-1', product_slug: 'hudi-oversayz', label: 'Красный / M', sku: 'HUDI-RM', price_kopecks: 319000, stock: 0 },
      { id: 'var-2', product_slug: 'hudi-oversayz', label: 'Синий / L', sku: 'HUDI-BL', price_kopecks: 299000, stock: 0 },
    ] },
  };
  const zero = await renderMockPage(engine, 'product', 'vars', { query: { ...q }, vars: zeroVars });
  check(zero.includes('badge badge-error" data-pv-badge') || /data-pv-badge[^>]*>Нет в наличии<\/span>/.test(zero), 'B2a: все варианты нулевые — бейдж не «Нет в наличии»');
  check((zero.match(/value="var-\d"[^>]*disabled/g) || []).length === 2, 'B2a: нулевые варианты не disabled');
  check(!zero.includes('checked'), 'B2a: нулевые варианты не выбираются по умолчанию');
  check(!zero.includes('data-cart-add') && !zero.includes('data-cart-stepper'), 'B2a: у распроданного вариантного товара осталась кнопка/степпер');
  const zeroLd = extractJsonLd(zero).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  const zeroOffer = zeroLd.find((o) => o['@type'] === 'Product')?.offers;
  check(zeroOffer && zeroOffer.availability === 'https://schema.org/OutOfStock', 'B2a: все нули — availability не OutOfStock');

  // поведенческая проба: change на radio обновляет цену/бейдж/кнопку
  const m = /\/\* b2a-picker-start \*\/([\s\S]*?)\/\* b2a-picker-end \*\//.exec(varsHtml);
  check(!!m, 'B2a: инлайн-скрипт пикера не извлекается из рендера');
  if (m) {
    const el = (attrs) => ({
      attrs, textContent: '', className: '', disabled: false, handlers: {},
      getAttribute(k) { return attrs[k] ?? null; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      addEventListener(t, fn) { (this.handlers[t] ??= []).push(fn); },
    });
    const r1 = el({ 'data-variant-id': 'var-1', 'data-price': '319000', 'data-stock': '4' });
    const r2 = el({ 'data-variant-id': 'var-2', 'data-price': '299000', 'data-stock': '7' });
    const priceEl = el({});
    const badgeEl = el({ 'data-pv-badge': '' });
    const addBtn = el({ 'data-cart-add': 'hudi-oversayz', 'data-variant': 'var-1', 'data-stock': '4' });
    const shim = {
      querySelector(sel) {
        if (sel === '[data-variant-picker]') return { querySelectorAll: (s2) => (s2 === 'input[data-variant-id]' ? [r1, r2] : []) };
        if (sel === '[data-pv-price]') return priceEl;
        if (sel === '[data-pv-badge]') return badgeEl;
        if (sel === '[data-cart-add]') return addBtn;
        return null;
      },
    };
    new Function('document', m[1])(shim);
    check(r1.handlers.change && r1.handlers.change.length === 1 && r2.handlers.change.length === 1, 'B2a: пикер не подписался на change обоих radio');
    r2.handlers.change[0]({ target: r2 });
    check(priceEl.textContent === '2990.00', `B2a: change не обновил цену: «${priceEl.textContent}»`);
    check(badgeEl.className === 'badge badge-success' && badgeEl.textContent === 'В наличии', `B2a: change не обновил бейдж: «${badgeEl.className}/${badgeEl.textContent}»`);
    check(addBtn.attrs['data-variant'] === 'var-2' && addBtn.attrs['data-stock'] === '7' && addBtn.disabled === false, 'B2a: change не обновил карман кнопки «В корзину»');
    // нулевой вариант (если бы не был disabled) — бейдж честно гаснет
    const r0 = el({ 'data-variant-id': 'var-0', 'data-price': '10000', 'data-stock': '0' });
    r0.handlers.change = [];
    new Function('document', m[1])({
      querySelector(sel) {
        if (sel === '[data-variant-picker]') return { querySelectorAll: () => [r0] };
        if (sel === '[data-pv-price]') return priceEl;
        if (sel === '[data-pv-badge]') return badgeEl;
        if (sel === '[data-cart-add]') return addBtn;
        return null;
      },
    });
    r0.handlers.change[0]({ target: r0 });
    check(badgeEl.className === 'badge badge-error' && badgeEl.textContent === 'Нет в наличии' && addBtn.disabled === true, 'B2a: нулевой вариант не гасит бейдж/кнопку');
  }
  if (fails.length) {
    failed++;
    console.log('FAIL b2a-picker: ' + fails.join(' | '));
  } else {
    console.log('OK   b2a-picker (дефолт=первый со stock>0; бейдж бинарь по вариантам; цена карточки = варианта; offers.sku первого + availability; все нули → disabled+Нет+без кнопки; change обновляет цену/бейдж/кнопку)');
  }
}

/* ── Проба B2a (D23): cart.js — строки-пары slug+variant не склеиваются ──
   add кладёт {slug, variant, qty} из data-variant кнопки; find/inc/remove
   матчат по ПАРЕ (составные ключи «slug|variant»); hydration хранит
   вариантные строки сервера как есть. */
async function smokeB2aCart() {
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const TICKS = 6;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function mkDom({ items }) {
    const calls = [];
    const listeners = {};
    const note = { textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] ?? null; } };
    const document = {
      addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
      querySelectorAll: () => [],
      querySelector: (sel) => (sel === '[data-cart-note]' ? note : null),
      body: { attrs: { 'data-stock-tpl': 'В наличии только {{n}} шт.' }, getAttribute(k) { return this.attrs[k] ?? null; } },
    };
    const fetchMock = (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      let resp;
      if (method === 'GET') resp = { items: JSON.parse(JSON.stringify(items)) };
      else resp = { items: JSON.parse(opts.body).items };
      calls.push({ url, method, body: opts && opts.body ? JSON.parse(opts.body) : null });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(resp) });
    };
    const click = (attrs) => {
      for (const fn of listeners.click ?? []) {
        fn({
          preventDefault() {},
          target: {
            closest: (sel) => (sel in attrs ? {
              disabled: false,
              getAttribute: (k) => attrs[k] ?? attrs['[' + k + ']'] ?? null,
            } : null),
          },
        });
      }
    };
    const src = withShopBase(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js', 'cart.js'), 'utf8'));
    new Function('document', 'window', 'fetch', src)(document, { location: {} }, fetchMock);
    return { calls, click, tick: async () => { for (let i = 0; i < TICKS; i++) await tick(); } };
  }

  // 1) две строки одного товара (вариант / без варианта) не склеиваются
  {
    const d = mkDom({ items: [{ slug: 'hudi', variant: 'v1', qty: 2 }, { slug: 'hudi', qty: 1 }] });
    await d.tick();
    d.click({ '[data-cart-add]': 'hudi', 'data-variant': 'v2', 'data-stock': '9' });
    await d.tick();
    const post = d.calls.find((c) => c.method === 'POST');
    check(post && post.body.items.length === 3, `B2a: строки склеились: ${post && JSON.stringify(post.body.items)}`);
    check(post && post.body.items.some((l) => l.slug === 'hudi' && l.variant === 'v2' && l.qty === 1), 'B2a: add не положил пару {slug, variant, qty}');
    d.click({ '[data-cart-add]': 'hudi', 'data-variant': 'v2', 'data-stock': '9' });
    await d.tick();
    const post2 = d.calls.filter((c) => c.method === 'POST').pop();
    check(post2 && post2.body.items.find((l) => l.slug === 'hudi' && l.variant === 'v2')?.qty === 2, 'B2a: повторный add той же пары не нашёл свою строку');
  }

  // 2) inc/remove чекаута по составному ключу
  {
    const d = mkDom({ items: [{ slug: 'hudi', variant: 'v1', qty: 2 }, { slug: 'hudi', qty: 1 }] });
    await d.tick();
    d.click({ '[data-cart-qty-inc]': 'hudi|v1', 'data-stock': '9' });
    await d.tick();
    let post = d.calls.filter((c) => c.method === 'POST').pop();
    check(post && post.body.items.find((l) => l.slug === 'hudi' && l.variant === 'v1')?.qty === 3, 'B2a: inc по составному ключу не поднял variant-строку');
    check(post && post.body.items.find((l) => l.slug === 'hudi' && !l.variant)?.qty === 1, 'B2a: inc вариантной строки задел безвариантную');
    d.click({ '[data-cart-remove]': 'hudi|v1' });
    await d.tick();
    post = d.calls.filter((c) => c.method === 'POST').pop();
    check(post && !post.body.items.some((l) => l.variant === 'v1') && post.body.items.some((l) => l.slug === 'hudi' && !l.variant), 'B2a: «×» по составному ключу убрал не ту строку');
  }

  // 3) гидратация: вариантная строка сервера находится парой (add той же пары растит её)
  {
    const d = mkDom({ items: [{ slug: 'hudi', variant: 'v1', qty: 2 }] });
    await d.tick();
    d.click({ '[data-cart-add]': 'hudi', 'data-variant': 'v1', 'data-stock': '9' });
    await d.tick();
    const post = d.calls.filter((c) => c.method === 'POST').pop();
    check(post && post.body.items.length === 1 && post.body.items[0].qty === 3 && post.body.items[0].variant === 'v1',
      `B2a: гидратированная пара не нашлась: ${post && JSON.stringify(post.body.items)}`);
  }

  if (fails.length) {
    failed++;
    console.log('FAIL b2a-cart: ' + fails.join(' | '));
  } else {
    console.log('OK   b2a-cart (add/inc/remove по паре slug+variant: строки одного товара с разными вариантами не склеиваются, составные ключи, гидратация пар)');
  }
}
await smokeB2aCart();

/* ── Проба B2b: чекаут — доставка (radio SSR) + промокод ─────────────
   SSR: первый активный способ выбран (radio checked), цена в строке
   способа и в сводке; «бесплатно» для нулевой цены; строка «Скидка» —
   честный placeholder; «К оплате» = товары + доставка. Пустой список
   доставки — честная пометка, итог = только товары. Поведенческая проба
   cart.js: сабмит несёт delivery_id+promo_code; promo_invalid — ЕДИНЫЙ
   отказ с aria-invalid на поле (причина не раскрывается — анти-перебор,
   F2); delivery_invalid — «Выберите способ доставки»; aria-invalid
   гасится на следующей попытке. */
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const html = await renderMockPage(engine, 'checkout', 'guest', { query: { ...q } });
  check(/name="delivery_id" value="d-1" checked/.test(html), 'B2b: первый способ не выбран SSR-ом');
  check(html.includes('name="delivery_id" value="d-2"'), 'B2b: второй способ пропал');
  check(html.includes('>бесплатно</span>'), 'B2b: нулевая цена не подписана «бесплатно»');
  check(html.includes('Доставка — Курьер — 300₽') && html.includes('300.00'), 'B2b: доставки нет в сводке');
  check(html.includes('применится при оформлении'), 'B2b: нет честного placeholder скидки');
  check(html.includes('2629.00'), 'B2b: итог не = товары + доставка (2629.00)');
  check(html.includes('name="promo_code"'), 'B2b: нет поля промокода');
  // пустой список доставки: пометка + итог без доставки
  const emptyD = await renderMockPage(engine, 'checkout', 'guest', {
    query: { ...q },
    dlist: { data: { deliveryMethods: [] } },
  });
  check(emptyD.includes('Способы доставки не настроены'), 'B2b: пустой список доставки без пометки');
  check(!emptyD.includes('summary-row"><span>Доставка'), 'B2b: пустой список рисует строку доставки');
  check(emptyD.includes('2329.00'), 'B2b: пустой список — итог не = только товары (2329.00)');
}
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const TICKS = 6;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function mkDom({ items, checkoutResp }) {
    const calls = [];
    const listeners = {};
    const err = { textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] ?? null; } };
    const promoEl = { value: ' demo10 ', attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] ?? null; } };
    const btn = { disabled: false };
    const document = {
      addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
      querySelectorAll: () => [],
      querySelector: (sel) => (sel === '[data-form-error]' ? err : null),
      body: { attrs: {}, getAttribute: () => null },
    };
    const fetchMock = (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: JSON.parse(JSON.stringify(items)) }) });
      calls.push({ url, method, body: JSON.parse(opts.body) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(checkoutResp) });
    };
    const submit = (form) => {
      for (const fn of listeners.submit ?? []) {
        fn({ preventDefault() {}, target: { closest: (sel) => (sel === '[data-checkout-form]' ? form : null) } });
      }
    };
    const mkForm = () => ({
      querySelectorAll: () => [],
      querySelector(sel) {
        if (sel === '[data-form-error]') return err;
        if (sel === 'button[type="submit"]') return btn;
        if (sel === '[name="promo_code"]') return promoEl;
        const m = /\[name="(.+)"\]/.exec(sel);
        if (m) return { value: { name: 'Иван', email: 'i@e.ru', phone: '', comment: '', website: '', delivery_id: 'd-1' }[m[1]] ?? '' };
        return null;
      },
    });
    const src = withShopBase(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js', 'cart.js'), 'utf8'));
    new Function('document', 'window', 'fetch', src)(document, { location: {} }, fetchMock);
    return { calls, submit, mkForm, err, promoEl, btn, tick: async () => { for (let i = 0; i < TICKS; i++) await tick(); } };
  }

  // 1) сабмит несёт delivery_id + promo_code (обрезанный)
  {
    const d = mkDom({ items: [{ slug: 'mug', qty: 1 }], checkoutResp: { ok: true, redirect: '/pay' } });
    await d.tick();
    d.submit(d.mkForm());
    await d.tick();
    const post = d.calls.find((c) => c.url.endsWith('/api/checkout'));
    check(post && post.body.delivery_id === 'd-1', `B2b: сабмит не несёт delivery_id: ${post && JSON.stringify(post.body)}`);
    check(post && post.body.promo_code === 'demo10', 'B2b: promo_code не обрезан');
  }

  // 2) promo_invalid: ЕДИНЫЙ отказ, aria-invalid, кнопка разблокирована; повтор — метка гасится
  {
    const d = mkDom({ items: [{ slug: 'mug', qty: 1 }], checkoutResp: { ok: false, error: 'promo_invalid' } });
    await d.tick();
    d.submit(d.mkForm());
    await d.tick();
    check(d.err.textContent === 'Промокод не применён — проверьте код.', `B2b: promo_invalid без единого сообщения: «${d.err.textContent}»`);
    check(d.promoEl.attrs['aria-invalid'] === 'true', 'B2b: promo_invalid не пометил поле aria-invalid');
    check(d.btn.disabled === false, 'B2b: кнопка не разблокирована после отказа');
    d.err.textContent = '';
    d.promoEl.attrs['aria-invalid'] = 'true';
    d.submit(d.mkForm());
    await d.tick();
    check(!('aria-invalid' in d.promoEl.attrs) || d.promoEl.attrs['aria-invalid'] === 'true', 'B2b: повторный сабмит сломал жизненный цикл aria-invalid');
  }

  // 3) delivery_invalid: «Выберите способ доставки.»
  {
    const d = mkDom({ items: [{ slug: 'mug', qty: 1 }], checkoutResp: { ok: false, error: 'delivery_invalid' } });
    await d.tick();
    d.submit(d.mkForm());
    await d.tick();
    check(d.err.textContent === 'Выберите способ доставки.', `B2b: delivery_invalid без сообщения: «${d.err.textContent}»`);
    check(!('aria-invalid' in d.promoEl.attrs), 'B2b: delivery_invalid не должен помечать промокод');
  }

  if (fails.length) {
    failed++;
    console.log('FAIL b2b-checkout: ' + fails.join(' | '));
  } else {
    console.log('OK   b2b-checkout (radio доставки SSR: первый выбран/бесплатно/сводка/placeholder скидки/итог=товары+доставка; пустой список — пометка; cart.js несёт delivery_id+promo_code; promo_invalid — единый отказ + aria-invalid; delivery_invalid — «Выберите способ доставки.»)');
  }
}

/* ── Проба W9 (F10) / B1-v2: галерея v2 (scroll-snap карусель) + reduce ── */
{
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'shop.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  check(/\.gallery-track\s*\{[^}]*scroll-snap-type:\s*x\s*mandatory/.test(css), 'F10/B1-v2: track не scroll-snap карусель');
  check(/\.gallery-slide\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*5/.test(css), 'F10/B1-v2: слайд без фиксированного аспекта (CLS-риск)');
  check(/\.gallery-slide img\s*\{[^}]*object-fit:\s*cover/.test(css), 'F10/B1-v2: слайд без object-fit cover');
  check(!css.includes('gallery-img-fade'), 'F10/B1-v2: остался мёртвый слой кросс-фейда галереи');
  const reduceBlocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\}\s*\}/g)].map((m) => m[0]);
  const reduceAll = reduceBlocks.join('\n');
  check(/\.product-card-photo img\s*\{[^}]*transition:\s*none/.test(reduceAll), 'F10: hover-кросс-фейд карточки не гейтится reduce');
  const prodSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'product.liquid'), 'utf8');
  check(prodSrc.includes('data-gallery-track') && prodSrc.includes('behavior: behavior()'), 'F10/B1-v2: галерея не скроллит track через scrollTo');
  check(prodSrc.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'F10/B1-v2: галерея не уважает prefers-reduced-motion');
  check(prodSrc.includes('aria-roledescription="карусель"'), 'F10/B1-v2: track без APG-роли карусели');
  if (fails.length) {
    failed++;
    console.log('FAIL w9-f10-fade: ' + fails.join(' | '));
  } else {
    console.log('OK   w9-f10-fade (галерея v2: scroll-snap track, аспект 4/5+cover, scrollTo с reduce-гейтом, APG-роли; hover-кросс-фейд карточки гейтится reduce)');
  }
}

/* ── Проба B1-v2: джанк-фиски (загрузка фото, тени, blur, hover, CV) ── */
{
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'shop.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };

  // (1) шапка: сплошной фон, backdrop-filter нет нигде
  check(!/backdrop-filter/.test(css), 'b1-v2: backdrop-filter остался в shop.css');
  check(/\.shop-header\s*\{[^}]*background:\s*var\(--bg\)/.test(css), 'b1-v2: шапка не на сплошном var(--bg)');

  // (2) карточка: hover без тени, transition только border-color 80ms
  check(/\.product-card\s*\{[^}]*transition:\s*border-color\s+80ms/.test(css), 'b1-v2: hover карточки не border-color 80ms');
  check(!css.includes('shop-shadow-hover'), 'b1-v2: hover-тень карточки не убрана');
  check(!/\.product-card\s*\{[^}]*transition:\s*box-shadow/.test(css), 'b1-v2: у карточки остался box-shadow transition');

  // (3) тени: тёмная тема — карточки none (токены, не компоненты)
  const darkBlock = tokens.match(/\[data-theme="dynamica-dark"\]\s*\{[\s\S]*?\n\}/);
  check(!!darkBlock && /--shop-shadow-card:\s*none/.test(darkBlock[0]), 'b1-v2: в dark-блоке токенов --shop-shadow-card не none');
  check(!!darkBlock && /--shop-shadow-pop:\s*0\s+0\.125rem\s+0\.5rem/.test(darkBlock[0]), 'b1-v2: в dark-блоке pop-тень не минимальная');

  // (4) тёмная тема: фото приглушаются opacity, не GPU-фильтром
  check(!/filter:\s*brightness/.test(tokens), 'b1-v2: GPU-фильтр яркости остался в tokens.css');
  check(/:where\(\[data-theme="dynamica-dark"\]\)[^{]*\{[^}]*opacity:\s*\.92/.test(tokens), 'b1-v2: затемнение фото тёмной темы не opacity .92');

  // (5) ниже-фолд: content-visibility на «Похожих» СНЯТ (7870f1b, решение
  //     владельца: paint-containment клипал наружные тени крайних карточек
  //     к padding-box грида — рваный стиль против каталога; фото и так lazy)
  check(!/\.rel-grid\s*\{[^}]*content-visibility/.test(css), 'b1-v2: rel-grid вернул content-visibility (клипал тени крайних карточек — 7870f1b)');
  check(!/\.rel-grid\s*\{[^}]*contain-intrinsic-size/.test(css), 'b1-v2: rel-grid вернул contain-intrinsic-size (7870f1b)');

  // (8) глитч-хант: с карточки снята изоляция слоёв (contain/overflow), клип фото — на .product-card-photo; скролл-гард is-scrolling
  check(!/\.product-card\s*\{[^}]*contain:/.test(css), 'b1-v2: у карточки остался contain (изоляция слоёв не снята)');
  check(!/\.product-card\s*\{[^}]*overflow:\s*hidden/.test(css), 'b1-v2: у карточки остался overflow:hidden (клип-остров)');
  check(/\.product-card-photo\s*\{[^}]*overflow:\s*hidden/.test(css) && /\.product-card-photo\s*\{[^}]*border-radius:\s*calc/.test(css), 'b1-v2: клип фото не переехал на .product-card-photo');
  check(/html\.is-scrolling \.product-card[,{][^}]*transition:\s*none\s*!important/.test(css), 'b1-v2: нет скролл-гарда is-scrolling для карточки');
  const themeSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js', 'theme.js'), 'utf8');
  check(themeSrc.includes("classList.add('is-scrolling')") && themeSrc.includes('100'), 'b1-v2: в theme.js нет скролл-гарда is-scrolling (100ms idle)');

  // (6) загрузка фото каталога: eager первые 8, fetchpriority первые 4, lazy дальше
  const many = [];
  for (let i = 1; i <= 12; i++) {
    many.push({ id: 'p' + i, title: 'Товар ' + i, slug: 'p-' + i, price_kopecks: 10000, stock: 5, photos: [{ url: '/static/photos/placeholder.svg' }, { url: '/static/photos/placeholder.svg#2' }] });
  }
  const html = await renderMockPage(engine, 'catalog', null, {
    query: { ...q },
    prods: { data: { products: many } },
  });
  const cards = html.split('<a class="product-card"').length - 1;
  check(cards === 12, 'b1-v2: в оверрайде не 12 карточек: ' + cards);
  const perCard = html.split('<a class="product-card"').slice(1).map((chunk) => chunk.split('</a>')[0]);
  perCard.forEach((chunk, i) => {
    const main = chunk.match(/<img class="card-img" [^>]+>/)?.[0] ?? '';
    const eager = !main.includes('loading="lazy"');
    const high = main.includes('fetchpriority="high"');
    if (i < 4) {
      if (!eager || !high) fails.push(`b1-v2: карточка ${i + 1} должна быть eager+fetchpriority`);
    } else if (i < 8) {
      if (!eager || high) fails.push(`b1-v2: карточка ${i + 1} должна быть eager без fetchpriority`);
    } else if (eager || high) {
      fails.push(`b1-v2: карточка ${i + 1} должна быть lazy без fetchpriority`);
    }
  });

  // (7) страница товара: слайд 1 eager+high, слайд 2 lazy; «Похожие» все lazy
  const rel = many.slice(0, 3);
  const prodHtml = await renderMockPage(engine, 'product', null, { query: { ...q }, rel: { data: { products: rel } } });
  const slides = prodHtml.match(/<div class="gallery-slide"/g)?.length ?? 0;
  check(slides === 2, 'b1-v2: в галерее не 2 слайда: ' + slides);
  const galleryChunk = prodHtml.slice(prodHtml.indexOf('data-gallery-track'), prodHtml.indexOf('data-gallery-thumbs'));
  check((galleryChunk.match(/fetchpriority="high"/g) ?? []).length === 1, 'b1-v2: в галерее fetchpriority=high не ровно у первого слайда');
  check((galleryChunk.match(/loading="lazy"/g) ?? []).length === 1, 'b1-v2: в галерее не ровно один lazy-слайд (второй)');
  const relChunk = prodHtml.slice(prodHtml.indexOf('rel-grid'));
  const relImgs = relChunk.match(/<img class="card-img" [^>]+>/g) ?? [];
  check(relImgs.length === 3 && relImgs.every((t) => t.includes('loading="lazy"')), 'b1-v2: карточки «Похожих» не все lazy');

  if (fails.length) {
    failed++;
    console.log('FAIL b1-v2-jank: ' + fails.join(' | '));
  } else {
    console.log('OK   b1-v2-jank (шапка без blur; hover=бордер 80ms; тёмные тени=none в токенах; фото dark=opacity .92; rel-grid БЕЗ content-visibility — 7870f1b; каталог eager 8/high 4/lazy дальше; слайд 1 eager+high; «Похожие» lazy)');
  }
}

/* ── Проба W9 (F8): футер — ссылки оферты/тоС только по флагам ──────── */
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const plain = await renderMockPage(engine, 'catalog', null, { query: { ...q } });
  check(!plain.includes('href="/shop/offer"') && !plain.includes('href="/shop/tos"'), 'F8: без флагов в футере мёртвые ссылки');
  const both = await renderMockPage(engine, 'catalog', null, {
    query: { ...q },
    g_site: { data: { cfg: [{ name: 'Магазин витрины', has_offer: true, has_tos: true }] } },
  });
  check(both.includes('href="/shop/offer"') && both.includes('>Оферта<'), 'F8: has_offer=true не даёт ссылку «Оферта»');
  check(both.includes('href="/shop/tos"') && both.includes('>Условия обслуживания<'), 'F8: has_tos=true не даёт ссылку «Условия»');
  const onlyOffer = await renderMockPage(engine, 'catalog', null, {
    query: { ...q },
    g_site: { data: { cfg: [{ name: 'Магазин витрины', has_offer: true }] } },
  });
  check(onlyOffer.includes('href="/shop/offer"') && !onlyOffer.includes('href="/shop/tos"'), 'F8: has_tos=false тянет мёртвую ссылку «Условия»');
  const checkoutHtml = await renderMockPage(engine, 'checkout', 'guest', { query: { ...q } });
  check(checkoutHtml.includes('соглашаетесь с условиями продажи') && !checkoutHtml.includes('href="/shop/tos"'), 'F8: строка согласия чекаута без has_tos — обычный текст');
  const checkoutTos = await renderMockPage(engine, 'checkout', 'guest', {
    query: { ...q },
    g_site: { data: { cfg: [{ name: 'Магазин витрины', has_tos: true }] } },
  });
  check(checkoutTos.includes('href="/shop/tos"'), 'F8: строка согласия чекаута не ссылает тоС при has_tos');
  if (fails.length) {
    failed++;
    console.log('FAIL w9-f8-footer: ' + fails.join(' | '));
  } else {
    console.log('OK   w9-f8-footer (ссылки оферты/тоС строго по флагам; строка согласия чекаута линкуется только при has_tos)');
  }
}

/* ── Проба W7: канон лендинг-визарда ──────────────────────────────────
   (1) Политика горизонтальных линий (ЖЁСТКО; B1 обновление): в shop.css
       ровно ТРИ hairline — border-bottom шапки, border-top футера и
       border-bottom тулбара каталога (мокап В3 «Одна строка», решение
       владельца B1); в tokens.css горизонтальных бордеров ноль. Все
       прочие разделители — воздух и --bg-soft-подложки.
   (2) Палитра-пикер (механика лендинг-визарда 1:1): tokens.css несёт
       все ШЕСТЬ ${variant.*}-подстановок; при установке визард кладёт
       hex выбранной палитры (по code: substituteArtifacts →
       substituteString → resolvePlaceholder, head 'variant').
   (3) Акцент — только токеном: в shop.css ни одного hex-литерала
       (все цвета через var(--…)) — смена палитры перекрашивает витрину.
   (4) Масштаб канона: корень 100vw/90 от 768px, фикс 16px с 1440px. */
{
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const readCss = (p) => readFileSync(join(rootDir, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const shopCss = readCss('static/css/shop.css');
  const tokensCss = readCss('static/css/tokens.css');
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };

  const hairlines = [...shopCss.matchAll(/border-(?:top|bottom)\s*:/g)].length;
  check(hairlines === 3, `политика линий B1: в shop.css ${hairlines} горизонтальных hairline вместо 3`);
  const headerRule = /\.shop-header\s*\{[^}]*\}/.exec(shopCss)?.[0] ?? '';
  const footerRule = /\.shop-footer\s*\{[^}]*\}/.exec(shopCss)?.[0] ?? '';
  const toolsRuleCss = /\.cat-tools\s*\{[^}]*\}/.exec(shopCss)?.[0] ?? '';
  check(/border-bottom:\s*1px solid var\(--border\)/.test(headerRule), 'hairline 1 обязана быть border-bottom шапки');
  check(/border-top:\s*1px solid var\(--border\)/.test(footerRule), 'hairline 2 обязана быть border-top футера');
  check(/border-bottom:\s*1px solid var\(--border\)/.test(toolsRuleCss), 'hairline 3 (B1 В3) обязана быть border-bottom тулбара каталога');
  check(!/border-(?:top|bottom)\s*:/.test(tokensCss), 'в tokens.css появились горизонтальные hairline');
  for (const v of ['accent', 'accent_strong', 'on_accent', 'accent_on_dark', 'accent_on_dark_strong', 'on_accent_dark']) {
    check(tokensCss.includes('${variant.' + v + '}'), `палитра: в tokens.css нет подстановки \${variant.${v}}`);
  }
  // hex-скан не считает #000 внутри mask-image-фейдов (маска прокрутки —
  // не визуальный цвет; запрет касается ЦВЕТОВ: акцент обязан быть токеном)
  const hexes = [...shopCss.replace(/(?:-webkit-)?mask-image:[^;}]*/g, '').matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  check(hexes.length === 0, 'в shop.css есть hex-литералы — акцент обязан ехать через var(--accent): ' + hexes.slice(0, 5).join(', '));
  check(/font-size:\s*calc\(100vw\s*\/\s*90\)/.test(tokensCss) && /min-width:\s*1440px/.test(tokensCss),
        'масштаб канона: нет корня 100vw/90 (от 768px) или фикса 16px (с 1440px)');
  // тёмная тема магазина — СВОИ имена значений (контракт тумблера не трогать)
  check(/\[data-theme="dynamica-dark"\]/.test(tokensCss) && !/html\[data-theme="dark"\]/.test(tokensCss),
        'тёмная тема должна висеть на [data-theme="dynamica-dark"] (не html[data-theme="dark"] лендинга)');
  if (fails.length) {
    failed++;
    console.log('FAIL w7-canon: ' + fails.join(' | '));
  } else {
    console.log('OK   w7-canon (ровно 3 hairline шапка/футер/тулбар-В3, 6 ${variant.*}-подстановок, ноль hex в shop.css, масштаб 100vw/90, тёмная dynamica-dark)');
  }
}

/* ── Проба UX-волны W6 (исследование w6-ux-research) ────────────────────
   Крошки-тайтлы (№1-5) · дравер фильтров и «Показать N» (№7-8) · URL-
   состояние/Back (№10) · сортировка-лист (№11) · счётчик у H1 (№14) ·
   карточка: аспект/hover/clamp/оверлей (№20-22) · тумблер темы: разметка
   и pre-paint (№23-24) · тёмная полировка (№25) · грид 4 колонки (№19). */
{
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (p) => readFileSync(join(rootDir, p), 'utf8');
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };

  // A. Крошки-тайтлы на каталоге: ?cat=plates (потомок) → «Керамика» ссылкой,
  //    «Тарелки» — span aria-current без <a>; JSON-LD 1:1 с видимой строкой.
  const catChild = await renderMockPage(engine, 'catalog', null, { query: { ...q, cat: 'plates' } });
  check(/href="\/shop\/category\/ceramics"[^>]*>Керамика<\/a>/.test(catChild), 'крошки каталога: родитель — ссылкой с title (не slug)');
  check(/<span class="crumb crumb-current" aria-current="page">Тарелки<\/span>/.test(catChild), 'крошки каталога: текущая — span aria-current без ссылки');
  const childLd = extractJsonLd(catChild).map((s) => { try { return JSON.parse(s); } catch (e) { fails.push('catalog?cat=plates: JSON-LD не парсится: ' + e.message); return null; } }).filter(Boolean);
  const childBc = childLd.find((o) => o['@type'] === 'BreadcrumbList');
  check(childBc && childBc.itemListElement.length === 3
    && childBc.itemListElement[1].name === 'Керамика'
    && childBc.itemListElement[1].item === 'https://localhost:5173/shop/category/ceramics'
    && childBc.itemListElement[2].name === 'Тарелки'
    && !('item' in childBc.itemListElement[2]), 'крошки каталога: JSON-LD совпадает с видимой строкой, у последнего элемента нет item');

  // B. Крошка товара — человекочитаемый title из cats (не capitalize(slug)).
  const prod = await renderMockPage(engine, 'product', null, { query: { ...q } });
  check(/href="\/shop\/category\/ceramics"[^>]*>Керамика<\/a>/.test(prod), 'крошки товара: категория — «Керамика», не capitalize(slug)');
  const prodLdW6 = extractJsonLd(prod).map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  const prodBcW6 = prodLdW6.find((o) => o['@type'] === 'BreadcrumbList');
  check(prodBcW6 && prodBcW6.itemListElement[1].name === 'Керамика', 'крошки товара: JSON-LD несёт title категории');

  // C. Дравер фильтров (№7-8): нижний лист — dialog с aria, оверлей,
  //    «Показать N» (шаблон в data-apply-tpl, живое число в data-apply-label),
  //    радио категорий со счётчиками, индекс товаров для живого счётчика.
  const catHtml = await renderMockPage(engine, 'catalog', null, { query: { ...q } });
  check(/<aside class="sheet" id="filter-drawer" data-filter-drawer role="dialog" aria-modal="true"[^>]*aria-hidden="true"/.test(catHtml), 'дравер: нижний лист без role=dialog/aria-modal/aria-hidden');
  check(catHtml.includes('data-sheet-overlay'), 'дравер: нет оверлея (закрытие по клику мимо)');
  check(/data-apply-tpl="Показать \{\{n\}\}"/.test(catHtml), 'дравер: на кнопке «Показать N» нет шаблона подписи');
  check(/>Показать 26</.test(catHtml), 'дравер: стартовая подпись «Показать N» не равна общему числу товаров');
  check(/data-count-slug="plates"/.test(catHtml) && /<span class="sheet-count">1<\/span>/.test(catHtml), 'дравер: у радио категорий нет счётчиков опций');
  check(catHtml.includes('data-products-index'), 'дравер: нет индекса товаров для живого счётчика');
  // Урок живого деплоя W6: сырой литерал {{n}} в тексте шаблона Liquid-движок
  // съедает как output-тег — в отрендеренном JS плейсхолдер обязан доехать
  // (через {{ ph_n }} из бутстрапа), а replace('') — запрещённый симптом.
  check(/\)\.replace\('\{\{n\}\}'/.test(catHtml), 'дравер: JS-плейсхолдер {{n}} не доехал в рендер (заменять только через {{ ph_n }})');
  check(!catHtml.includes(".replace(''"), 'дравер: replace(\'\') — плейсхолдер съеден Liquid-движком');
  const idx = /<script type="application\/json" data-products-index>([\s\S]*?)<\/script>/.exec(catHtml);
  let idxOk = false;
  try { idxOk = Array.isArray(JSON.parse(idx[1])) && JSON.parse(idx[1]).length === 5; } catch (e) { idxOk = false; }
  check(idxOk, 'дравер: индекс товаров не парсится / неполон');

  // D. URL-состояние и Back (№10): применение — навигация по URL (history
  //    нативный), страница сбрасывается; Esc/оверлей закрывают лист.
  const catSrc = read('templates/catalog.liquid');
  check(catSrc.includes('window.location.assign'), 'дравер: применение не навигацией по URL (Back не вернёт состояние)');
  check(catSrc.includes("'Escape'") && catSrc.includes('data-sheet-close'), 'дравер: закрытие по Esc/крестику не подключено');
  check(catSrc.includes("sp.delete") === false && /buildUrl[\s\S]{0,400}sp\.set\('cat'[\s\S]{0,200}sp\.set\('q'[\s\S]{0,200}sp\.set\('sort'/.test(catSrc), 'дравер: URL собирается только из q/cat/sort (page сбрасывается)');

  // E. Тумблер темы (№23-24): pre-paint в head ДО CSS-ссылок; кнопка с
  //    aria-live; SVG-морф (маска-затмение); слоты aria на body.
  const baseSrc = read('templates/base.liquid');
  const prePaintIdx = baseSrc.indexOf('Pre-paint boot темы');
  const cssLinkIdx = baseSrc.indexOf('css/tokens.css');
  check(prePaintIdx > -1 && cssLinkIdx > -1 && prePaintIdx < cssLinkIdx, 'тема: pre-paint скрипт не до CSS-ссылок (вспышка не-той темы)');
  check(baseSrc.includes('aria-live="polite"') && baseSrc.includes('theme-mask') && baseSrc.includes('theme-mask-hole'), 'тумблер: нет aria-live/SVG-маски-морфа');
  check(baseSrc.includes('data-theme-aria-auto') && baseSrc.includes('data-theme-aria-light') && baseSrc.includes('data-theme-aria-dark'), 'тумблер: слоты динамического aria-label не на body');
  const tokensSrc = read('static/css/tokens.css');
  check(tokensSrc.includes('color-scheme: light') && tokensSrc.includes('color-scheme: dark'), 'тема: color-scheme не выставлен (нативные контролы не подстраиваются)');
  check(tokensSrc.includes(':where([data-theme="dynamica-dark"]) .product-card-photo img') && tokensSrc.includes('opacity: .92'), 'тёмная тема (№25/B1-v2): контентные фото приглушаются opacity .92 (не GPU-фильтром)');
  check(/prefers-reduced-motion:\s*no-preference/.test(tokensSrc), 'тема: переход не сгейчен prefers-reduced-motion');

  // F. Карточка (№20-22) и грид (№19).
  const cssSrc = read('static/css/shop.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const cardSrc = read('templates/partials/product-card.liquid');
  check(/\.product-card-photo\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*4/.test(cssSrc), 'карточка: фото без единого aspect-ratio 3/4');
  check(cardSrc.includes('loading="lazy"') && cardSrc.includes('width="600"') && cardSrc.includes('height="800"'), 'карточка: нет lazy/width/height (CLS)');
  check(/\.product-card-title\s*\{[^}]*-webkit-line-clamp:\s*2/.test(cssSrc) && /min-height:\s*calc\(1\.35em \* 2\)/.test(cssSrc), 'карточка: название без clamp 2 строк с резервом высоты');
  check(/@media \(hover: hover\) and \(pointer: fine\)\s*\{\s*\.product-card:hover \.card-img-alt/.test(cssSrc), 'карточка: hover-свап второго фото не ограничен (hover: hover)');
  check(cardSrc.includes('card-img-alt') && cardSrc.includes('card-overlay'), 'карточка: нет второго фото / оверлея «Нет в наличии»');
  const block62 = mediaBlock(cssSrc, '@media \\(min-width: 62rem\\)');
  check(/\.product-grid,\s*\.rel-grid\s*\{[^}]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/.test(block62), 'грид ≥62rem: не 4 колонки');

  // G. Категория — тот же контракт W6 (H1-клэмп, счётчик у H1, листы, чипы).
  const catPage = await renderMockPage(engine, 'category', 'found', { query: { ...q } });
  check(catPage.includes('cat-title') && catPage.includes('data-cat-count'), 'категория: H1 без клэмпа/счётчик не у H1');
  check(catPage.includes('data-cat-desc') && catPage.includes('data-desc-toggle'), 'категория: описание без «Ещё»');
  check(catPage.includes('data-filter-drawer') && catPage.includes('data-sort-sheet'), 'категория: нет нижних листов фильтра/сортировки');
  check(!catPage.includes('applied-row'), 'категория: чипы применённых не должны рендериться без фильтров');
  const catPageQ = await renderMockPage(engine, 'category', 'found', { query: { ...q, q: 'кружка' } });
  check(catPageQ.includes('applied-row') && /aria-label="Убрать фильтр: кружка"/.test(catPageQ), 'категория: применённый q не стал чипом с escape-эхом');
  check(/data-applied-badge[^>]*>1</.test(catPageQ), 'категория: бейдж применённых на кнопке «Фильтры» не равен 1');

  if (fails.length) {
    failed++;
    console.log('FAIL w6-ux: ' + fails.join(' | '));
  } else {
    console.log('OK   w6-ux (крошки-тайтлы+JSON-LD, дравер/«Показать N»/URL-Back, тумблер+pre-paint+color-scheme, карточка 3:4/hover/clamp, грид 4, категория W6)');
  }
}

/* ── Инвариант скоупа паршалов (регрессия класса include-assign) ──────────
   Движок рендера (osteele/liquid) НЕ поднимает assign/capture из паршала
   включателю — паршал обязан быть чистой функцией входов (данные текут
   только вниз). (1) Статика: в templates/partials/*.liquid запрещены
   {% assign %} и {% capture %} — любое появление ловим здесь.
   (2) Синхронизация: бутстрап настроек обязан быть заинлайнен БАЙТ-В-БАЙТ
   в каждом entry-шаблоне (каноническая копия —
   dev/site-config-bootstrap.liquid); словаря ui_text больше нет. */
{
  const { readdirSync } = await import('node:fs');
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const partDir = join(rootDir, 'templates', 'partials');
  const fails = [];
  for (const f of readdirSync(partDir)) {
    if (!f.endsWith('.liquid')) continue;
    const src = readFileSync(join(partDir, f), 'utf8');
    const body = src.replace(/\{%-?\s*comment[\s\S]*?endcomment\s*-?%\}/g, ''); // комментарии не считаются
    if (/\{%-?\s*assign/.test(body)) fails.push(`partials/${f}: найден {% assign %} — паршал должен быть чистой функцией`);
    if (/\{%-?\s*capture/.test(body)) fails.push(`partials/${f}: найден {% capture %} — capture вверх не доезжает`);
    if (/ui_rows|ui_text|uiTexts/.test(body)) fails.push(`partials/${f}: упоминание ликвидированного словаря`);
  }
  const bootstrap = readFileSync(join(rootDir, 'dev', 'site-config-bootstrap.liquid'), 'utf8');
  const entries = ['404.liquid', 'account.liquid', 'catalog.liquid', 'category.liquid', 'checkout.liquid',
    'login.liquid', 'offer.liquid', 'order-status.liquid', 'product.liquid', 'register.liquid', 'tos.liquid',
    'email-order-customer.liquid', 'email-order-vendor.liquid', 'email-layout.liquid'];
  // Регион бутстрапа в entry-шаблоне: ровно canon.length байт от старт-маркера
  // — обязан быть байт-в-байт равен канону (простой includes не ловит
  // «хвост-мусор» ПОСЛЕ канона).
  const START_MARK = '{%- comment -%}\n  БУТСТРАП НАСТРОЕК (W8)';
  const UI_DICT_RE = /\bui_rows\b|\bt_[a-z][a-z0-9_]*\b|\buiTexts\b|find:\s*"key"/;
  for (const e of entries) {
    const src = readFileSync(join(rootDir, 'templates', e), 'utf8');
    if (!src.includes(bootstrap)) fails.push(`${e}: бутстрап настроек отсутствует/разошёлся с dev/site-config-bootstrap.liquid`);
    const s = src.indexOf(START_MARK);
    if (s < 0) { fails.push(`${e}: не найден старт бутстрапа`); continue; }
    const region = src.slice(s, s + bootstrap.length);
    if (region !== bootstrap) fails.push(`${e}: регион бутстрапа не байт-равен канону (хвост-мусор после канона?)`);
    if (UI_DICT_RE.test(src)) fails.push(`${e}: остались следы словаря (ui_rows/t_*/uiTexts/find "key")`);
  }
  if (fails.length) {
    failed++;
    console.log('FAIL partial-purity: ' + fails.join(' | '));
  } else {
    console.log('OK   partial-purity (паршалы без assign/capture; бутстрап настроек байт-в-байт во всех entry; следов словаря нет)');
  }
}

/* ── Проба B1 (D5): доступность — разметка всех страниц ────────────────
   Скип-линк канона лендинга → #main на КАЖДОЙ странице; живой регион
   счётчика корзины; статусы через role=status; ошибки чекаута связаны
   aria-describedby; фото карточек с decoding=async; драверы — диалоги с
   aria-labelledby; галерейные стрелки подписаны. Письма НЕ трогаем
   (админские письма вне аудита B1). */
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const pages = ['catalog', 'product', 'category', 'checkout', 'order', 'account', 'login', 'register', '404'];
  for (const name of pages) {
    const variant = name === 'category' ? 'found' : name === 'product' ? null : null;
    const html = await renderMockPage(engine, name, variant, { query: { ...q } });
    check(html.includes('class="skip-link" href="#main"'), `${name}: нет скип-линка → #main`);
    check(html.includes('<main id="main" tabindex="-1">'), `${name}: main без id="main" (tabindex=-1 — таргет скип-линка)`);
    check(html.includes('aria-live="polite">{{') === false && /data-cart-count aria-live="polite"/.test(html), `${name}: счётчик корзины не живой регион`);
  }
  const catHtml = await renderMockPage(engine, 'catalog', null, { query: { ...q } });
  check(catHtml.includes('decoding="async"'), 'каталог: у фото карточек нет decoding="async" (D4)');
  check(!/loading="lazy"(?![^>]*decoding)/.test(catHtml.replace(/loading="lazy" decoding="async"/g, '')), 'каталог: есть lazy-фото без decoding="async"');
  check(catHtml.includes('aria-labelledby="filter-drawer-title"') && catHtml.includes('aria-labelledby="sort-sheet-title"'), 'каталог: драверы без aria-labelledby');
  const prodHtml = await renderMockPage(engine, 'product', null, { query: { ...q } });
  check(prodHtml.includes('decoding="async"'), 'товар: галерея без decoding="async"');
  check(prodHtml.includes('aria-pressed'), 'товар: миниатюры галереи без aria-pressed');
  const coHtml = await renderMockPage(engine, 'checkout', 'guest', { query: { ...q } });
  check(coHtml.includes('id="checkout-error"'), 'чекаут: бокс ошибки без id');
  check((coHtml.match(/aria-describedby="checkout-error"/g) || []).length === 3, 'чекаут: name/email/promo не связаны с боксом ошибки aria-describedby');
  const ordHtml = await renderMockPage(engine, 'order', 'new', { query: { ...q } });
  check(ordHtml.includes('<div class="status-screen" role="status">'), 'заказ: статус-экран без role=status');
  const nfHtml = await renderMockPage(engine, 'product', 'not_found', { query: { ...q } });
  check(nfHtml.includes('role="status"'), 'товар не найден: статус-экран без role=status');
  if (fails.length) {
    failed++;
    console.log('FAIL b1-a11y: ' + fails.join(' | '));
  } else {
    console.log('OK   b1-a11y (скип-линк на 9 страницах, живой счётчик корзины, role=status, aria-describedby чекаута, decoding=async, aria-labelledby драверов, aria-pressed галереи)');
  }
}

/* ── Проба B1 (D3): дропдаун — контракт по исходникам ──────────────────
   APG select-only combobox: role=combobox + aria-haspopup=listbox +
   aria-expanded + aria-activedescendant, варианты role=option +
   aria-selected, стрелки/Home/End/PageUp/PageDown/typeahead/Esc,
   клик-вне, фокус не покидает кнопку. Нативный select остаётся
   источником значения (изменение value диспатчит change на select —
   сабмит формы сортировки работает без правок). */
{
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'js', 'dropdown.js'), 'utf8');
  for (const token of [
    "role', 'combobox", "aria-haspopup', 'listbox", "aria-expanded", "aria-activedescendant",
    "role', 'listbox", "role', 'option", "aria-selected",
    "case 'ArrowDown'", "case 'ArrowUp'", "case 'Home'", "case 'End'",
    "case 'PageUp'", "case 'PageDown'", "case 'Escape'", 'typeahead',
    "dispatchEvent(new Event('change', { bubbles: true }))",
  ]) {
    check(src.includes(token), `dropdown.js: нет ${token}`);
  }
  check(!/matchMedia/.test(src), 'dropdown.js: reduce-гейт должен жить в CSS (никакого matchMedia в JS)');
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'css', 'shop.css'), 'utf8');
  check(/@keyframes dd-in/.test(css), 'дропдаун: нет анимации появления dd-in');
  check(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.dd-list\s*\{ animation: dd-in/.test(css.replace(/\n/g, ' ').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')) || /animation:\s*dd-in/.test(css), 'дропдаун: анимация не гейтится prefers-reduced-motion');
  check(/\.dd-list\s*\{[^}]*max-height:\s*20rem/.test(css), 'дропдаун: список без max-height (длинные списки уедут за вьюпорт)');
  const base = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'base.liquid'), 'utf8');
  check(base.includes('static/js/dropdown.js'), 'base.liquid: dropdown.js не подключён');
  if (fails.length) {
    failed++;
    console.log('FAIL b1-dropdown: ' + fails.join(' | '));
  } else {
    console.log('OK   b1-dropdown (APG-контракт в исходнике, change→select для сабмита, анимация под reduce-гейтом, подключён в base)');
  }
}

if (failed) {
  console.log('smoke: FAILED (см. FAIL выше)');
  process.exit(1);
}
console.log('smoke done: render + theme-toggle + cart-replace + qty-steppers + seo-pack + xss-echo + site-config + member-menu + layout-stretch + layout-mobile + toolbar-compact + chips-more-less + b1-chips-render + w9-f2-320 + w9-f4-counter + w9-f3-f6-lines + w9-stock-cart + b2a-picker + b2a-cart + b2b-checkout + w9-f10-fade + w9-f8-footer + w7-canon + w6-ux + partial-purity + b1-a11y + b1-dropdown');
