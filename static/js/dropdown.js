/* shop-storefront — кастомный дропдаун (B1 D3).
   Паттерн WAI-ARIA APG «Select-Only Combobox»
   (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/):
   нативный <select data-dropdown> остаётся в форме ИСТОЧНИКОМ значения
   (name/value уезжают в GET-сабмит как раньше, no-JS фоллбек = селект),
   JS строит поверх кнопку role="combobox" + список role="listbox" и
   прячет селект (display:none — значение по-прежнему сабмитится).

   Контракт клавиатуры (APG):
   - закрыто: Enter/Space/ArrowDown/ArrowUp открывают (ArrowDown/Up —
     с активацией текущего/первого варианта);
   - открыто: ArrowDown/Up — активация (циклично), Home/End — края,
     PageUp/PageDown — шаг по 5, Enter/Space — выбор, Esc — закрыть без
     выбора (фокус возвращается на кнопку), Tab — закрыть и уйти дальше;
   - typeahead: печатаемые символы прыгают к варианту (сброс буфера 500ms);
   - aria-expanded / aria-controls / aria-activedescendant на кнопке,
     aria-selected на вариантах; фокус НЕ покидает кнопку (roving через
     aria-activedescendant — паттерн APG);
   - клик-вне закрывает.

   Переиспользование: следующий контрол витрины (checkout-select и т.д.)
   просто ставит data-dropdown на свой <select>. Анимация появления —
   fade + 2px сдвиг 160ms, гейтится prefers-reduced-motion (CSS).
   Тач-цели вариантов ≥44px в базе (2.75rem), на десктопе 2.25rem.

   Собственная реализация (~180 строк) вместо микробиблиотеки: ноль
   зависимостей (вендорить нечего — лицензионный вопрос отсутствует),
   точное соответствие канону витрины (токены/радиусы/фокус), полный
   APG-контракт из коробки. Решение по критериям брифа D3:
   «доступность из коробки + вес (~10 КБ без сжатия, ~3 КБ gzip) +
   отсутствие зависимостей» — самопис выигрывает у библиотек на всех трёх. */
(function () {
  'use strict';

  var SEQ = 0;

  function enhance(select) {
    if (select.getAttribute('data-dd-ready')) return select;
    select.setAttribute('data-dd-ready', '1');
    var id = ++SEQ;
    var label = select.getAttribute('aria-label') || 'Выбор варианта';

    /* кнопка-комбобокс: тот же класс поля (бордер/радиус/высота канона) */
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-btn' + (select.className.indexOf('field-input') > -1 ? ' field-input' : '');
    btn.id = select.id ? select.id + '-dd' : 'dd-btn-' + id;
    btn.setAttribute('role', 'combobox');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'dd-list-' + id);
    btn.setAttribute('aria-label', label);
    var txt = document.createElement('span');
    txt.className = 'dd-label';
    btn.appendChild(txt);
    btn.insertAdjacentHTML(
      'beforeend',
      '<svg class="dd-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m3.5 6 4.5 4.5L12.5 6"/></svg>'
    );

    var list = document.createElement('ul');
    list.className = 'dd-list';
    list.id = 'dd-list-' + id;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', label);
    list.hidden = true;

    var opts = [];
    Array.prototype.forEach.call(select.options, function (o, i) {
      var li = document.createElement('li');
      li.className = 'dd-opt';
      li.id = 'dd-opt-' + id + '-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', o.selected ? 'true' : 'false');
      li.setAttribute('data-value', o.value);
      li.tabIndex = -1;
      li.textContent = o.textContent;
      list.appendChild(li);
      opts.push(li);
    });

    var wrap = document.createElement('div');
    wrap.className = 'dd';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(btn);
    wrap.appendChild(list);
    /* селект остаётся в форме (значение сабмитится), но скрыт: display:none
       не исключает контрол из GET-сабмита */
    select.classList.add('dd-source');

    var active = -1;
    var typeBuf = '';
    var typeTimer = null;

    function selectedIdx() {
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].getAttribute('aria-selected') === 'true') return i;
      }
      return 0;
    }

    function setActive(i, scroll) {
      if (!opts.length) return;
      if (i < 0) i = opts.length - 1;
      if (i >= opts.length) i = 0;
      active = i;
      for (var k = 0; k < opts.length; k++) {
        if (k === i) opts[k].setAttribute('data-active', '1');
        else opts[k].removeAttribute('data-active');
      }
      btn.setAttribute('aria-activedescendant', opts[i].id);
      if (scroll !== false && opts[i].scrollIntoView) {
        opts[i].scrollIntoView({ block: 'nearest' });
      }
    }

    function open() {
      if (list.hidden === false) return;
      list.hidden = false;
      wrap.setAttribute('data-open', '1');
      btn.setAttribute('aria-expanded', 'true');
      setActive(selectedIdx());
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', onKey, true);
    }

    function close(refocus) {
      if (list.hidden) return;
      list.hidden = true;
      wrap.setAttribute('data-open', '0');
      btn.setAttribute('aria-expanded', 'false');
      btn.removeAttribute('aria-activedescendant');
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', onKey, true);
      typeBuf = '';
      if (refocus) btn.focus();
    }

    function choose(i) {
      if (i < 0 || i >= opts.length) return;
      for (var k = 0; k < opts.length; k++) opts[k].setAttribute('aria-selected', k === i ? 'true' : 'false');
      txt.textContent = opts[i].textContent;
      var v = opts[i].getAttribute('data-value');
      if (select.value !== v) {
        select.value = v;
        /* тот же контракт, что у нативного select: сущестующий слушатель
           change (сабмит GET-формы) продолжает работать без правок */
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      close(true);
    }

    function syncLabel() {
      var i = selectedIdx();
      txt.textContent = opts[i] ? opts[i].textContent : '';
    }

    function outside(e) {
      if (!wrap.contains(e.target)) close(false);
    }

    function typeahead(ch) {
      if (typeTimer) clearTimeout(typeTimer);
      typeBuf += ch.toLowerCase();
      typeTimer = setTimeout(function () { typeBuf = ''; }, 500);
      for (var step = 0; step < opts.length; step++) {
        var i = (active + 1 + step) % opts.length;
        if (i === active && step > 0) break;
        var t = (opts[i].textContent || '').toLowerCase();
        if (t.indexOf(typeBuf) === 0) { setActive(i); return; }
      }
    }

    function onKey(e) {
      var openNow = list.hidden === false;
      if (!openNow) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); return; }
        return; /* Enter/Space на закрытой кнопке = нативный клик (открывает) */
      }
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); e.stopPropagation(); setActive(active + 1); break;
        case 'ArrowUp': e.preventDefault(); e.stopPropagation(); setActive(active - 1); break;
        case 'Home': e.preventDefault(); e.stopPropagation(); setActive(0); break;
        case 'End': e.preventDefault(); e.stopPropagation(); setActive(opts.length - 1); break;
        case 'PageUp': e.preventDefault(); e.stopPropagation(); setActive(Math.max(0, active - 5)); break;
        case 'PageDown': e.preventDefault(); e.stopPropagation(); setActive(Math.min(opts.length - 1, active + 5)); break;
        case 'Enter':
        case ' ': /* Space */
          e.preventDefault(); e.stopPropagation(); choose(active); break;
        case 'Escape':
        case 'Esc':
          e.preventDefault(); e.stopPropagation(); close(true); break;
        case 'Tab':
          close(false); break;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(e.key);
      }
    }

    btn.addEventListener('click', function () {
      if (list.hidden) open(); else close(false);
    });
    btn.addEventListener('keydown', onKey); /* закрытое состояние: стрелки открывают */
    list.addEventListener('click', function (e) {
      var li = e.target.closest('.dd-opt');
      if (!li) return;
      for (var i = 0; i < opts.length; i++) if (opts[i] === li) { choose(i); return; }
    });

    syncLabel();
    /* внешние изменения value (back/forward, скрипты) — синк подписи */
    select.addEventListener('change', syncLabel);
    return wrap;
  }

  function init() {
    var sel = document.querySelectorAll('select[data-dropdown]');
    for (var i = 0; i < sel.length; i++) enhance(sel[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* переиспользование (волна B: checkout-select и следующие контролы) */
  window.ShopDropdown = { enhance: enhance };
})();
