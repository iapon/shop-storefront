# shop-storefront — витрина интернет-магазина для DynapiCMS

Liquid-шаблоны, статика и дев-харнесс витрины. Установка магазина — из
админки платформы; этот репозиторий — только витрина/тема.

```
templates/   # 17 liquid-файлов — источник правды разметки (магазин + ЛК:
             # login/register/account на КОРНЕ сайта — платформенная
             # конвенция member-системы; письма о заказе — email-тройка)
static/      # css/tokens.css (тема), css/shop.css, js/cart.js, js/theme.js,
             # favicon.svg, photos/placeholder.svg (фоллбек пустой галереи)
mock/        # фикстуры данных страниц для дев-харнесса
dev/         # Vite-харнесс: liquidjs + шимы платформенных фильтров + smoke
```

## Локальное превью

```bash
cd dev
npm install
npm run dev        # http://localhost:5173/?mock=catalog
npm run smoke      # рендер всех страниц + пробы темы/корзины/степперов/SEO/настроек
npm run build      # сборка харнесса
```

Роутер харнесса: `/?mock=catalog|category|product|checkout|cart|order|account|login|register|404|email-customer|email-vendor`
(варианты: `&variant=not_found` для product, `found|nested|not_found` для
category, `member|empty` для checkout, `empty` для account, `paid|not_found`
для order; письма рендерятся двухпроходом тело→layout). Реальные пути витрины
тоже работают: `/`, `/category/:slug`, `/product/:slug`, `/checkout`,
`/order/:id`, `/account`, `/login`, `/register`, любой несовпавший путь — 404.
Шапка читает `member` (SSR): гость — «Войти/Регистрация», вошедший —
«Кабинет» + POST-форма «Выйти». API корзины (`GET/POST /api/cart`,
`POST /api/checkout`) эмулируется в памяти; режим member — кука `dev_member=1`.

Дев-рендер — liquidjs с шимами платформенных фильтров (`dev/harness.mjs`:
`money`, `date_ru`, `uuid`, `where`, `sum`, `find`, `json`); финальная инстанс
любой правки — превью-хост платформы.

## Тексты и настройки — из админки (не из шаблонов)

Витрина не хранит ни названия магазина, ни контактов, ни настраиваемых строк
(словарь `ui-text` ликвидирован в W8 — осталась ОДНА запись настроек):

- **Настройки магазина** (сущность `shop-config`, одна запись, 19 именованных
  полей, группы видны в префиксах): Магазин — `name`, `slogan`, `description`,
  `legal`, `site_url` (канонический домен для canonical/OG), `og_image`;
  Контакты — `email`, `phone`, `address`, `work_hours`, `telegram`,
  `social_link`; Главная — `hero_kicker`/`hero_title`/`hero_subtitle`
  (каталог); Кнопки — `cta_add_to_cart`, `cta_checkout`, `cart_empty_title`,
  `filters_show`. Шаблоны читают их из биндинга `g_site`
  (`g_site.data.cfg[0]`) с фоллбеком на месте:
  `{{ cfg.cta_add_to_cart | default: "В корзину" }}` — **пустое поле =
  вшитый фоллбек шаблона**, владелец заполняет только то, что хочет
  переопределить. Прочие интерфейсные подписи («Войти», «Найдено: …»,
  бейджи…) — константы шаблонов: умеющие правят прямо в `templates/`.
- **Письма** (`email-layout` + `email-order-customer` + `email-order-vendor`)
  живут в API-сценарии оформления: hoist render-ноды там не выполняется,
  поэтому адресация в письмах — только `results.g_site.*` и `json.*`
  (бутстрап настроек знает обе ветки адресации).
- JS-строки (ошибки оформления в cart.js) приходят мостом `data-msg-*` на
  `<body>` (константы шаблона), в JS — вшитый фоллбек.

## Правки стилей и разметки

- **Тема/бренд — только `static/css/tokens.css`** (канон лендинг-визарда, W7).
  Акцент — палитра визарда: файл несёт литералы `${variant.accent}` /
  `${variant.accent_strong}` / `${variant.on_accent}` (и `*_on_dark`-пара),
  визард при установке подставляет hex выбранной на шаге «Акцентный цвет»
  палитры (indigo/emerald/graphite/amber — те же 4, что у лендинга).
  Нейтральные (`--bg/--bg-soft/--card/--text/--muted/--border/--shadow`),
  радиусы (карточка 12px, кнопка/инпут 10px), тень и статусы (тинты) —
  тоже там; тёмная тема — блок `[data-theme="dynamica-dark"]`.
- **Разметка** — правьте `templates/*.liquid` и `static/css/shop.css`.
  Шаблоны рендерятся Liquid-движком платформы: доступные переменные — это
  биндинги страниц (`p.data.products`, `results.ci.items`, `cat.data.categories`,
  `g_site.data.*`, … — см. моки в `mock/`, они повторяют их форму),
  `site.version` для кэш-бастинга статики и `host` (фоллбек canonical).
  CSS — мобильный-фёрст от 320px: базовые стили = малые экраны, улучшения
  только через `@media (min-width: …)`; главный десктопный брейкпоинт —
  48rem (=768px канона), у грида каталога микрошаги 30rem/62rem; масштаб
  несёт корень `html { font-size: calc(100vw/90) }` от 768px (фикс 16px
  с 1440px, tokens.css) — отступы в rem имеют один источник правды.
  Тап-таргеты ≥ 2.75rem (44px), инпуты ≥ 16px, никаких `max-width`-
  медиазапросов (проверяет smoke).
- **Политика горизонтальных линий (W7, жёстко):** в shop.css ровно ДВЕ
  hairline — `border-bottom` шапки и `border-top` футера; все прочие
  разделители запрещены — воздух (rem) и `--bg-soft`-подложки
  (проба w7-canon в smoke ловит регрессию grep'ом).
- Паттерн страницы:
  бутстрап настроек (`cfg`/`shop_name`/`canon_base` — инлайн, канон в
  `dev/site-config-bootstrap.liquid`) → `page_*` assigns →
  `{% capture content %}…{% endcapture %}` → `{% include "base" %}`
  (include делит скоуп — cfg и `canon_base` назначает бутстрап entry-шаблона).
  Крошки — `partials/breadcrumbs` (рендерит nav +
  JSON-LD BreadcrumbList); бейдж наличия — `partials/stock-badge` (порог «мало» = 5).
- Проверка: `npm run smoke`, затем превью на платформе.

## SEO

`base.liquid` строит canonical/og:url из `shop-config.site_url`
(пустой → фоллбек `https://{{ host }}` — живой домен запроса) + `page_canon`
страницы. OG-пакет: title/description/type/url/image (картинка — первое фото
товара или og_image из настроек; относительный путь абсолютизируется).
JSON-LD: Product+Offer (цена/валюта RUB/наличие по stock) на карточке,
CollectionPage + BreadcrumbList на категории, BreadcrumbList на карточке —
каждый объект в своём `<script type="application/ld+json">` (строки
экранирует фильтр `json`). 404 и персональные страницы — noindex.

## `__SHOP_BASE__` — путь магазина

Корень сайта может принадлежать лендингу, поэтому магазин живёт под путём
(`/shop` по умолчанию; визард платформы предлагает также `/catalog` и `/store`).
Все ссылки витрины на страницы и API магазина несут литерал-сентинел
`__SHOP_BASE__` вместо абсолютного пути от корня:

- `templates/*.liquid` — `href="__SHOP_BASE__/…"`, `href="__SHOP_BASE__/product/{{ p.slug }}"`;
- `static/js/cart.js` — `var SHOP_BASE = '__SHOP_BASE__';` (все `fetch` идут через него);
- при установке визардом сентинел заменяется на выбранный путь
  (в дев-харнессе — `dev/harness.mjs withShopBase` → `/shop`);
- ссылки на **статику платформы** (`/static/…`) сентинела не несут — её
  монтирует рендер-сервис от корня сайта, префикс магазина ей не нужен.

**Ручной пуш шаблонов** (мимо визарда): перед `flowctl files push` замените
`__SHOP_BASE__` на фактический путь магазина в `templates/` и `static/js/cart.js`,
например `__SHOP_BASE__` → `/shop`. Проверки: `node dev/check-base-refs.mjs`
(падает, если в templates/static осталась абсолютная ссылка от корня вне `/static/*`)
и `node dev/check-hygiene.mjs` (в публичном репо нет платформенных внутренностей).

## Деплой шаблонов в свой проект

```bash
# draft-загрузка шаблонов и статики в свой тенант
flowctl files push templates static --url https://<домен>/cms/graphql --key <dca-api-key>

# проверка на превью-хосте (preview-<sub>.<база>) — правим и повторяем при необходимости

# публикация (после превью)
flowctl files push templates static --url … --key … --publish
```

API-ключ создаётся в админке платформы (Доступ → API-ключи, права на шаблоны/статику).
