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
   POST <base>/api/checkout      → {ok: true, redirect: "<url>"}
                                 | {ok: false, error: "stock_exceeded", slug, max}
                                 | {ok: false, error: "payment_failed", order_id}
                                 | {ok: false, error: "cart_invalid"}
   POST <base>/api/retry-payment → {ok: true, redirect: "<url>"} | {ok: false, error: "..."}
 */
(function () {
  'use strict';

  /* База магазина (путь каталога): сентинел __SHOP_BASE__ заменяется при
     установке магазина (визард платформы) на выбранный путь, например
     "/shop" — корень сайта оставлен лендингу. Для ручного пуша шаблонов
     замени литерал сам (см. README, раздел «__SHOP_BASE__»). */
  var SHOP_BASE = '__SHOP_BASE__';

  var state = { items: [] }; // [{slug: string, qty: number}]

  /* Мост текстов: шаблон рендерит data-msg-* на <body> (константы шаблона);
     здесь — чтение атрибута с вшитым фоллбеком. */
  function msg(name, fallback) {
    var v = document.body ? document.body.getAttribute('data-msg-' + name) : null;
    return v || fallback;
  }

  function renderCounter() {
    var n = 0;
    for (var i = 0; i < state.items.length; i++) n += Number(state.items[i].qty) || 0;
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = String(n);
      if (n > 0) el.removeAttribute('data-empty');
      else el.setAttribute('data-empty', '1');
    });
  }

  /* W9 (F6a): живой регион предупреждений корзины ([data-cart-note] на
     странице товара и в чекауте). Появляется при clamp количества до
     остатка и при неудачной записи корзины — витрина не молчит. */
  var noteTimer = null;
  function note(text) {
    var el = document.querySelector('[data-cart-note]');
    if (!el) return;
    el.textContent = text;
    el.setAttribute('data-visible', '1');
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function () {
      el.removeAttribute('data-visible');
      el.textContent = '';
    }, 4000);
  }

  /* «В наличии только N шт.»: шаблон строки рендерит в data-stock-tpl на
     body (литерал {{n}} доезжает через assign — паттерн ph_n); здесь
     подставляем число. Фоллбек вшит. */
  function stockOnlyMsg(n) {
    var tpl = document.body ? document.body.getAttribute('data-stock-tpl') : null;
    return (tpl || 'В наличии только {{n}} шт.').replace('{{n}}', String(n));
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
    }).catch(function () {
      /* W9 (F9): неудача записи больше НЕ молчит — раньше тихий провал
         возвращал после перезагрузки прежний SSR-cart, и «×» выглядел
         сломанным. Состояние в памяти остаётся истиной вкладки. */
      note(msg('save-failed', 'Не удалось обновить корзину — проверьте связь и попробуйте ещё раз.'));
    });
  }

  function find(slug) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].slug === slug) return state.items[i];
    return null;
  }

  /* cap — остаток товара (data-stock кнопки «В корзину», 0 = неизвестен):
     попытка добавить больше гасится до остатка С сообщением (F6a), не молча. */
  function add(slug, qty, cap) {
    qty = Math.max(1, Math.floor(Number(qty)) || 1);
    var line = find(slug);
    var next = (line ? line.qty : 0) + qty;
    cap = Number(cap) || 0;
    if (cap > 0 && next > cap) {
      next = cap;
      note(stockOnlyMsg(cap));
    }
    if (line) line.qty = next;
    else state.items.push({ slug: slug, qty: next });
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
     изменения/удаления позиции или очистки перезагружаем страницу — пустая
     корзина честно превращается во вежливое пустое состояние, суммы
     пересчитываются на сервере. Счётчик в шапке обновляется и до перезагрузки. */
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
      var cap = Number(btn.getAttribute('data-stock')) || 0; // W9 F6a: карман остатка
      btn.disabled = true;
      add(slug, qty, cap).then(function () { btn.disabled = false; });
      return;
    }
    /* Степпер количества на карточке (D23): крутит существующий
       [data-cart-qty], контракт add(slug, qty) не меняется. */
    var stp = ev.target.closest('[data-qty-step]');
    if (stp) {
      ev.preventDefault();
      var box = stp.closest('[data-cart-stepper]') || document;
      var inp = box.querySelector('[data-cart-qty]');
      if (!inp) return;
      var cur = Math.max(1, Math.floor(Number(inp.value) || 1));
      inp.value = cur + Number(stp.getAttribute('data-qty-step') || 0);
      if (Number(inp.value) < 1) inp.value = 1;
      return;
    }
    /* Степперы строк чекаута (D23): replace-семантика — setQty полным
       массивом; data-stock гасит бессмысленный заход за остаток
       (серверный гард остаётся истиной). W9 (F6a): гашение НЕ молча —
       появляется «В наличии только N шт.» (data-cart-note). */
    var inc = ev.target.closest('[data-cart-qty-inc]');
    if (inc) {
      ev.preventDefault();
      var s1 = inc.getAttribute('data-cart-qty-inc');
      var line1 = find(s1);
      var q1 = ((line1 ? Number(line1.qty) : 0) || 0) + 1;
      var cap = Number(inc.getAttribute('data-stock')) || 0;
      if (cap > 0 && q1 > cap) { q1 = cap; note(stockOnlyMsg(cap)); }
      setQty(s1, q1).then(refreshCartPage);
      return;
    }
    var dec = ev.target.closest('[data-cart-qty-dec]');
    if (dec) {
      ev.preventDefault();
      var s2 = dec.getAttribute('data-cart-qty-dec');
      var line2 = find(s2);
      var q2 = ((line2 ? Number(line2.qty) : 1) || 1) - 1;
      setQty(s2, q2).then(refreshCartPage); // qty 0 = строка исчезает (replace)
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
    function fail(msgText) {
      if (errBox) { errBox.textContent = msgText; errBox.setAttribute('data-visible', '1'); }
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
      fail(msg('fill', 'Заполните имя и email.'));
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
        /* W9 (F7): платёж не прошёл (тестовые/недействительные ключи ЮKassa) —
           заказ СОЗДАН; честный путь ведёт на страницу заказа с экраном
           «Платёж не прошёл» и кнопкой «Повторить оплату». */
        if (resp && resp.error === 'payment_failed' && resp.order_id) {
          window.location.assign(SHOP_BASE + '/order/' + encodeURIComponent(resp.order_id) + '?payment=failed');
          return;
        }
        /* W9 (F6в): перебор остатка блокирует оформление С СООБЩЕНИЕМ
           («В наличии только N шт.» — тот же текст, что у строки), не молча. */
        if (resp && resp.error === 'stock_exceeded') {
          var max = Number(resp.max) || 0;
          fail(max > 0 ? stockOnlyMsg(max) : msg('stock', 'В корзине больше, чем есть в наличии — уменьшите количество.'));
          if (btn) btn.disabled = false;
          return;
        }
        fail(resp && resp.error === 'cart_invalid'
          ? msg('cart-invalid', 'Корзина недоступна или пуста — обновите страницу.')
          : msg('checkout-failed', 'Не удалось оформить заказ. Попробуйте ещё раз.'));
      })
      .catch(function () { fail(msg('checkout-failed', 'Не удалось оформить заказ. Попробуйте ещё раз.')); });
  });
})();
