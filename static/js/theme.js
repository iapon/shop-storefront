/* shop-storefront — тумблер темы, три состояния (W6 №23-24, web.dev-паттерн).
   Цикл кнопки: системная (auto) → светлая → тёмная → системная.
   «Системная» = ПУСТОЕ хранилище (cookie dynamica-theme и localStorage
   dynamica-theme удалены) — платформенный boot-скрипт в этом режиме сам
   следует за prefers-color-scheme; тоггл витрины держит тот же контракт
   (записанный выбор — ТОЛЬКО явные light|dark).

   Контракт куки платформы: тоггл пишет ОБЕ формы выбора — localStorage И
   куку dynamica-theme С domain=.<родительский домен> (две последние метки
   hostname; localhost/одниметочные/IP — host-only). Почему domain обязателен:
   платформенный boot (лендинг/сайт) кладёт куку на .dynapi.ru — она СТАРШЕ;
   тоггл, пишущий host-only куку, создаёт вторую куку с тем же именем, и
   читающая сторона берёт первую попавшуюся — тоггл «не работает». Кука с
   domain перезаписывает платформенную 1:1; выбор одинаков на всём домене.
   Понимаем обе формы значения: короткую (light|dark, как пишут админка и
   этот тоггл) и длинную (dynamica-light|dynamica-dark, как пишет boot-скрипт).

   Живой синк с ОС: matchMedia('change') — в режиме системной тема следует
   за ОС без перезагрузки. Иконка — один SVG (base.liquid): в dark-состоянии
   CSS двигает вырезку-маску (затмение) и гасит лучи; aria-label динамический
   (слоты data-theme-aria-{auto,light,dark} на body — строки словаря витрины),
   aria-live="polite" объявляет смену. */
(function () {
  'use strict';

  /* ── Скролл-гард hover-перерисовок карточек (B1-v2 глитч-фиск) ──
     На время прокрутки <html> несёт класс is-scrolling: CSS гасит
     transition карточек (html.is-scrolling .product-card) — пересечение
     курсором карточек при скролле не порождает repaint'ов вовсе
     (находка владельца: артефакт композитинга «карточка двоится» на
     слабом GPU; этот переход был единственной перерисовкой ВО ВРЕМЯ
     скролла). Класс снимается через 100ms после последнего события
     скролла — hover оживает сразу после остановки. Размещено здесь,
     а не отдельным статиком: файл и так управляет состоянием <html>
     (theme-transition) и загружен на всех страницах; новый файл =
     +1 оп визарда. */
  (function () {
    var idle = 0;
    window.addEventListener('scroll', function () {
      document.documentElement.classList.add('is-scrolling');
      window.clearTimeout(idle);
      idle = window.setTimeout(function () {
        document.documentElement.classList.remove('is-scrolling');
      }, 100);
    }, { passive: true });
  })();

  var KEY = 'dynamica-theme';
  var FALLBACK_ARIA = {
    auto: 'Тема: системная. Переключить',
    light: 'Тема: светлая. Переключить',
    dark: 'Тема: тёмная. Переключить'
  };
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function norm(v) {
    if (v === 'dark' || v === 'dynamica-dark') return 'dark';
    if (v === 'light' || v === 'dynamica-light') return 'light';
    return null;
  }

  /* Атрибут domain для куки темы: «.» + две последние метки hostname
     (sub.dynapi.ru → .dynapi.ru). Для localhost, имён без точки, IPv4 —
     пусто (host-only кука: домена нет — атрибут и не ставим). */
  function domainAttr() {
    var host = window.location.hostname;
    if (!host || host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return '';
    var parts = host.split('.');
    if (parts.length < 3) return ''; // base.domain — кука и так хостовая
    return '; domain=.' + parts.slice(-2).join('.');
  }

  /* Хранимый выбор: 'light' | 'dark' | null (null = системная). */
  function stored() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)dynamica-theme=(light|dark|dynamica-light|dynamica-dark)/);
      var c = norm(m ? decodeURIComponent(m[1]) : null);
      if (c) return c;
      c = norm(localStorage.getItem(KEY));
      if (c) return c;
    } catch (e) { /* приватный режим — живём по prefers */ }
    return null;
  }

  function osPrefersDark() { return !!(mq && mq.matches); }

  /* mode — РЕЖИМ выбора ('auto'|'light'|'dark'); тема резолвится по ОС в auto. */
  function applyMode(mode) {
    var theme = mode === 'auto' ? (osPrefersDark() ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dynamica-dark' : 'dynamica-light');
    document.documentElement.style.colorScheme = theme;
    updateToggle(mode);
  }

  function kebab(s) { return s.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); }

  function ariaText(mode) {
    var v = document.body && document.body.getAttribute ? document.body.getAttribute('data-' + kebab('themeAria' + mode.charAt(0).toUpperCase() + mode.slice(1))) : null;
    return v || FALLBACK_ARIA[mode];
  }

  function updateToggle(mode) {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.setAttribute('aria-label', ariaText(mode));
    btn.setAttribute('title', ariaText(mode).replace(/\.$/, ''));
  }

  function persist(mode) {
    try {
      if (mode === 'auto') {
        localStorage.removeItem(KEY); // системная = пустое хранилище
      } else {
        localStorage.setItem(KEY, mode);
      }
    } catch (e) { /* ignore */ }
    var attr = domainAttr();
    if (mode === 'auto') {
      /* системная: гасим и доменную, и возможный хвост host-only куки */
      document.cookie = KEY + '=; path=/; max-age=0; SameSite=Lax' + attr;
      document.cookie = KEY + '=; path=/; max-age=0; SameSite=Lax';
    } else {
      document.cookie = KEY + '=' + mode + '; path=/; max-age=31536000; SameSite=Lax' + attr;
      if (attr) {
        /* хвост прошлой версии: host-only кука без domain — гасим, чтобы
           не спорила с доменной при чтении */
        document.cookie = KEY + '=; path=/; max-age=0; SameSite=Lax';
      }
    }
  }

  function cycle(mode) { return mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto'; }

  /* boot — состояние уже выставлено inline-скриптом в <head> (до CSS,
     anti-FOUC); здесь докручиваем кнопку и подписку на ОС. */
  applyMode(stored() || 'auto');

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = cycle(stored() || 'auto');
        /* кросс-фейд 150ms — transition вешаем только на момент переключения */
        document.documentElement.classList.add('theme-transition');
        persist(next);
        applyMode(next);
        window.setTimeout(function () {
          document.documentElement.classList.remove('theme-transition');
        }, 200);
      });
    }
    /* Живой синк с ОС: в режиме системной тема следует за prefers-color-scheme. */
    var onOs = function () { if (stored() === null) applyMode('auto'); };
    if (mq) {
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onOs);
      else if (typeof mq.addListener === 'function') mq.addListener(onOs); // старый Safari
    }
  });
})();
