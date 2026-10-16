'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');

const hypixel = require('./core/hypixel');
const { buildSnapshot, PriceBook } = require('./core/prices');
const { calculateNetworth } = require('./core/networth');

const PRICE_MAX_AGE_MS = 15 * 60 * 1000;
const PROFILE_CACHE_MS = 2 * 60 * 1000;

const userFile = (name) => path.join(app.getPath('userData'), name);

let win = null;
let snapshot = null;
let refreshing = null;
const profileCache = new Map(); // uuid -> { at, profiles }

// ---------- settings ----------

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(userFile('settings.json'), 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(userFile('settings.json'), JSON.stringify(settings, null, 2));
}

function getApiKey() {
  const s = readSettings();
  if (s.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(s.apiKeyEnc, 'base64'));
    } catch { /* fall through */ }
  }
  return s.apiKey || process.env.HYPIXEL_API_KEY || '';
}

function publicSettings() {
  const s = readSettings();
  const key = getApiKey();
  return {
    hasApiKey: Boolean(key),
    apiKeyHint: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : '',
    bazaarMode: s.bazaarMode || 'mid',
  };
}

function saveSettings({ apiKey, bazaarMode }) {
  const s = readSettings();
  if (typeof apiKey === 'string') {
    const trimmed = apiKey.trim();
    delete s.apiKey;
    delete s.apiKeyEnc;
    if (trimmed && safeStorage.isEncryptionAvailable()) {
      s.apiKeyEnc = safeStorage.encryptString(trimmed).toString('base64');
    } else if (trimmed) {
      s.apiKey = trimmed;
    }
    profileCache.clear();
  }
  if (['sell', 'mid', 'buy'].includes(bazaarMode)) s.bazaarMode = bazaarMode;
  writeSettings(s);
  return publicSettings();
}

// ---------- prices ----------

function loadCachedPrices() {
  try {
    snapshot = JSON.parse(fs.readFileSync(userFile('prices.json'), 'utf8'));
  } catch {
    snapshot = null;
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function refreshPrices() {
  if (refreshing) return refreshing;
  let error = null;
  refreshing = buildSnapshot((p) => send('prices:progress', p))
    .then((s) => {
      snapshot = s;
      fs.promises.writeFile(userFile('prices.json'), JSON.stringify(s)).catch(() => {});
      return s;
    })
    .catch((err) => {
      error = err.message;
      throw err;
    })
    .finally(() => {
      refreshing = null;
      send('prices:status', { ...priceStatus(), error });
    });
  send('prices:status', priceStatus());
  return refreshing;
}

function priceStatus() {
  return {
    updatedAt: snapshot ? snapshot.updatedAt : null,
    refreshing: Boolean(refreshing),
    stale: !snapshot || Date.now() - snapshot.updatedAt > PRICE_MAX_AGE_MS,
  };
}

// Use whatever prices we have; only block when there are none at all.
async function currentPrices() {
  if (!snapshot) await refreshPrices();
  else if (Date.now() - snapshot.updatedAt > PRICE_MAX_AGE_MS) refreshPrices().catch(() => {});
  return new PriceBook(snapshot, readSettings().bazaarMode || 'mid');
}

// ---------- lookup ----------

async function getProfilesCached(uuid, apiKey) {
  const hit = profileCache.get(uuid);
  if (hit && Date.now() - hit.at < PROFILE_CACHE_MS) return hit.profiles;
  const profiles = await hypixel.getProfiles(uuid, apiKey);
  profileCache.set(uuid, { at: Date.now(), profiles });
  return profiles;
}

async function lookup({ username, profileId }) {
  const apiKey = getApiKey();
  send('lookup:progress', 'Resolving player');
  const player = await hypixel.resolvePlayer(username);

  send('lookup:progress', 'Fetching SkyBlock profiles');
  const profiles = (await getProfilesCached(player.uuid, apiKey)).filter((p) => p.members && p.members[player.uuid]);
  if (profiles.length === 0) throw new Error(`${player.name} has no SkyBlock profiles.`);

  const profile = profiles.find((p) => p.profile_id === profileId)
    || profiles.find((p) => p.selected)
    || profiles[0];

  send('lookup:progress', 'Fetching museum and prices');
  const [museum, pb] = await Promise.all([
    hypixel.getMuseum(profile.profile_id, apiKey),
    currentPrices(),
  ]);

  send('lookup:progress', 'Valuing items');
  const networth = calculateNetworth({ profile, uuid: player.uuid, museum, pb });
  const member = profile.members[player.uuid];

  return {
    player,
    profile: {
      id: profile.profile_id,
      name: profile.cute_name,
      gameMode: profile.game_mode || 'normal',
      members: Object.keys(profile.members).length,
      level: member.leveling && member.leveling.experience ? Math.floor(member.leveling.experience / 100) : null,
    },
    profiles: profiles.map((p) => ({
      id: p.profile_id,
      name: p.cute_name,
      gameMode: p.game_mode || 'normal',
      selected: Boolean(p.selected),
    })),
    networth,
    prices: { updatedAt: pb.updatedAt, bazaarMode: pb.mode },
  };
}

// ---------- wiring ----------

function wrap(fn) {
  return async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  };
}

ipcMain.handle('settings:get', wrap(() => publicSettings()));
ipcMain.handle('settings:save', wrap((s) => saveSettings(s || {})));
ipcMain.handle('prices:status', wrap(() => priceStatus()));
ipcMain.handle('prices:refresh', wrap(async () => {
  await refreshPrices();
  return priceStatus();
}));
ipcMain.handle('lookup', wrap((req) => lookup(req || {})));

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e1116',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    title: 'Networth Panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  loadCachedPrices();
  createWindow();
  if (priceStatus().stale) refreshPrices().catch(() => {});
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
