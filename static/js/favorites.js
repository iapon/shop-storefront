/* shop-storefront — избранное (B2c, F1: JS-гидратация).
   Контракт витрины:
   - сердечки рендерятся SSR-НЕЙТРАЛЬНЫМИ (пустой контур) на каталогах и
     карточке товара — факт «в избранном» докатывает этот скрипт ОДНИМ GET
     после загрузки; честный SSR-факт — только страница /favorites (TTL 0);
   - состояние живёт В ПАМЯТИ вкладки (не localStorage); КАЖДОЕ изменение
     шлёт ПОЛНЫЙ массив slug'ов на POST (replace-семантика корзины); ответ
     сервера = канон (state := response.slugs);
   - делегирование на document (паттерн cart.js): переживает fetch-свап
     каталога БЕЗ перевешивания; после события catalog:swap состояние
     пере-применяется к свежим сердечкам (свап меняет innerHTML — новые
     кнопки SSR-нейтральны, факта в них нет);
   - гость — аноним из куки shop_cart (её при первом тоггле выдаёт сам
     API-флоу), member — id сессии; при логине сервер объединяет наборы
     (union слагов — механика миграции корзины).
   API (пути — под базой магазина SHOP_BASE):
     GET  <base>/api/favorites            → {slugs: ["kruzhka", …]}
     POST <base>/api/favorites {slugs}    → {slugs: [...]}   (полный replace)
   Без JS сердечко декоративно: кнопка вне ссылки карточки, тоггл
   недоступен, витрина не ломается; /favorites остаётся честной (SSR).
   Переключение состояния — МГНОВЕННОЕ, без анимации (F1): ни transition,
   ни keyframes — ни в CSS, ни здесь. */
(function () {
  'use strict';

  /* База магазина (путь каталога): сентинел __SHOP_BASE__ заменяется при
     установке магазина (визард платформы) на выбранный путь, например
     "/shop" — корень сайта оставлен лендингу. Для ручного пуша шаблонов
     замени литерал сам (см. README, раздел «__SHOP_BASE__»). */
  var SHOP_BASE = '__SHOP_BASE__';

  var state = { slugs: [] };

  function has(slug) {
    return state.slugs.indexOf(slug) !== -1;
  }

  function buttons() {
    return document.querySelectorAll('[data-fav-toggle]');
  }

  /* Применить состояние к текущему дереву: aria-pressed по наличию слага.
     Вызывается после гидратации, после каждого тоггла и после catalog:swap.
     Смена aria-pressed (и значения aria-label не происходит — лейбл
     стабильный, состояние объявляет aria-pressed, APG button-pattern). */
  function apply() {
    var btns = buttons();
    for (var i = 0; i < btns.length; i++) {
      var slug = btns[i].getAttribute('data-fav-toggle');
      btns[i].setAttribute('aria-pressed', has(slug) ? 'true' : 'false');
    }
  }

  function api(method, body) {
    return fetch(SHOP_BASE + '/api/favorites', {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    }).then(function (r) {
      if (!r.ok) throw new Error('favorites api ' + r.status);
      return r.json();
    });
  }

  /* Гидратация: ОДИН GET на загрузке — и только если на странице есть
     сердечки (чекаут/кабинет/документные страницы лишнего запроса не
     делают). Нет связи — сердечки остаются нейтральными: SSR-контракт
     «пустое = не отмечено» не врёт про чужие наборы (кэш каталогов TTL 300
     шарится между гостями — SSR-факт на карточках невозможен, F1). */
  if (buttons().length) {
    api('GET').then(function (resp) {
      if (resp && Array.isArray(resp.slugs)) state.slugs = resp.slugs;
      apply();
    }).catch(function () { /* нейтральное состояние остаётся честным */ });
  }

  /* Ре-гидрация после fetch-свапа каталога: слушатели и так живут на
     document (делегирование переживает свап), а новым кнопкам нужно
     состояние — применяем набор из памяти БЕЗ повторного GET.
     Нет catalog.js (страница товара) — подписка просто не срабатывает. */
  document.addEventListener('catalog:swap', apply);

  /* Тоггл: состояние меняется мгновенно, POST несёт ПОЛНЫЙ массив
     (replace, как корзина), ответ сервера = канон. Провал записи — честный
     откат состояния (витрина не изображает «сохранили», когда не сохранилось). */
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-fav-toggle]');
    if (!btn) return;
    ev.preventDefault();
    var slug = btn.getAttribute('data-fav-toggle');
    var next = [];
    var removed = false;
    for (var i = 0; i < state.slugs.length; i++) {
      if (state.slugs[i] === slug) { removed = true; continue; }
      next.push(state.slugs[i]);
    }
    if (!removed) next.push(slug);
    var prev = state.slugs;
    state.slugs = next;
    apply();
    api('POST', { slugs: state.slugs }).then(function (resp) {
      if (resp && Array.isArray(resp.slugs)) state.slugs = resp.slugs;
      apply();
    }).catch(function () {
      state.slugs = prev;
      apply();
    });
  });
})();
