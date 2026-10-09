/* catalog.js — каталог/категория без полных перезагрузок (волна C).
   Делегирование на document (переживает любые свапы):
     - submit формы form[data-cat-tools] (поиск/«Найти», сортировка через
       requestSubmit) → GET-URL из полей формы (пустые поля выбрасываются —
       в URL не тащится q=);
     - клики a[href] внутри контентной области [data-shop-main], чей target —
       страница каталога/категории (по data-cat-base контейнера): чипы,
       применённые фильтры, пагинация, крошки;
     - popstate → тот же свап по location.href.
   Механика: fetch(url) (таймаут 8с) → DOMParser → проверка контейнера
   [data-shop-main] → swap innerHTML + document.title. Любая неудача
   (не-2xx / нет контейнера / сеть / таймаут) → location.assign(url):
   страница НИКОГДА не остаётся в поломанном состоянии, no-JS контракт
   (полный SSR-HTML на прямом заходе) не тронут.
   После свапа: событие catalog:swap (инлайновый UI-скрипт шаблонов
   перевешивает слушатели на новое дерево), пере-энханс дропдаунов
   (window.ShopDropdown), автоскролл крошек, aria-live «Найдено: N»,
   плавный скролл к тулбару если юзер ниже него, фокус на контейнер
   (tabindex="-1" — заголовок области результатов).
   Товар/чекаут/оферта — сознательно НАТИВНЫЕ переходы (не наш контейнер). */
(function () {
  'use strict';

  var TIMEOUT_MS = 8000;
  var inflight = null;
  var currentUrl = location.href;

  function container() {
    return document.querySelector('[data-shop-main]');
  }

  /* Страница-цель свапаема? Только каталог (base и base без слеша) и
     категории (base + category/…). Товар/чекаут/оферта — мимо. */
  function swappable(url) {
    var c = container();
    if (!c) return false;
    var base = c.getAttribute('data-cat-base') || '/';
    if (base.charAt(base.length - 1) !== '/') base += '/';
    var p = url.pathname;
    return p === base || p === base.slice(0, -1) || p.indexOf(base + 'category/') === 0;
  }

  function urlFromForm(form) {
    var url = new URL(form.getAttribute('action') || location.href, location.href);
    var sp = new URLSearchParams();
    new FormData(form).forEach(function (v, k) {
      if (String(v).trim() !== '') sp.append(k, v);
    });
    url.search = sp.toString();
    return url;
  }

  function ensureLive() {
    var live = document.querySelector('[data-cat-live]');
    if (!live) {
      live = document.createElement('span');
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('data-cat-live', '');
      document.body.appendChild(live);
    }
    return live;
  }

  function swap(fresh, title, finalUrl) {
    var cur = container();
    if (!cur) { location.assign(finalUrl); return; }
    cur.innerHTML = fresh.innerHTML;
    document.title = title;
    currentUrl = finalUrl;

    /* пере-инициализация: инлайновый UI-скрипт шаблона слушает catalog:swap
       (реентерабельная версия — см. шаблоны), дропдауны — ShopDropdown */
    document.dispatchEvent(new CustomEvent('catalog:swap'));
    if (window.ShopDropdown) {
      var selects = cur.querySelectorAll('select[data-dropdown]');
      for (var i = 0; i < selects.length; i++) window.ShopDropdown.enhance(selects[i]);
    }
    /* мобайл: крошки в одну строку — автоскролл к текущей (аналог
       инлайнового скрипта partials/breadcrumbs, который при свапе не
       перезапускается) */
    var crumb = cur.querySelector('[data-crumb-list]');
    if (crumb) crumb.scrollLeft = crumb.scrollWidth;

    /* «Найдено: N» — из счётчика тулбара */
    var count = cur.querySelector('[data-cat-count]');
    var n = count ? (count.textContent.match(/(\d+)/) || [])[1] : null;
    if (n) ensureLive().textContent = 'Найдено: ' + n;

    /* скролл: если юзер ниже тулбара — плавно к его началу; фокус — на
       контейнер (tabindex="-1"), скролл от фокуса подавлен */
    var tools = cur.querySelector('[data-cat-tools]');
    if (tools && tools.getBoundingClientRect().top < 0) {
      tools.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    cur.focus({ preventScroll: true });
    return true;
  }

  function navigate(url, push) {
    var c = container();
    if (!c) return;
    /* этот же URL уже летит — второй клик не дублирует запрос */
    if (inflight && !inflight.signal.aborted && inflight.__url === url.href) return;
    if (inflight) inflight.abort();
    var controller = new AbortController();
    controller.__url = url.href;
    inflight = controller;
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    fetch(url.href, {
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { 'X-Requested-With': 'shop-catalog' }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text().then(function (html) { return { html: html, url: r.url }; });
      })
      .then(function (res) {
        clearTimeout(timer);
        var doc = new DOMParser().parseFromString(res.html, 'text/html');
        var fresh = doc.querySelector('[data-shop-main]');
        if (!fresh) {
          /* цель оказалась не каталогом/категорией — полная навигация */
          location.assign(res.url || url.href);
          return;
        }
        var finalUrl = res.url || url.href;
        /* pushState ДО свапа: пере-инициализация инлайнового UI-скрипта
           (событие catalog:swap внутри swap) читает уже новый location */
        if (push !== false) history.pushState({}, '', finalUrl);
        swap(fresh, doc.title, finalUrl);
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (err && err.name === 'AbortError') return; /* отменено новым переходом */
        location.assign(url.href); /* сеть/таймаут/не-2xx — безопасный фоллбек */
      });
  }

  /* ── делегирование ─────────────────────────────────────────────── */

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.matches || !form.matches('form[data-cat-tools]')) return;
    if (!container()) return;
    if ((form.getAttribute('method') || 'get').toLowerCase() !== 'get') return;
    e.preventDefault();
    navigate(urlFromForm(form), true);
  });

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !container() || !container().contains(a)) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (a.getAttribute('target')) return;
    if (!swappable(url)) return; /* товар/чекаут/оферта — нативно */
    e.preventDefault();
    navigate(url, true);
  });

  window.addEventListener('popstate', function () {
    if (location.href === currentUrl) return;
    var url = new URL(location.href);
    if (!swappable(url)) { location.assign(location.href); return; }
    navigate(url, false);
  });

  /* API для инлайновых UI-скриптов шаблонов: драверы/листы сортировки
     строят URL сами и отдают сюда (fetch-свап вместо location.assign). */
  window.ShopCatalog = {
    navigate: function (href) {
      var url = new URL(href, location.href);
      if (!swappable(url)) { location.assign(href); return; }
      navigate(url, true);
    }
  };
})();
