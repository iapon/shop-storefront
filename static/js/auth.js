/* auth.js — вход/регистрация без молчаливых тупиков (волна C).
   Перехватывает submit form.auth-form (обе формы статичны, делегирование
   не нужно), отправляет fetch и разбирает итоговый URL ответа:
     /login?failed=1                → инлайн «Неверный email или пароль»
     /register?register=taken       → инлайн + ссылка на /login
     /register?failed=1|submitted=1 → инлайн «Не получилось создать аккаунт»
     всё остальное (/account, / → /shop/) — успех, location.replace
   v1.7.1 (отзывы-вход): форма может нести data-next — локальный путь
   возврата (карточка товара, откуда кликнули «Войдите»). После УСПЕШНОГО
   входа/регистрации переходим туда; гард open-redirect обязателен:
   принимается только путь, начинающийся с ОДНОГО «/», у которого второй
   символ не «/» (protocol-relative) и не «\» (браузеры нормализуют «\»
   в «/» — «/\evil.com» превратился бы в «//evil.com»); scheme отсечён
   самим требованием ведущего «/». Всё прочее (чужой домен, «//», «\»,
   пусто) — молча игнорируется, работает серверный дефолт.
   Кнопка на время запроса: disabled + aria-busy + «Вхожу…»/«Создаём аккаунт…».
   Таймаут 10с и сетевые ошибки → инлайн «Сеть недоступна», кнопка возвращается.
   Область ошибки — .form-error (aria-live="polite"): переиспользуем
   серверную или создаём перед формой; показ — существующий токен
   data-visible="1", новых цветов нет.
   No-JS фоллбек: обычный серверный POST работает как раньше — все
   серверные редиректы ведут на страницы с видимыми сообщениями; путь
   возврата при этом НЕ соблюдается (серверные сценарии не знают next —
   интерполяция query.next в редирект без starts-with-гарда запрещена,
   open redirect) — дефолт (/ или /account) задокументирован. */
(function () {
  'use strict';

  var TIMEOUT_MS = 10000;

  var MSG_LOGIN_FAILED = 'Неверный email или пароль — попробуйте ещё раз.';
  var MSG_TAKEN = 'Такой email уже зарегистрирован — ';
  var MSG_FAILED = 'Не получилось создать аккаунт — попробуйте ещё раз.';
  var MSG_NETWORK = 'Сеть недоступна — проверьте связь и попробуйте ещё раз.';

  /* data-next → путь возврата или '' (гард open-redirect, см. шапку). */
  function safeNext(form) {
    var raw = form.getAttribute('data-next') || '';
    if (!/^\/[^/\\]/.test(raw)) return '';
    return raw;
  }

  function busyLabel(form) {
    return /\/register/.test(form.getAttribute('action') || '') ? 'Создаём аккаунт…' : 'Вхожу…';
  }

  function ensureRegion(form) {
    var region = form.parentNode.querySelector('.form-error');
    if (!region) {
      region = document.createElement('p');
      region.className = 'form-error';
      form.parentNode.insertBefore(region, form);
    }
    region.setAttribute('data-visible', '1');
    region.setAttribute('role', 'alert');
    region.setAttribute('aria-live', 'polite');
    return region;
  }

  function clearRegion(form) {
    var region = form.parentNode.querySelector('.form-error');
    if (region) {
      region.removeAttribute('data-visible');
      region.textContent = '';
    }
  }

  /* Текст + опциональная ссылка (DOM-методы, без innerHTML) */
  function showError(form, text, linkHref, linkText) {
    var region = ensureRegion(form);
    region.textContent = '';
    region.appendChild(document.createTextNode(text));
    if (linkHref) {
      var a = document.createElement('a');
      a.href = linkHref;
      a.textContent = linkText || linkHref;
      region.appendChild(a);
      region.appendChild(document.createTextNode('.'));
    }
  }

  function submitFlow(form, button) {
    var original = button.textContent;
    var busy = busyLabel(form);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = busy;

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      redirect: 'follow',
      credentials: 'same-origin',
      signal: controller.signal
    })
      .then(function (response) {
        /* Итоговый URL после follow: известные фейлы — инлайн, всё остальное
           (/account, /, /shop/ — успех следует 303-цепочкой редиректов) —
           успешный переход. */
        var url = new URL(response.url);
        var path = url.pathname;
        var q = url.searchParams;
        if (path === '/login' && q.get('failed') === '1') {
          showError(form, MSG_LOGIN_FAILED);
          return null;
        }
        if (path === '/register' && q.get('register') === 'taken') {
          showError(form, MSG_TAKEN, '/login', 'войдите');
          return null;
        }
        if (path === '/register' && (q.get('failed') === '1' || q.get('submitted') === '1')) {
          showError(form, MSG_FAILED);
          return null;
        }
        /* Успех: data-next (гард выше) → возврат на товар, иначе — как
           раньше, итоговый URL ответа (/account, / → /shop/). */
        location.replace(safeNext(form) || response.url);
        return null;
      })
      .catch(function () {
        showError(form, MSG_NETWORK);
      })
      .then(function () {
        /* finally: кнопку возвращаем всегда, кроме успешного перехода
           (страница уже заменяется — восстановление не мешает) */
        clearTimeout(timer);
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = original;
      });
  }

  var forms = document.querySelectorAll('form.auth-form');
  for (var i = 0; i < forms.length; i++) {
    (function (form) {
      var button = form.querySelector('button[type="submit"]');
      if (!button) return;
      form.addEventListener('submit', function (e) {
        if (button.disabled) { e.preventDefault(); return; }
        e.preventDefault();
        clearRegion(form);
        submitFlow(form, button);
      });
    })(forms[i]);
  }
})();
