// Дев-харнесс витрины: liquidjs + шимы платформенных фильтров.
// ИСТИНА — templates/ и static/; харнесс — только рендер с моками mock/.
// Дивергенции liquidjs vs продовый движок платформы гасятся шимами ниже;
// финальная инстанс любой правки — превью-хост платформы.
import { Liquid } from 'liquidjs';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
export const templatesDir = join(root, 'templates');
export const staticDir = join(root, 'static');
export const mockDir = join(root, 'mock');

/* База магазина в дев-среде — тот же контракт, что в проде: сентинел
   __SHOP_BASE__ в templates/ и static/ заменяется на путь каталога
   (визард платформы подставляет ответ шага store_path, по умолчанию /shop).
   Корень «/» остаётся будущему лендингу — страницы магазина живут под /shop. */
export const SHOP_BASE = '/shop';

/** Замена сентинела __SHOP_BASE__ (html отрендеренных страниц, js статики). */
export function withShopBase(text) {
  return String(text).split('__SHOP_BASE__').join(SHOP_BASE);
}

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.liquid': 'text/html; charset=utf-8'
};

/* ── Шимы платформенных фильтров (в дев-среде их несут шимы, см. README) ── */

const RU_MONTH_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];
const RU_MONTH_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];
const RU_WEEK_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const RU_WEEK_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function toDate(v) {
  if (v instanceof Date) return v;
  if (v === 'now' || v === 'today') return new Date();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/* date_ru: RU-даты (платформенный фильтр).
   Шим поддерживает подмножество: %A %a %B %b %-d %d %m %Y %H %M. */
function dateRu(v, fmt = '%-d %B %Y') {
  const d = toDate(v);
  if (!d) return String(v ?? '');
  const out = fmt
    .replace(/%A/g, RU_WEEK_FULL[d.getDay()])
    .replace(/%a/g, RU_WEEK_SHORT[d.getDay()])
    .replace(/%B/g, RU_MONTH_GEN[d.getMonth()])
    .replace(/%b/g, RU_MONTH_NOM[d.getMonth()].slice(0, 3).toLowerCase())
    .replace(/%-d/g, String(d.getDate()))
    .replace(/%d/g, pad2(d.getDate()))
    .replace(/%m/g, pad2(d.getMonth() + 1))
    .replace(/%Y/g, String(d.getFullYear()))
    .replace(/%H/g, pad2(d.getHours()))
    .replace(/%M/g, pad2(d.getMinutes()));
  return out;
}

export function registerPlatformFilters(engine) {
  // money: ФИКСИРОВАННЫЕ 2 знака (| money: 1 — один), разделитель точка;
  // нечисловое проходит насквозь. Шим: JS-float хвосты гасятся toFixed.
  engine.registerFilter('money', (v, decimals = 2) => {
    const n = Number(v);
    if (Number.isFinite(n)) return n.toFixed(Number(decimals) || 0);
    return v ?? '';
  });
  engine.registerFilter('date_ru', dateRu);
  // uuid: свежий UUIDv4 на каждый рендер (вход игнорируется)
  engine.registerFilter('uuid', () => randomUUID());
  // where/sum — подмножество (в проде этих фильтров нет; см. README).
  engine.registerFilter('where', (arr, key, expected) =>
    Array.isArray(arr) ? arr.filter((x) => x && x[key] === expected) : []
  );
  engine.registerFilter('sum', (arr, key) =>
    Array.isArray(arr)
      ? arr.reduce((s, x) => s + (Number(key ? x?.[key] : x) || 0), 0)
      : 0
  );
}

export function createEngine() {
  const engine = new Liquid({ root: templatesDir, extname: '.liquid', cache: false });
  registerPlatformFilters(engine);
  return engine;
}

/* ── Моки ─────────────────────────────────────────────────────── */

export function loadMock(name) {
  const p = join(mockDir, name + '.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

const PAGE_FOR_MOCK = {
  catalog: { template: 'catalog', mock: 'catalog', pick: null },
  product: { template: 'product', mock: 'product', pick: 'found' },
  checkout: { template: 'checkout', mock: 'checkout', pick: 'guest' },
  cart: { template: 'checkout', mock: 'cart', pick: 'guest' }, // отдельной страницы корзины нет: та же типографика
  order: { template: 'order-status', mock: 'order-status', pick: 'new' },
  account: { template: 'account', mock: 'account', pick: 'default' },
  login: { template: 'login', mock: null, pick: null },
  register: { template: 'register', mock: null, pick: null },
  '404': { template: '404', mock: null, pick: null }
};

const PATH_ROUTES = [
  { re: /^\/$/, mock: 'catalog' },
  { re: /^\/checkout\/?$/, mock: 'checkout' },
  { re: /^\/product\/[^/]+\/?$/, mock: 'product' },
  { re: /^\/order\/[^/]+\/?$/, mock: 'order' },
  { re: /^\/account\/?$/, mock: 'account' },
  { re: /^\/login\/?$/, mock: 'login' },
  { re: /^\/register\/?$/, mock: 'register' }
];

/* Контекст страницы = вариант мока + site/query. */
export async function renderMockPage(engine, mockName, variant, overrides = {}) {
  let template;
  let ctx;
  if (mockName === '404') {
    template = '404';
    ctx = { site: { version: 7, params: {}, query: {} }, query: {} };
  } else if (mockName === 'cart') {
    // cart.json — мок API; отдельной страницы корзины в витрине нет,
    // рендерим checkout-типографику на гостевых позициях.
    template = 'checkout';
    const cartMock = loadMock('cart');
    const checkoutMock = loadMock('checkout');
    const items = cartMock[variant || 'guest']?.items ?? [];
    ctx = {
      results: { ci: { items } },
      cart: { data: { carts: [{ id: 'cart-anon-1', items: JSON.stringify(items) }] } },
      prods: checkoutMock.guest.prods,
      site: checkoutMock.guest.site,
      query: {}
    };
  } else {
    const spec = PAGE_FOR_MOCK[mockName] || PAGE_FOR_MOCK.catalog;
    template = spec.template;
    const mock = loadMock(spec.mock || mockName);
    ctx = variant && mock[variant] ? mock[variant] : spec.pick ? mock[spec.pick] ?? {} : mock;
  }
  ctx = {
    ...ctx,
    ...overrides,
    site: { version: 7, params: {}, query: {}, ...(ctx.site || {}) }
  };
  return engine.renderFile(template, ctx).then(withShopBase);
}

/* ── Дев-эмуляция API корзины/чекаута (in-memory, на процесс) ── */

const cartsByAnon = new Map(); // anonId -> items

function anonId(req, res) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)shop_cart_dev=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  const id = randomUUID();
  res.setHeader('Set-Cookie', 'shop_cart_dev=' + id + '; Path=/; SameSite=Lax');
  return id;
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const isMember = (req.headers.cookie || '').includes('dev_member=1');
  // API живёт под базой магазина (/shop/api/…); принимаем и голый /api/… —
  // так можно дёргать мок-эндпоинты руками.
  if (url.pathname === SHOP_BASE + '/api/cart' || url.pathname === '/api/cart') {
    const id = anonId(req, res);
    if (req.method === 'GET') {
      // гидратация; режим member → стартовый набор из мока (демо «вливания» гостя)
      const items = isMember
        ? loadMock('cart').member.items
        : cartsByAnon.get(id) ?? loadMock('cart').guest.items;
      return sendJson(res, 200, { items });
    }
    if (req.method === 'POST') {
      let body = {};
      try { body = JSON.parse((await readBody(req)) || '{}'); } catch { /* 400 ниже */ }
      if (!Array.isArray(body.items)) return sendJson(res, 400, { error: 'cart_invalid' });
      cartsByAnon.set(id, body.items); // ответ сервера = канон
      return sendJson(res, 200, { items: body.items });
    }
  }
  if ((url.pathname === SHOP_BASE + '/api/checkout' || url.pathname === '/api/checkout') && req.method === 'POST') {
    let body = {};
    try { body = JSON.parse((await readBody(req)) || '{}'); } catch { /* ignore */ }
    if ((body.website || '') !== '') return sendJson(res, 200, { ok: true }); // honeypot: молча
    return sendJson(res, 200, { ok: true, redirect: '/order/dev-order-1' });
  }
  return false;
}

function serveStatic(req, res, url) {
  // url.pathname уже с префиксом /static/ — отрезаем его: staticDir сам статик-корень.
  const rel = normalize(decodeURIComponent(url.pathname))
    .replace(/^[\\/]+/, '')
    .replace(/^static[\\/]/, '');
  const abs = join(staticDir, rel);
  if (!abs.startsWith(staticDir + sep) || rel.includes('..')) return false;
  if (!existsSync(abs)) return false;
  res.setHeader('Content-Type', MIME[extname(abs)] || 'application/octet-stream');
  const data = readFileSync(abs, 'utf8');
  res.end(MIME[extname(abs)]?.startsWith('text/') ? withShopBase(data) : data);
  return true;
}

/* Vite-мидлвара:/page-роутер + /static/* + /api/*. */
export function harnessMiddleware(engine) {
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        if (await handleApi(req, res, url)) return;
        return next();
      }
      if (url.pathname.startsWith('/static/')) {
        if (serveStatic(req, res, url)) return;
        return next();
      }
      if (url.pathname === '/favicon.svg') {
        if (serveStatic(req, res, new URL('/static/favicon.svg', 'http://x'))) return;
      }
      let mockName = url.searchParams.get('mock');
      let variant = url.searchParams.get('variant');
      if (!mockName) {
        // страница может прийти и под базой магазина: /shop, /shop/product/x …
        let p = url.pathname;
        if (p === SHOP_BASE) p = '/';
        else if (p.startsWith(SHOP_BASE + '/')) p = p.slice(SHOP_BASE.length);
        const hit = PATH_ROUTES.find((r) => r.re.test(p));
        mockName = hit ? hit.mock : null;
        if (!mockName) mockName = '404';
      }
      const query = { cat: url.searchParams.get('cat') || '', page: url.searchParams.get('page') || '' };
      const html = await renderMockPage(engine, mockName, variant, { query });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('harness render error: ' + (err && err.message));
    }
  };
}
