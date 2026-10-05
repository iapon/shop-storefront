/* shop-storefront — корзина.
   Контракт витрины:
   - состояние живёт В ПАМЯТИ вкладки (не localStorage);
   - при загрузке гидратируется GET SHOP_BASE + /api/cart;
   - КАЖДОЕ изменение шлёт ПОЛНЫЙ массив на POST SHOP_BASE + /api/cart {items};
   - ответ сервера = канон (state := response.items);
   - счётчик в шапке — [data-cart-count];
   - сабмит чекаута перехватывается → POST SHOP_BASE + /api/checkout → location = redirect.
   API витрины (все пути — под базой магазина SHOP_BASE):
   GET  <base>/api/cart          → {items: [{slug, qty}]}
   POST <base>/api/cart          → {items: [{slug, qty}]}   (полный replace)
   POST <base>/api/checkout      → {ok: true, redirect: "<url>"} | {ok: false, error: "..."}
 */
(function () {
  'use strict';

  /* База магазина (путь каталога): сентинел __SHOP_BASE__ заменяется при
     установке магазина (визард платформы) на выбранный путь, например
     "/shop" — корень сайта оставлен лендингу. Для ручного пуша шаблонов
     замени литерал сам (см. README, раздел «__SHOP_BASE__»). */
  var SHOP_BASE = '__SHOP_BASE__';

  var state = { items: [] }; // [{slug: string, qty: number}]

  function renderCounter() {
    var n = 0;
    for (var i = 0; i < state.items.length; i++) n += Number(state.items[i].qty) || 0;
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = String(n);
      if (n > 0) el.removeAttribute('data-empty');
      else el.setAttribute('data-empty', '1');
    });
  }

  function apiCart(method, body) {
    return fetch(SHOP_BASE + '/api/cart', {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    }).then(function (r) {
      if (!r.ok) throw new Error('cart api ' + r.status);
      return r.json();
    });
  }

  function save() {
    return apiCart('POST', { items: state.items }).then(function (resp) {
      if (resp && Array.isArray(resp.items)) state.items = resp.items; // канон — сервер
      renderCounter();
    }).catch(function () { /* сеть недоступна: состояние в памяти остаётся истиной вкладки */ });
  }

  function find(slug) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].slug === slug) return state.items[i];
    return null;
  }

  function add(slug, qty) {
    qty = Math.max(1, Math.floor(Number(qty) || 1));
    var line = find(slug);
    if (line) line.qty += qty;
    else state.items.push({ slug: slug, qty: qty });
    return save();
  }

  function setQty(slug, qty) {
    var line = find(slug);
    if (!line) return Promise.resolve();
    qty = Math.floor(Number(qty) || 0);
    if (qty <= 0) state.items = state.items.filter(function (l) { return l.slug !== slug; });
    else line.qty = qty;
    return save();
  }

  function remove(slug) {
    state.items = state.items.filter(function (l) { return l.slug !== slug; });
    return save();
  }

  /* Позиции чекаута рендерит сервер (SSR-состояние канонично): после
     удаления позиции или очистки перезагружаем страницу — пустая корзина
     честно превращается во вежливое пустое состояние, суммы пересчитываются
     на сервере. Счётчик в шапке обновляется и до перезагрузки. */
  function refreshCartPage() {
    if (document.querySelector('[data-checkout-form]')) window.location.reload();
  }

  /* ── Гидратация ─────────────────────────────────────────── */
  apiCart('GET').then(function (resp) {
    if (resp && Array.isArray(resp.items)) state.items = resp.items;
    renderCounter();
  }).catch(function () { renderCounter(); });

  /* ── Делегирование кликов витрины ───────────────────────── */
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-cart-add]');
    if (btn) {
      ev.preventDefault();
      if (btn.disabled) return;
      var slug = btn.getAttribute('data-cart-add');
      var qtyEl = document.querySelector('[data-cart-qty]');
      var qty = qtyEl ? qtyEl.value : 1;
      btn.disabled = true;
      add(slug, qty).then(function () { btn.disabled = false; });
      return;
    }
    var rm = ev.target.closest('[data-cart-remove]');
    if (rm) {
      ev.preventDefault();
      remove(rm.getAttribute('data-cart-remove')).then(refreshCartPage);
      return;
    }
    var clr = ev.target.closest('[data-cart-clear]');
    if (clr) {
      ev.preventDefault();
      state.items = [];
      save().then(refreshCartPage);
    }
  });

  document.addEventListener('change', function (ev) {
    var input = ev.target.closest('[data-cart-qty-line]');
    if (input) setQty(input.getAttribute('data-cart-qty-line'), input.value);
  });

  /* ── Сабмит чекаута ─────────────────────────────────────── */
  document.addEventListener('submit', function (ev) {
    var form = ev.target.closest('[data-checkout-form]');
    if (!form) return;
    ev.preventDefault();
    var errBox = form.querySelector('[data-form-error]');
    var btn = form.querySelector('button[type="submit"]');
    function fail(msg) {
      if (errBox) { errBox.textContent = msg; errBox.setAttribute('data-visible', '1'); }
      if (btn) btn.disabled = false;
    }
    function val(name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? String(el.value).trim() : '';
    }
    var payload = {
      customer: { name: val('name'), email: val('email'), phone: val('phone') },
      comment: val('comment'),
      website: val('website'), // honeypot: человек оставляет пустым
      // Страховка: слоты корзины (slug+qty) дублируются в теле — сервер всё
      // равно считает цены и суммы по своему каталогу.
      items: state.items
    };
    if (errBox) errBox.removeAttribute('data-visible');
    if (btn) btn.disabled = true;
    if (!payload.customer.name || !payload.customer.email) {
      fail('Заполните имя и email.');
      return;
    }
    fetch(SHOP_BASE + '/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json().catch(function () { throw new Error('bad json'); }); })
      .then(function (resp) {
        if (resp && resp.ok && resp.redirect) { window.location.assign(resp.redirect); return; }
        fail(resp && resp.error === 'cart_invalid'
          ? 'Корзина недоступна или пуста — обновите страницу.'
          : 'Не удалось оформить заказ. Попробуйте ещё раз.');
      })
      .catch(function () { fail('Не удалось оформить заказ. Попробуйте ещё раз.'); });
  });
})();
