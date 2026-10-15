// gen-contacts.cjs — собирает templates/contacts.liquid: канон-бутстрап W8
// байт-в-байт из checkout.liquid + страница адресов из типа «Адреса».
// Запуск: node tools/gen-contacts.cjs (из корня shop-storefront).
const fs = require('fs');

const src = fs.readFileSync('templates/checkout.liquid', 'utf8');
const bsStart = src.indexOf('{%- comment -%}\n  БУТСТРАП НАСТРОЕК (W8)');
const bsEndMark = '{%- capture cur_sym %}{% include "partials/currency" %}{%- endcapture -%}';
const bsEnd = src.indexOf(bsEndMark) + bsEndMark.length;
if (bsStart < 0 || bsEnd < bsEndMark.length) {
  console.error('BOOTSTRAP NOT FOUND в checkout.liquid');
  process.exit(1);
}
const bootstrap = src.slice(bsStart, bsEnd);

const contacts = `{%- comment -%}
  contacts.liquid — страница «Контакты» магазина: адреса из типа «Адреса»
  (shop_addresses в потоке страницы, rk addr) + контакты из «Настроек магазина»
  (contact_phone/contact_email/work_hours — поля опциональны, пустое не рендерится).
  Входит в базовую установку магазина: тип address + сид самовывоза ссылаются сюда.
{%- endcomment -%}
${bootstrap}

{%- assign page_title = "Контакты" -%}
{%- assign page_canon = "/contacts" -%}
{%- assign addrs = addr.data.addresses -%}
{%- capture content -%}
<div class="shop-container section-y">
  <h1 class="product-title">Контакты</h1>
  <div class="shop-prose">
    {%- if cfg.contact_phone -%}<p>Телефон: <strong>{{ cfg.contact_phone }}</strong></p>{%- endif -%}
    {%- if cfg.contact_email -%}<p>Email: <a href="mailto:{{ cfg.contact_email }}">{{ cfg.contact_email }}</a></p>{%- endif -%}
    {%- if cfg.work_hours -%}<p>{{ cfg.work_hours }}</p>{%- endif -%}
  </div>
  <h2 class="rel-heading">Адреса самовывоза</h2>
  {%- if addrs and addrs.size > 0 -%}
  <div class="delivery-list">
    {%- for a in addrs -%}
    <div class="delivery-option">
      <span class="delivery-option-main">
        <span class="delivery-option-title">{% if a.title %}{{ a.title }}{% elsif a.city %}{{ a.city }}{% else %}Самовывоз{% endif %}</span>
        {%- if a.city and a.title -%}<span class="delivery-option-desc">{{ a.city }}</span>{%- endif -%}
        {%- if a.address -%}<span class="delivery-option-desc">{{ a.address }}</span>{%- endif -%}
        {%- if a.hours -%}<span class="delivery-option-desc">{{ a.hours }}</span>{%- endif -%}
        {%- if a.phone -%}<span class="delivery-option-desc">{{ a.phone }}</span>{%- endif -%}
      </span>
    </div>
    {%- endfor -%}
  </div>
  {%- else -%}
  <p class="field-hint">Адреса появятся здесь — добавьте их в Контент → «Адреса».</p>
  {%- endif -%}
  <p><a class="btn btn-secondary" href="__SHOP_BASE__/">В каталог</a></p>
</div>
{%- endcapture -%}
{% include "base" %}
`;

fs.writeFileSync('templates/contacts.liquid', contacts);
console.log('A2 DONE, contacts.liquid len', contacts.length);
