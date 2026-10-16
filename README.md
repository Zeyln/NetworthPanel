# Networth Panel

See what any Hypixel SkyBlock player is worth. Type a username and Networth Panel adds up their coins, items, pets, sacks, essence and museum, priced from live Bazaar and Auction House data.

## Install

Download from the **[latest release](https://github.com/Zeyln/NetworthPanel/releases/latest)**.

### Windows

1. Download `NetworthPanel-Setup-<version>.exe` and run it.
2. If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**. The app isn't code-signed, so Windows doesn't recognise it yet.

Prefer not to install anything? Download `NetworthPanel-Portable-<version>.exe` instead and run it directly.

### Ubuntu / Debian

Download `networth-panel_<version>_amd64.deb`, then:

```sh
sudo apt install ./networth-panel_*_amd64.deb
```

Open **Networth Panel** from your app menu.

### Arch Linux

Install from the [AUR](https://aur.archlinux.org/packages/networthpanel) with your AUR helper:

```sh
yay -S networthpanel
```

Then run `networthpanel` or open it from your app menu.

## Getting started

The app needs a free Hypixel API key to read player profiles.

1. Go to the [Hypixel Developer Dashboard](https://developer.hypixel.net/) and sign in with your Minecraft account.
2. Copy your API key.
3. In Networth Panel, click **⚙** (top right), paste the key and click **Save**.
4. Type a username and press **Look up**.

The key is stored encrypted on your computer and is only ever sent to Hypixel.

## Using it

- **Profile:** players with several SkyBlock profiles get a dropdown under their name. It opens on the profile they're currently playing.
- **Networth** is everything combined. **Tradeable** leaves out what can't be sold: soulbound items, museum donations and essence.
- **Categories** on the left (Inventory, Pets, Sacks…) filter the item list. Click any item to see how its value was calculated.
- **Prices** update by themselves every 15 minutes. Click **Refresh prices** at the top for fresh numbers right away.
- **Bazaar price setting** (in ⚙) chooses between conservative (instant-sell), midpoint (default) and optimistic (instant-buy) bazaar prices.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Hypixel rejected the API key" | Development keys expire after a few days. Get a new one from the dashboard and paste it in ⚙. |
| "Inventory API is disabled" / "Banking API is disabled" | The player has hidden that data. In SkyBlock they can turn it on under **SkyBlock Menu → Settings → API Settings**. |
| "Rate limited" | Wait a minute and try again. |
| An item shows **No price** | Nobody is selling it right now, so it counts as 0. |
| Numbers look different from other sites | Every networth tool prices upgrades a little differently. See [How values are calculated](#how-values-are-calculated). |

## How values are calculated

- **Base price:** the Bazaar price if the item trades there, otherwise the cheapest Buy It Now listing on the Auction House, otherwise its NPC sell price.
- **Upgrades:** enchantments, potato books, recombobulators, reforges, gemstones, stars, scrolls and similar add part of their own market price. Upgrades can't be taken off again, so buyers rarely pay full price for them.
- **Pets:** priced between their level 1 and max-level Auction House prices according to XP, plus their held item and skin.

Limitations: rare variants (such as perfect-quality dungeon drops) are valued like normal copies, and Kuudra attributes and Rift items aren't counted.

## For developers

Run from source (requires [Node.js](https://nodejs.org/) 20+):

```sh
npm install
npm start
```

Build installers: `npm run dist:win` (Windows) or `npm run dist:ubuntu` (Linux). The AUR package recipe lives in [`packaging/aur/`](packaging/aur).

**Releasing:** push a version tag, e.g. `git tag v0.3.0 && git push origin v0.3.0`. GitHub Actions builds and tests the Windows and Ubuntu packages and attaches them to a release. It also builds and launch-tests the Arch package, then pushes the PKGBUILD to the AUR (needs the `AUR_SSH_PRIVATE_KEY` repository secret). Pushes to `main` run the same builds and tests without publishing.

<details>
<summary>Code layout</summary>

```
src/main/main.js          window, IPC, settings, price cache
src/main/preload.js       renderer bridge (window.api)
src/main/core/            pricing engine (no Electron dependency)
  hypixel.js              API client (Mojang, Hypixel)
  nbt.js                  item data decoder
  prices.js               bazaar + auction price snapshot
  keys.js                 item -> price key mapping
  pets.js                 pet XP/level math
  networth.js             valuation and upgrade weights (WORTH)
src/renderer/             user interface
```

</details>

## License

[MIT](LICENSE)
