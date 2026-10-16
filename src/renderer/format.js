// Wrapped so its helpers don't clash with renderer.js globals.
(() => {
'use strict';

const MC_COLORS = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
};

const TIER_COLORS = {
  COMMON: 'f', UNCOMMON: 'a', RARE: '9', EPIC: '5', LEGENDARY: '6', MYTHIC: 'd',
  DIVINE: 'b', SPECIAL: 'c', VERY_SPECIAL: 'c', ULTIMATE: '4', ADMIN: '4',
};

// Renders a Minecraft §-formatted string into DOM nodes (never via innerHTML).
function mcText(text, fallbackTier) {
  const frag = document.createDocumentFragment();
  const str = String(text || '');
  let color = fallbackTier && TIER_COLORS[fallbackTier] ? MC_COLORS[TIER_COLORS[fallbackTier]] : null;
  let bold = false;
  let italic = false;
  let buf = '';

  const flush = () => {
    if (!buf) return;
    const span = document.createElement('span');
    span.textContent = buf;
    if (color && color !== MC_COLORS[0]) span.style.color = color;
    if (bold) span.style.fontWeight = '700';
    if (italic) span.style.fontStyle = 'italic';
    frag.appendChild(span);
    buf = '';
  };

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '§' && i + 1 < str.length) {
      flush();
      const code = str[++i].toLowerCase();
      if (MC_COLORS[code]) { color = MC_COLORS[code]; bold = false; italic = false; }
      else if (code === 'l') bold = true;
      else if (code === 'o') italic = true;
      else if (code === 'r') { color = null; bold = false; italic = false; }
      continue;
    }
    buf += str[i];
  }
  flush();
  return frag;
}

function abbreviate(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const v = abs / size;
      return `${sign}${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)}${suffix}`;
    }
  }
  return `${sign}${Math.round(abs)}`;
}

function fullNumber(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

window.fmt = { mcText, abbreviate, fullNumber, timeAgo };
})();
