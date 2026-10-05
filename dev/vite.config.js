import { defineConfig } from 'vite';
import { createEngine, harnessMiddleware } from './harness.mjs';

// Vite — дев-сервер ПОВЕРХ liquid-источников (источник правды — templates/ + static/).
// Любая страница рендерится liquidjs на сервере мидлварой; роутер:
//   / | /?mock=catalog | /?mock=product[&variant=not_found] | /?mock=checkout[&variant=member|empty]
//   /?mock=cart | /?mock=order[&variant=paid|not_found] | /?mock=404
//   /product/:slug, /checkout, /order/:id — реальные пути витрины
//   ?login=1 (кука dev_member) — member-режим корзины в /api/*
export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  server: { port: 5173 },
  plugins: [
    {
      name: 'shop-storefront-harness',
      configureServer(server) {
        const engine = createEngine();
        server.middlewares.use(harnessMiddleware(engine));
      }
    }
  ]
});
