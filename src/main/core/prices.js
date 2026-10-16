'use strict';

const hypixel = require('./hypixel');
const { decodeItems } = require('./nbt');
const { priceKey, parsePetInfo, petBaseKey, petBucket } = require('./keys');

const AUCTION_CONCURRENCY = 6;

const tick = () => new Promise((resolve) => setImmediate(resolve));

// Pulls bazaar, the full active auction house and the item catalogue, and
// reduces them to a compact snapshot that can be cached on disk.
async function buildSnapshot(onProgress = () => {}) {
  onProgress({ stage: 'Fetching bazaar and item catalogue', done: 0, total: 1 });
  const [bazaarRes, itemsRes, firstPage] = await Promise.all([
    hypixel.getBazaar(),
    hypixel.getItems(),
    hypixel.getAuctionPage(0),
  ]);

  const bazaar = {};
  for (const [id, product] of Object.entries(bazaarRes.products || {})) {
    const q = product.quick_status || {};
    bazaar[id] = [round(q.sellPrice), round(q.buyPrice)];
  }

  const items = {};
  for (const item of itemsRes.items || []) {
    const meta = { name: item.name, tier: item.tier || null };
    if (item.npc_sell_price) meta.npc = item.npc_sell_price;
    if (item.category) meta.category = item.category;
    if (item.upgrade_costs) meta.upgrade_costs = item.upgrade_costs;
    if (item.gemstone_slots) meta.gemstone_slots = item.gemstone_slots;
    if (item.soulbound) meta.soulbound = true;
    items[item.id] = meta;
  }

  const bins = {};
  const binCounts = {};
  const record = (key, price) => {
    if (!key || !(price > 0)) return;
    if (bins[key] === undefined || price < bins[key]) bins[key] = price;
    binCounts[key] = (binCounts[key] || 0) + 1;
  };

  const ingest = async (page) => {
    for (const auction of page.auctions || []) {
      if (!auction.bin) continue;
      let item;
      try {
        [item] = decodeItems(auction.item_bytes);
      } catch {
        continue;
      }
      if (!item || !item.id) continue;
      const unit = auction.starting_bid / (item.count || 1);
      if (item.id === 'PET') {
        const pet = parsePetInfo(item.ea);
        if (!pet || !pet.type) continue;
        const base = petBaseKey(pet);
        record(base, unit);
        const bucket = petBucket(pet);
        if (bucket) record(`${base}_${bucket}`, unit);
        continue;
      }
      record(priceKey(item.ea), unit);
    }
    await tick();
  };

  const totalPages = firstPage.totalPages || 1;
  let done = 1;
  onProgress({ stage: 'Scanning auction house', done, total: totalPages });
  await ingest(firstPage);

  let next = 1;
  const worker = async () => {
    while (next < totalPages) {
      const page = next++;
      try {
        await ingest(await hypixel.getAuctionPage(page));
      } catch {
        // A page can 404 if the AH rolls over mid-scan; the rest is still useful.
      }
      done++;
      onProgress({ stage: 'Scanning auction house', done, total: totalPages });
    }
  };
  await Promise.all(Array.from({ length: AUCTION_CONCURRENCY }, worker));

  for (const key of Object.keys(bins)) bins[key] = round(bins[key]);
  return { updatedAt: Date.now(), bazaar, bins, binCounts, items };
}

function round(n) {
  return Math.round((n || 0) * 10) / 10;
}

// Read-side wrapper around a snapshot.
class PriceBook {
  constructor(snapshot, bazaarMode = 'mid') {
    this.s = snapshot;
    this.mode = bazaarMode;
  }

  get updatedAt() {
    return this.s.updatedAt;
  }

  bazaar(id) {
    const entry = this.s.bazaar[id];
    if (!entry) return null;
    const [sell, buy] = entry;
    let price;
    if (this.mode === 'sell') price = sell || buy;
    else if (this.mode === 'buy') price = buy || sell;
    else price = sell && buy ? (sell + buy) / 2 : sell || buy;
    return price > 0 ? price : null;
  }

  // Best market price for a key: bazaar, then lowest BIN, then NPC sell price.
  lookup(key) {
    if (!key) return null;
    const bz = this.bazaar(key);
    if (bz != null) return { price: bz, source: 'bazaar' };
    const bin = this.s.bins[key];
    if (bin != null) return { price: bin, source: 'auction' };
    const npc = this.s.items[key] && this.s.items[key].npc;
    if (npc) return { price: npc, source: 'npc' };
    return null;
  }

  price(key) {
    const hit = this.lookup(key);
    return hit ? hit.price : 0;
  }

  bin(key) {
    return this.s.bins[key] ?? null;
  }

  meta(id) {
    return this.s.items[id] || null;
  }
}

module.exports = { buildSnapshot, PriceBook };
