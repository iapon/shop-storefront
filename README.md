# shop-storefront — витрина интернет-магазина для DynapiCMS

Liquid-шаблоны, статика и дев-харнесс витрины. Установка магазина — из
админки платформы; этот репозиторий — только витрина/тема.

```
templates/   # 7 liquid-файлов — источник правды разметки
static/      # css/tokens.css (тема), css/shop.css, js/cart.js, js/theme.js, favicon.svg
mock/        # фикстуры данных страниц для дев-харнесса
dev/         # Vite-харнесс: liquidjs + шимы платформенных фильтров + smoke
```

## Локальное превью

```bash
cd dev
npm install
npm run dev        # http://localhost:5173/?mock=catalog
npm run smoke      # рендер всех страниц с моками, без исключений
npm run build      # сборка харнесса
```

Роутер харнесса: `/?mock=catalog|product|checkout|cart|order|404`
(варианты: `&variant=not_found` для product, `member|empty` для checkout,
`paid|not_found` для order). Реальные пути витрины тоже работают:
`/`, `/product/:slug`, `/checkout`, `/order/:id`, любой несовпавший путь — 404.
API корзины (`GET/POST /api/cart`, `POST /api/checkout`) эмулируется в памяти;
режим member — кука `dev_member=1`.

Дев-рендер — liquidjs с шимами платформенных фильтров (`dev/harness.mjs`);
финальная инстанс любой правки — превью-хост платформы.

## Правки стилей и разметки

- **Тема/бренд — только `static/css/tokens.css`.** Все цвета, радиусы, тени,
  шкала текста и контейнеры — переменные `--shop-*`; тёмная тема — тот же
  файл, блок `[data-theme="dynamica-dark"]`. Название магазина —
  `${SHOP_NAME}` в `templates/base.liquid` (заменяется при установке; руками —
  просто впишите название).
- **Разметка** — правьте `templates/*.liquid` и `static/css/shop.css`.
  Шаблоны рендерятся Liquid-движком платформы: доступные переменные — это
  биндинги страниц (`p.data.products`, `cart.data.carts`, … — см. моки в
  `mock/`, они повторяют их форму) и `site.version` для кэш-бастинга статики
  (`/static/...?v={{ site.version }}`).
- Паттерн страницы: `{% capture content %}…{% endcapture %}{% include "base" %}`.
- Проверка: `npm run smoke` (должен быть 11/11 OK), затем превью на платформе.

## Деплой шаблонов в свой проект

```bash
# draft-загрузка шаблонов и статики в свой тенант
flowctl files push templates static --url https://<домен>/cms/graphql --key <dca-api-key>

# проверка на превью-хосте (preview-<sub>.<база>) — правим и повторяем при необходимости

# публикация (после превью)
flowctl files push templates static --url … --key … --publish
```

API-ключ создаётся в админке платформы (Доступ → API-ключи, права на шаблоны/статику).
