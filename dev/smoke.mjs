// Smoke: liquidjs рендерит все страницы витрины с моками БЕЗ исключений.
// Запуск: npm run smoke (из dev/) — падает с ненулевым кодом при ошибке рендера
// или отсутствии ключевых маркеров в HTML.
import { createEngine, renderMockPage } from './harness.mjs';

const engine = createEngine();
const q = { cat: '', page: '' };

const cases = [
  ['catalog', null, ['Кружка «Лён»', '990.00', 'Керамика', 'product-card', 'Каталог']],
  ['product', null, ['Кружка «Лён»', '990.00', 'В корзину', 'В наличии']],
  ['product', 'not_found', ['Товар не найден']],
  ['checkout', 'guest', ['Ваш заказ', 'Контакты', '1980.00', 'name="website"', 'Перейти к оплате']],
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

if (failed) {
  console.log(`smoke: ${failed}/${cases.length} FAIL`);
  process.exit(1);
}
console.log(`smoke: ${cases.length}/${cases.length} OK`);
