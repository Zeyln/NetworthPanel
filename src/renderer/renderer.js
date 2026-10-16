'use strict';

const { mcText, abbreviate, fullNumber, timeAgo } = window.fmt;
const $ = (id) => document.getElementById(id);

const SOURCE_LABELS = { bazaar: 'Bazaar', auction: 'Lowest BIN', npc: 'NPC' };
const ITEM_RENDER_LIMIT = 400;

const state = {
  result: null,
  username: '',
  category: null,
  priceUpdatedAt: null,
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function show(section) {
  for (const id of ['empty', 'loading', 'error', 'result']) $(id).hidden = id !== section;
}

function money(node, value) {
  node.textContent = abbreviate(value);
  node.title = `${fullNumber(value)} coins`;
}

// ---------- prices ----------

function renderPriceStatus(status) {
  if (!status) return;
  state.priceUpdatedAt = status.updatedAt;
  const text = $('price-text');
  if (status.error) text.textContent = `Price refresh failed: ${status.error}`;
  else if (status.refreshing) text.textContent = 'Refreshing prices…';
  else text.textContent = `Prices updated ${timeAgo(status.updatedAt)}`;
  $('price-progress').hidden = !status.refreshing;
  $('price-refresh').disabled = Boolean(status.refreshing);
}

window.api.onPriceStatus(renderPriceStatus);
window.api.onPriceProgress(({ stage, done, total }) => {
  $('price-progress').hidden = false;
  $('price-refresh').disabled = true;
  $('price-progress').firstElementChild.style.width = `${Math.round((done / total) * 100)}%`;
  $('price-text').textContent = `${stage} (${done}/${total})`;
});

$('price-refresh').addEventListener('click', async () => {
  $('price-refresh').disabled = true;
  const res = await window.api.refreshPrices();
  if (res.ok) renderPriceStatus(res.data);
  if (res.ok && state.result) lookup(state.username, state.result.profile.id, { quiet: true });
});

setInterval(() => {
  if (state.priceUpdatedAt && $('price-progress').hidden && !$('price-text').textContent.startsWith('Price refresh failed')) {
    $('price-text').textContent = `Prices updated ${timeAgo(state.priceUpdatedAt)}`;
  }
}, 30000);

// ---------- lookup ----------

window.api.onLookupProgress((stage) => {
  $('loading-text').textContent = `${stage}…`;
});

async function lookup(username, profileId, { quiet = false } = {}) {
  if (!quiet) {
    show('loading');
    $('loading-text').textContent = 'Starting…';
  }
  $('search-btn').disabled = true;
  const res = await window.api.lookup(username, profileId);
  $('search-btn').disabled = false;

  if (!res.ok) {
    $('error').textContent = res.error;
    show('error');
    return;
  }
  state.username = username;
  state.result = res.data;
  if (!state.result.networth.categories.some((c) => c.key === state.category)) state.category = null;
  renderResult();
  show('result');
}

$('search').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('username').value.trim();
  if (name) lookup(name);
});

$('profile-select').addEventListener('change', (e) => {
  lookup(state.username, e.target.value);
});

// ---------- result rendering ----------

function renderResult() {
  const { player, profile, profiles, networth } = state.result;

  $('avatar').src = `https://mc-heads.net/avatar/${player.uuid}/72`;
  $('player-name').textContent = player.name;

  const select = $('profile-select');
  select.replaceChildren(...profiles.map((p) => {
    const opt = el('option', null, `${p.name}${p.selected ? ' (active)' : ''}`);
    opt.value = p.id;
    opt.selected = p.id === profile.id;
    return opt;
  }));

  const badges = $('profile-badges');
  badges.replaceChildren();
  if (profile.gameMode !== 'normal') badges.append(el('span', 'badge', profile.gameMode.replace(/_/g, ' ')));
  if (profile.members > 1) badges.append(el('span', 'badge', `co-op · ${profile.members}`));
  if (profile.level != null) badges.append(el('span', 'badge', `SB level ${profile.level}`));

  money($('total'), networth.total);
  money($('unsoulbound'), networth.unsoulbound);
  money($('coins'), networth.coins.total);
  const parts = [`Purse ${abbreviate(networth.coins.purse)}`];
  parts.push(networth.coins.bank == null ? 'Bank hidden' : `Bank ${abbreviate(networth.coins.bank)}`);
  if (networth.coins.personalBank) parts.push(`Personal ${abbreviate(networth.coins.personalBank)}`);
  $('coins-detail').textContent = parts.join(' · ');

  const warnings = $('warnings');
  const notes = [...networth.warnings];
  if (networth.unpriced.length) {
    notes.push(`${networth.unpriced.length} item${networth.unpriced.length === 1 ? '' : 's'} had no market price and count as 0.`);
  }
  warnings.replaceChildren(...notes.map((w) => el('div', null, w)));
  warnings.hidden = notes.length === 0;

  renderCategories();
  renderItems();
}

function renderCategories() {
  const { networth } = state.result;
  const itemTotal = networth.categories.reduce((s, c) => s + c.total, 0) || 1;
  const cats = [...networth.categories].sort((a, b) => b.total - a.total);

  const allCard = categoryCard({ key: null, label: 'All items', total: itemTotal, items: cats.flatMap((c) => c.items) }, 1);
  $('categories').replaceChildren(allCard, ...cats.map((c) => categoryCard(c, c.total / itemTotal)));
}

function categoryCard(cat, share) {
  const card = el('button', `cat${state.category === cat.key ? ' active' : ''}`);
  card.type = 'button';
  const top = el('div', 'cat-top');
  top.append(el('span', 'cat-label', cat.label), el('span', 'cat-value', abbreviate(cat.total)));
  const bar = el('div', 'cat-bar');
  const fill = el('div');
  fill.style.width = `${Math.max(share * 100, cat.total > 0 ? 1 : 0)}%`;
  bar.append(fill);
  card.append(top, bar, el('div', 'cat-sub', `${cat.items.length} item${cat.items.length === 1 ? '' : 's'}`));
  card.title = `${fullNumber(cat.total)} coins`;
  card.addEventListener('click', () => {
    state.category = cat.key;
    renderCategories();
    renderItems();
  });
  return card;
}

function plainName(name) {
  return String(name).replace(/§./g, '').toLowerCase();
}

function renderItems() {
  const { networth } = state.result;
  const cat = networth.categories.find((c) => c.key === state.category);
  $('detail-title').textContent = cat ? cat.label : 'All items';

  let items = cat
    ? cat.items.map((i) => ({ ...i, category: cat.label }))
    : networth.categories.flatMap((c) => c.items.map((i) => ({ ...i, category: c.label })));
  items.sort((a, b) => b.value - a.value);

  const query = $('filter').value.trim().toLowerCase();
  if (query) items = items.filter((i) => plainName(i.name).includes(query) || String(i.id).toLowerCase().includes(query));

  const list = $('items');
  if (items.length === 0) {
    list.replaceChildren(el('div', 'items-empty', query ? 'No items match the filter.' : 'Nothing here.'));
    return;
  }
  const rows = items.slice(0, ITEM_RENDER_LIMIT).map((item) => itemRow(item, !cat));
  if (items.length > ITEM_RENDER_LIMIT) {
    rows.push(el('div', 'items-empty', `${items.length - ITEM_RENDER_LIMIT} more lower-value items not shown. Use the filter to find them.`));
  }
  list.replaceChildren(...rows);
}

function itemRow(item, showCategory) {
  const row = el('details', `item${item.priced ? '' : ' unpriced'}`);
  const summary = el('summary');

  const name = el('div', 'item-name');
  name.append(mcText(item.name, item.tier));
  if (item.count > 1) name.append(el('span', 'item-count', `×${fullNumber(item.count)}`));

  const tags = el('div', 'item-tags');
  if (showCategory) tags.append(el('span', 'tag', item.category));
  if (item.source) tags.append(el('span', `tag src-${item.source}`, SOURCE_LABELS[item.source]));
  if (!item.priced) tags.append(el('span', 'tag warn', 'No price'));
  if (item.soulbound) tags.append(el('span', 'tag', 'Soulbound'));
  if (item.active) tags.append(el('span', 'tag', 'Active'));

  const value = el('div', 'item-value');
  money(value, item.value);

  summary.append(name, tags, value);
  row.append(summary);

  const breakdown = el('div', 'breakdown');
  const line = (label, v, cls) => {
    const r = el('div', `bd-row${cls ? ` ${cls}` : ''}`);
    const amount = el('span');
    money(amount, v);
    r.append(el('span', null, label), amount);
    return r;
  };
  const baseLabel = item.count > 1 ? `Base price (${fullNumber(item.count)} × ${abbreviate(item.base / item.count)})` : 'Base price';
  breakdown.append(line(`${baseLabel}${item.source ? ` · ${SOURCE_LABELS[item.source]}` : ''}`, item.base));
  for (const m of item.mods) breakdown.append(line(m.label, m.value, m.value < 0 ? 'neg' : ''));
  breakdown.append(line('Total', item.value, 'sum'));
  breakdown.append(el('div', 'bd-id', item.id));
  row.append(breakdown);
  return row;
}

$('filter').addEventListener('input', () => {
  if (state.result) renderItems();
});

// ---------- settings ----------

async function openSettings() {
  const res = await window.api.getSettings();
  if (!res.ok) return;
  $('api-key').value = '';
  $('api-key-status').textContent = res.data.hasApiKey ? `Current key: ${res.data.apiKeyHint}` : 'No key saved.';
  $('bazaar-mode').value = res.data.bazaarMode;
  $('settings').showModal();
}

$('settings-btn').addEventListener('click', openSettings);
document.querySelectorAll('[data-open-settings]').forEach((b) => b.addEventListener('click', openSettings));
$('settings-cancel').addEventListener('click', () => $('settings').close());

$('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { bazaarMode: $('bazaar-mode').value };
  const key = $('api-key').value.trim();
  if (key) payload.apiKey = key;
  const before = await window.api.getSettings();
  const res = await window.api.saveSettings(payload);
  $('settings').close();
  if (res.ok) {
    $('key-hint').hidden = res.data.hasApiKey;
    const modeChanged = before.ok && before.data.bazaarMode !== res.data.bazaarMode;
    if (state.result && (key || modeChanged)) lookup(state.username, state.result.profile.id, { quiet: true });
  }
});

// ---------- init ----------

(async () => {
  const [settings, prices] = await Promise.all([window.api.getSettings(), window.api.priceStatus()]);
  if (settings.ok) $('key-hint').hidden = settings.data.hasApiKey;
  if (prices.ok) renderPriceStatus(prices.data);
  $('username').focus();
})();
