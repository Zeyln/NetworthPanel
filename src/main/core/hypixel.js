'use strict';

const API = 'https://api.hypixel.net/v2';

// Prefer Electron's net.fetch (honours system/corporate proxy settings);
// fall back to Node's fetch so the core can be exercised outside Electron.
function getFetch() {
  try {
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.net) return electron.net.fetch.bind(electron.net);
  } catch { /* not running in Electron */ }
  return globalThis.fetch;
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function getJson(url, headers = {}) {
  const res = await getFetch()(url, { headers: { Accept: 'application/json', ...headers } });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok || (body && body.success === false)) {
    const cause = body && (body.cause || body.errorMessage || body.error);
    if (res.status === 403) throw new ApiError('Hypixel rejected the API key. Check it in Settings.', 403);
    if (res.status === 429) throw new ApiError('Rate limited by Hypixel. Wait a minute and try again.', 429);
    throw new ApiError(cause ? String(cause) : `Request failed (HTTP ${res.status})`, res.status);
  }
  return body;
}

async function resolvePlayer(name) {
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(trimmed)) throw new ApiError('That is not a valid Minecraft username.', 400);
  try {
    const body = await getJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(trimmed)}`);
    if (body && body.id) return { uuid: body.id, name: body.name };
  } catch (err) {
    if (err.status !== 404 && err.status !== 204) {
      // Mojang is flaky; try a mirror before giving up.
      const body = await getJson(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(trimmed)}`);
      const p = body && body.data && body.data.player;
      if (p) return { uuid: p.raw_id || p.id.replace(/-/g, ''), name: p.username };
    }
  }
  throw new ApiError(`No Minecraft account named "${trimmed}".`, 404);
}

const keyed = (apiKey) => {
  if (!apiKey) throw new ApiError('A Hypixel API key is required. Add one in Settings.', 401);
  return { 'API-Key': apiKey };
};

async function getProfiles(uuid, apiKey) {
  const body = await getJson(`${API}/skyblock/profiles?uuid=${uuid}`, keyed(apiKey));
  return body.profiles || [];
}

async function getMuseum(profileId, apiKey) {
  try {
    const body = await getJson(`${API}/skyblock/museum?profile=${profileId}`, keyed(apiKey));
    return body.members || {};
  } catch {
    return {}; // museum API disabled or unavailable shouldn't block the rest
  }
}

const getBazaar = () => getJson(`${API}/skyblock/bazaar`);
const getItems = () => getJson(`${API}/resources/skyblock/items`);
const getAuctionPage = (page) => getJson(`${API}/skyblock/auctions?page=${page}`);

module.exports = { ApiError, resolvePlayer, getProfiles, getMuseum, getBazaar, getItems, getAuctionPage };
