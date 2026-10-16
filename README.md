# Networth Panel

Electron desktop app that estimates a Hypixel SkyBlock player's networth. Search a username, pick a profile, and every coin, item, pet, sack, essence and museum donation is priced from live market data.

## Running

```
npm install
npm start
```

Or download a build from [Releases](https://github.com/Zeyln/NetworthPanel/releases):

| Platform | File | Install |
| --- | --- | --- |
| Windows | `NetworthPanel-Setup-x.y.z.exe` | Run the installer. Builds aren't code-signed, so SmartScreen warns on first launch (More info → Run anyway). |
| Windows (portable) | `NetworthPanel-Portable-x.y.z.exe` | Run directly, no install. |
| Ubuntu / Debian | `networth-panel_x.y.z_amd64.deb` | `sudo apt install ./networth-panel_x.y.z_amd64.deb` |

**Arch Linux:** install from the [AUR](https://aur.archlinux.org/packages/networthpanel) with an AUR helper, e.g. `yay -S networthpanel` or `paru -S networthpanel`. It runs on Arch's own `electron44` package. No Arch package files are published here; the PKGBUILD lives in [`packaging/aur/`](packaging/aur) and is pushed to the AUR on each release.

To publish a release, push a version tag: `git tag v0.2.0 && git push origin v0.2.0`. The workflow then:

1. builds the Windows installers and the `.deb`, and test-installs the `.deb` on Ubuntu 24.04,
2. builds the AUR package in an Arch container, installs it and launches the app under a virtual display,
3. pushes the updated PKGBUILD to the AUR (needs the `AUR_SSH_PRIVATE_KEY` repository secret),
4. attaches the Windows and Ubuntu files to a GitHub release.

Every push to `main` runs steps 1–2 without publishing. Locally: `npm run dist:win` or `dist:ubuntu` (the latter needs Linux).

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

## License

[MIT](LICENSE)
