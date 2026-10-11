/* shop-storefront — пикер вариантов A «WB-универсал» (v1.7.3).
   Данные отдаёт SSR: <script type="application/json" data-pv-data> —
   {default, dims: [имя…], variants: [{id, price, stock, opts: {имя: значение…}}]}.
   Разметка — radiogroup-строки на измерение (data-pv-group) с кнопками-значениями
   (data-pv-dim + data-pv-value); дефолт (первый вариант со stock > 0) выбран SSR-ом
   (канон M6: без JS переключение невозможно — кнопки type=button, автосабмита нет).

   Механика (мокапы picker-design/mock-A-*):
     - выбор значения измерения → резолв варианта по ПОЛНОМУ набору
       «имя: значение» (группировка по options-парам; D23-контракт корзины не
       меняется — кнопка «В корзину» несёт data-variant/data-stock выбранного);
     - WB-правило недоступной комбинации: значение с aria-disabled не выбирается
       (клик/Enter/стрелки мимо); выбор цвета, обнуляющего текущее прочее
       измерение, АВТО-перескакивает его на значение из первого доступного
       варианта с этим значением (приглушённое не может остаться выбранным);
     - строка статуса [data-pv-status] (aria-live): «Синий / M — 2990.00 ₽ ·
       в наличии 12» / «нет в наличии»;
     - цена [data-pv-price], бейдж [data-pv-badge] (бинарный по варианту, как
       SSR), карман кнопки [data-cart-add] (data-variant/data-stock/disabled);
     - смена варианта переставляет галерею: gallery:replace с url'ами варианта
       (карта data-gallery-map v1.7.2; у варианта нет фото/ключа → общая
       галерея «product»); галерея не критична — провал не влияет на цену/сток.

   Совместимость: слушатели — ДЕЛЕГИРОВАНИЕМ на document (паттерн cart.js/
   favorites.js) — переживают любые fetch-свапы без перевешивания; catalog:swap
   пере-читает состояние со свежего дерева (идемпотентно). Нет данных/разметки —
   скрипт молча выходит (страницы без пикера лишней работы не делают). */
(function () {
  'use strict';

  /* ── Чистая логика (без DOM) — окно для смок-проб, внутри используется
     только через объект (переопределять снаружи нельзя — смок знает). ── */
  var logic = {
    /* Точный резолв: первый вариант, у которого ВСЕ измерения совпадают
       с состоянием (сток не проверяется — выбор имеет право стоять на
       недоступной комбинации, статус честно скажет «нет в наличии»). */
    resolve: function (data, state) {
      var vars = data.variants || [];
      for (var i = 0; i < vars.length; i++) {
        if (matches(vars[i], state)) return vars[i];
      }
      return null;
    },
    /* Доступно ли значение value измерения dim при текущем выборе —
       КАСКАД (мокап A): значение выбираемо, если существует вариант со
       стоком, где оно есть и ВСЕ ПРЕДЫДУЩИЕ измерения равны состоянию.
       Первый измераемый ряд ограничен только «сток есть вообще» (клик по
       цвету никогда не блокируется — недоступную комбинацию чинит
       авто-перескок), последующие приглушаются по текущему выбору выше. */
    available: function (data, dim, value, state) {
      var dims = data.dims || [];
      var di = dims.indexOf(dim);
      var vars = data.variants || [];
      for (var i = 0; i < vars.length; i++) {
        var v = vars[i];
        if (!v || v.stock <= 0) continue;
        if (v.opts[dim] !== value) continue;
        var ok = true;
        for (var j = 0; j < di; j++) {
          if (v.opts[dims[j]] !== state[dims[j]]) { ok = false; break; }
        }
        if (ok) return true;
      }
      return false;
    },
    /* WB-автоперескок: первый вариант СО СТОКОМ, несущий выбранное значение
       этого измерения (остальные измерения берутся из него целиком). */
    jump: function (data, dim, value) {
      var vars = data.variants || [];
      for (var i = 0; i < vars.length; i++) {
        var v = vars[i];
        if (v && v.stock > 0 && v.opts[dim] === value) return v;
      }
      return null;
    }
  };

  function matches(v, state) {
    if (!v) return false;
    for (var d in state) {
      if (v.opts[d] !== state[d]) return false;
    }
    return true;
  }

  function money(kopecks) {
    return (Number(kopecks) / 100).toFixed(2);
  }

  window.ShopPickerLogic = logic;

  /* ── DOM-слой ─────────────────────────────────────────────────────── */

  var data = null;   // {default, dims, variants}
  var state = {};    // {имя измерения: значение}
  var dims = [];     // имена измерений в порядке строк

  function init() {
    var box = document.querySelector('[data-pv-data]');
    if (!box) return false;
    var parsed = null;
    try { parsed = JSON.parse(box.textContent || '{}'); } catch (e) { parsed = null; }
    if (!parsed || !Array.isArray(parsed.dims) || !Array.isArray(parsed.variants) || !parsed.variants.length) return false;
    data = parsed;
    dims = data.dims.filter(function (d) { return typeof d === 'string' && d !== ''; });
    state = {};
    var def = null;
    for (var i = 0; i < data.variants.length; i++) {
      if (data.variants[i] && data.variants[i].id === data.default) def = data.variants[i];
    }
    if (!def) def = logic.resolve(data, {}) || data.variants[0];
    if (def) {
      for (var k = 0; k < dims.length; k++) state[dims[k]] = def.opts[dims[k]];
    }
    /* каскадная доступность ДО старта: SSR приглушает только значения без
       стока вообще; живой пересчёт (мокап A: размер приглушён по цвету)
       применяется сразу, чтобы первый клик уже видел честные aria-disabled. */
    sync(logic.resolve(data, state));
    return true;
  }

  /* Имя измерения группа несёт в data-pv-group (см. sync). */
  function buttonsOf(group) {
    return group ? group.querySelectorAll('[role="radio"][data-pv-value]') : [];
  }

  function pick(dim, value, btn) {
    if (!data) return;
    if (btn && btn.getAttribute('aria-disabled') === 'true') return; // WB: приглушённое не выбирается
    state[dim] = value;
    var v = logic.resolve(data, state);
    if ((!v || v.stock <= 0)) {
      var alt = logic.jump(data, dim, value);
      if (alt) {
        for (var i = 0; i < dims.length; i++) state[dims[i]] = alt.opts[dims[i]];
        v = alt;
      }
    }
    sync(v);
  }

  function sync(v) {
    /* значения: доступность + выбор + roving tabindex.
       Группа несёт ИМЯ измерения в data-pv-group (id-стабильно к составу
       значений; индексы сырого split Liquid нечётны из-за пустых строк). */
    var groups = document.querySelectorAll('[data-pv-group]');
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var dim = group.getAttribute('data-pv-group');
      if (!dim) continue;
      var btns = buttonsOf(group);
      var anyChecked = false;
      for (var b = 0; b < btns.length; b++) {
        var btn = btns[b];
        var val = btn.getAttribute('data-pv-value');
        var live = logic.available(data, dim, val, state);
        var on = state[dim] === val && live;
        if (live) {
          btn.removeAttribute('aria-disabled');
          btn.setAttribute('aria-checked', on ? 'true' : 'false');
          btn.tabIndex = on ? 0 : -1;
        } else {
          btn.setAttribute('aria-disabled', 'true');
          btn.setAttribute('aria-checked', 'false');
          btn.tabIndex = -1;
          btn.setAttribute('aria-label', val + ', нет в наличии');
        }
        if (live) btn.setAttribute('aria-label', val);
        if (on) anyChecked = true;
      }
      /* не должно остаться скрыто выбранного: приглушённое не живёт */
      if (!anyChecked) {
        for (var b2 = 0; b2 < btns.length; b2++) {
          if (btns[b2].getAttribute('aria-disabled') !== 'true') { btns[b2].tabIndex = 0; break; }
        }
      }
      /* лейбл строки: «Цвет: Синий» (в ряду ровно один data-pv-dim-val) */
      var lab = group.parentElement && group.parentElement.querySelector('[data-pv-dim-val]');
      if (lab && state[dim] != null) lab.textContent = state[dim];
    }
    /* строка статуса */
    var status = document.querySelector('[data-pv-status]');
    if (status) {
      var vals = [];
      for (var d = 0; d < dims.length; d++) vals.push(state[dims[d]]);
      if (v) {
        status.innerHTML = '<b>' + escapeHtml(vals.join(' / ')) + '</b> — ' + money(v.price) +
          ' ₽ · ' + (v.stock > 0 ? 'в наличии ' + v.stock : '<span class="pv-status-off">нет в наличии</span>');
      } else {
        status.innerHTML = '<span class="pv-status-off">нет в наличии</span>';
      }
    }
    /* цена/бейдж/кнопка корзины (контракт B2a) + галерея (v1.7.2) */
    var priceEl = document.querySelector('[data-pv-price]');
    if (priceEl && v) priceEl.textContent = money(v.price);
    var badgeEl = document.querySelector('[data-pv-badge]');
    if (badgeEl) {
      var stock = v ? Number(v.stock) || 0 : 0;
      badgeEl.className = stock > 0 ? 'badge badge-success' : 'badge badge-error';
      badgeEl.textContent = stock > 0 ? 'В наличии' : 'Нет в наличии';
    }
    var addBtn = document.querySelector('[data-cart-add]');
    if (addBtn) {
      if (v) {
        addBtn.setAttribute('data-variant', v.id || '');
        addBtn.setAttribute('data-stock', String(Number(v.stock) || 0));
        addBtn.disabled = (Number(v.stock) || 0) <= 0;
      } else {
        addBtn.disabled = true;
      }
    }
    if (v && typeof document.dispatchEvent === 'function') {
      var gmap = null;
      var gmapEl = document.querySelector('[data-gallery-map]');
      try { gmap = gmapEl ? JSON.parse(gmapEl.textContent || '{}') : null; } catch (e) { gmap = null; }
      if (gmap) {
        var urls = gmap[v.id];
        if (!urls || !urls.length) urls = gmap.product || [];
        if (urls.length) {
          try {
            document.dispatchEvent(new CustomEvent('gallery:replace', { detail: { urls: urls } }));
          } catch (e) { /* галерея не критична — цена/сток уже обновлены */ }
        }
      }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── Делегирование (переживает свапы) ────────────────────────────── */

  document.addEventListener('click', function (ev) {
    if (!data) return;
    var btn = ev.target && ev.target.closest ? ev.target.closest('[data-variant-picker] [role="radio"][data-pv-value]') : null;
    if (!btn) return;
    var group = btn.closest('[data-pv-group]');
    if (!group) return;
    var dim = group.getAttribute('data-pv-group');
    if (!dim) return;
    pick(dim, btn.getAttribute('data-pv-value'), btn);
  });

  document.addEventListener('keydown', function (ev) {
    if (!data) return;
    var btn = ev.target && ev.target.closest ? ev.target.closest('[data-variant-picker] [role="radio"][data-pv-value]') : null;
    if (!btn) return;
    var group = btn.closest('[data-pv-group]');
    if (!group) return;
    var dim = group.getAttribute('data-pv-group');
    if (!dim) return;
    var key = ev.key;
    if (key !== 'ArrowRight' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowUp' &&
        key !== ' ' && key !== 'Spacebar' && key !== 'Enter') return;
    var btns = buttonsOf(group);
    var live = [];
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute('aria-disabled') !== 'true') live.push(btns[i]);
    }
    if (!live.length) return;
    ev.preventDefault();
    if (key === ' ' || key === 'Spacebar' || key === 'Enter') { pick(dim, btn.getAttribute('data-pv-value'), btn); return; }
    var step = (key === 'ArrowRight' || key === 'ArrowDown') ? 1 : -1;
    var cur = live.indexOf(btn);
    var next = live[((cur < 0 ? 0 : cur) + step + live.length) % live.length];
    next.focus();
    pick(dim, next.getAttribute('data-pv-value'), next);
  });

  /* fetch-свап каталога не таскает пикер (товар — нативный переход), но
     контракт совместимости: свежее дерево → пере-читаем данные. */
  document.addEventListener('catalog:swap', function () {
    data = null;
    state = {};
    init();
  });

  init();
})();
