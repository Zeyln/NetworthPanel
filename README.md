# Networth Panel

Electron desktop app that estimates a Hypixel SkyBlock player's networth. Search a username, pick a profile, and every coin, item, pet, sack, essence and museum donation is priced from live market data.

## Running

```
npm install
npm start
```

Profile data needs a Hypixel API key (create one at https://developer.hypixel.net/). Paste it in **Settings** (⚙). It's stored encrypted with the OS keychain (DPAPI on Windows) in the app's user-data folder. `HYPIXEL_API_KEY` in the environment also works.

## How prices are estimated

Prices refresh on launch and every 15 minutes (or on demand), and are cached to disk:

| Source | Used for |
| --- | --- |
| Bazaar (`/skyblock/bazaar`) | Anything tradeable on the bazaar: enchanted books, gems, essence, upgrades. Midpoint of instant-buy and instant-sell by default (configurable). |
| Auction house (`/skyblock/auctions`, every page) | Lowest BIN per item. Pets are bucketed by type, rarity and level (level ≤ 10 vs max level); books, runes, cakes and party hats get their own keys. |
| Item catalogue (`/resources/skyblock/items`) | NPC sell price fallback, star costs, gemstone slot unlock costs, names and rarities. |

An item's value is its base price plus each upgrade applied to it, times how much of that upgrade's price survives once applied (`WORTH` in `src/main/core/networth.js`). Covered upgrades: enchantments, hot/fuming potato books, recombobulator, reforge stones, gemstones and slot unlocks, essence and master stars, Art of War/Peace, Hyperion scrolls, power scrolls, drill parts, dyes, skins, enrichments, Divan coating, Jalapeño/Polarvoid books, Pulse Ring charge and more.

Pet value is interpolated by XP between the level-1 and max-level lowest BIN, plus held item and skin, minus a penalty for candied pets.

"Tradeable" excludes soulbound items, museum donations and essence.

## Layout

```
src/main/main.js          window, IPC, settings, price cache
src/main/preload.js       renderer bridge (window.api)
src/main/core/            Electron-free engine
  hypixel.js              API client (Mojang, Hypixel)
  nbt.js                  NBT decoder for item blobs
  prices.js               bazaar + auction snapshot, PriceBook
  keys.js                 item -> price key mapping
  pets.js                 pet XP/level math
  networth.js             valuation
src/renderer/             UI
```

## Known gaps

- Lowest BIN reflects the cheapest listing, which is usually a clean copy. Rare variants (perfect-quality dungeon drops, special editions) are valued as the base item plus upgrades.
- Reforge stones not in NEU's reforge table, Kuudra attributes and Rift items aren't valued.
- Items with no bazaar, auction or NPC price count as 0 and are listed as "No price".
