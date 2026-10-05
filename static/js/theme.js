/* shop-storefront — тема (sun/moon).
   Контракт темы платформы: SSR всегда отдаёт data-theme="dynamica-light";
   выбор делает ТОЛЬКО клиент:
   cookie dynamica-theme → localStorage dynamica-theme → prefers-color-scheme → light.
   Понимаем обе формы значения: короткую (light|dark, как пишет админка)
   и длинную (dynamica-light|dynamica-dark, как пишет сайт).
   Тоггл пишет ОБЕ формы: localStorage И куку С domain=.<родительский домен>
   (две последние метки hostname; localhost/одниметочные/IP — host-only).
   Почему domain обязателен: платформенный boot-скрипт (лендинг/сайт) кладёт
   куку dynamica-theme на .dynapi.ru — она СТАРШЕ; тоггл, пишущий host-only
   куку, создаёт вторую куку с тем же именем, и читающая сторона берёт первую
   попавшуюся — тоггл «не работает», страницы живут в разных темах. Кука с
   domain перезаписывает платформенную 1:1, выбор одинаков на всём домене. */
(function () {
  'use strict';

  var KEY = 'dynamica-theme';

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

  function current() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)dynamica-theme=(light|dark|dynamica-light|dynamica-dark)/);
      var c = norm(m ? decodeURIComponent(m[1]) : null);
      if (c) return c;
      c = norm(localStorage.getItem(KEY));
      if (c) return c;
    } catch (e) { /* приватный режим — живём по prefers */ }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dynamica-dark' : 'dynamica-light');
    document.documentElement.style.colorScheme = theme;
    updateToggle(theme);
  }

  function updateToggle(theme) {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.setAttribute('aria-label', theme === 'dark' ? 'Светлая тема' : 'Тёмная тема');
    var sun = btn.querySelector('[data-icon="sun"]');
    var moon = btn.querySelector('[data-icon="moon"]');
    if (sun && moon) {
      sun.style.display = theme === 'dark' ? '' : 'none';
      moon.style.display = theme === 'dark' ? 'none' : '';
    }
  }

  function persist(theme) {
    try { localStorage.setItem(KEY, theme === 'dark' ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    var attr = domainAttr();
    document.cookie = KEY + '=' + theme + '; path=/; max-age=31536000; SameSite=Lax' + attr;
    if (attr) {
      /* хвост прошлой версии: host-only кука без domain осталась у вернувшегося
         посетителя — гасим её, чтобы не спорила с доменной при чтении */
      document.cookie = KEY + '=; path=/; max-age=0; SameSite=Lax';
    }
  }

  /* boot — до первой отрисовки (скрипт дублируется inline в base.liquid;
     этот файл нужен только для тоггла). */
  apply(current());

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      /* кросс-фейд 150ms — transition вешаем только на момент переключения */
      document.documentElement.classList.add('theme-transition');
      apply(next);
      persist(next);
      window.setTimeout(function () {
        document.documentElement.classList.remove('theme-transition');
      }, 200);
    });
    updateToggle(current());
  });
})();
