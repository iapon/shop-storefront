/* shop-storefront — тема (sun/moon).
   Контракт темы платформы: SSR всегда отдаёт data-theme="dynamica-light";
   выбор делает ТОЛЬКО клиент:
   cookie dynamica-theme → localStorage dynamica-theme → prefers-color-scheme → light.
   Понимаем обе формы значения: короткую (light|dark, как пишет админка)
   и длинную (dynamica-light|dynamica-dark, как пишет сайт).
   Тоггл пишет обе формы (localStorage + host-only куку — выбор живёт в
   пределах этого сабдомена; наследование темы с лендинга/из админки приезжает
   через boot-скрипт, если платформа проставила куку домена). */
(function () {
  'use strict';

  var KEY = 'dynamica-theme';

  function norm(v) {
    if (v === 'dark' || v === 'dynamica-dark') return 'dark';
    if (v === 'light' || v === 'dynamica-light') return 'light';
    return null;
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
    document.cookie = 'dynamica-theme=' + theme + '; path=/; max-age=31536000; SameSite=Lax';
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
