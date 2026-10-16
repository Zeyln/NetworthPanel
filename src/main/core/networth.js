'use strict';

const { decodeItems } = require('./nbt');
const { priceKey, parsePetInfo, petBaseKey } = require('./keys');
const { levelFromXp, maxLevel, maxXp, petName } = require('./pets');

// How much of an upgrade's market price survives once it is applied to an
// item. Applied upgrades can't be removed, so buyers rarely pay full price.
const WORTH = {
  enchantment: 0.85,
  hotPotato: 1,
  fumingPotato: 0.6,
  recomb: 0.8,
  artOfWar: 0.6,
  artOfPeace: 0.8,
  woodSingularity: 0.5,
  farmingForDummies: 0.5,
  jalapeno: 0.8,
  polarvoid: 0.8,
  divanCoating: 0.8,
  etherwarp: 1,
  transmissionTuner: 0.7,
  manaDisintegrator: 0.8,
  enrichment: 0.5,
  powerScroll: 0.5,
  abilityScroll: 1,
  drillPart: 1,
  thunderCharge: 0.8,
  dye: 0.9,
  skin: 0.9,
  reforge: 1,
  gemstone: 1,
  gemSlotUnlock: 0.6,
  essenceStar: 0.75,
  masterStar: 1,
  petItem: 1,
  petSkin: 0.9,
  petCandy: 0.65,
};

// Reforge name (as stored in ExtraAttributes.modifier) -> reforge stone id.
// Generated from NotEnoughUpdates-REPO constants/reforgestones.json.
const REFORGE_STONES = {
  ambered: 'AMBER_MATERIAL', ancient: 'PRECURSOR_GEAR', auspicious: 'ROCK_GEMSTONE', beady: 'BEADY_EYES',
  blazing: 'BLAZEN_SPHERE', blessed: 'BLESSED_FRUIT', bloodshot: 'SHRIVELED_CORNEA',
  bloodsoaked: 'PRESUMED_GALLON_OF_RED_PAINT', blooming: 'FLOWERING_BOUQUET', bountiful: 'GOLDEN_BALL',
  bulky: 'BULKY_STONE', bustling: 'SKYMART_BROCHURE', buzzing: 'CLIPPED_WINGS', calcified: 'CALCIFIED_HEART',
  candied: 'CANDY_CORN', chomp: 'KUUDRA_MANDIBLE', coldfused: 'ENTROPY_SUPPRESSOR', cubic: 'MOLTEN_CUBE',
  'deep_fried': 'HASHBROWN', dimensional: 'TITANIUM_TESSERACT', dirty: 'DIRT_BOTTLE', earthy: 'LARGE_WALNUT',
  empowered: 'SADAN_BROOCH', erudite: 'DAEDALUS_NOTES', fabled: 'DRAGON_CLAW', fanged: 'FULL_JAW_FANGING_KIT',
  festive: 'FROZEN_BAUBLE', fleet: 'DIAMONITE', fortified: 'METEOR_SHARD', fruitful: 'ONYX',
  geometric: 'GEOMETRIC_ODDITY', giant: 'GIANT_TOOTH', gilded: 'MIDAS_JEWEL', glacial: 'FRIGID_HUSK',
  glistening: 'SHINY_PRISM', 'greater_spook': 'BOO_STONE', groovy: 'MANGROVE_GEM', headstrong: 'SALMON_OPAL',
  heated: 'HOT_STUFF', hyper: 'ENDSTONE_GEODE', jaded: 'JADERALD', jerry: 'JERRY_STONE', jerrys: 'JERRY_STONE',
  loving: 'RED_SCARF', lucky: 'LUCKY_DICE', lunar: 'MOONSTONE', lustrous: 'GLEAMING_CRYSTAL',
  magnetic: 'LAPIS_CRYSTAL', majestic: 'MORNING_DEW', mantid: 'MANTID_CLAW', marshy: 'MARSHROOM',
  mithraic: 'PURE_MITHRIL', moil: 'MOIL_LOG', moonglade: 'MOONGLADE_JEWEL', mossy: 'OVERGROWN_GRASS',
  necrotic: 'NECROMANCER_BROOCH', overpriced: 'OVERPRICED_DRINK', perfect: 'DIAMOND_ATOM',
  pitchin: 'PITCHIN_KOI', precise: 'OPTICAL_LENS', refined: 'REFINED_AMBER', reinforced: 'RARE_DIAMOND',
  renowned: 'DRAGON_HORN', ridiculous: 'RED_NOSE', rooted: 'BURROWING_SPORES', royal: 'DWARVEN_TREASURE',
  salty: 'SALT_CUBE', scraped: 'POCKET_ICEBERG', snowy: 'TERRY_SNOWGLOBE', spiked: 'DRAGON_SCALE',
  spiritual: 'SPIRIT_DECOY', squeaky: 'SQUEAKY_TOY', stellar: 'PETRIFIED_STARFALL',
  sticky: 'EXTREMELY_MILD_ADHESIVE', stiff: 'HARDENED_WOOD', strengthened: 'SEARING_STONE',
  submerged: 'DEEP_SEA_ORB', sunny: 'SUNSTONE', suspicious: 'SUSPICIOUS_VIAL', thorny: 'BLOOMING_THORNS',
  toil: 'TOIL_LOG', trashy: 'OVERFLOWING_TRASH_CAN', treacherous: 'RUSTY_ANCHOR', undead: 'PREMIUM_FLESH',
  warped: 'AOTE_STONE', waxed: 'BLAZE_WAX', withered: 'WITHER_BLOOD',
};

// Gemstone slots whose stored key doesn't name the gem type.
const GENERIC_GEM_SLOTS = new Set(['COMBAT', 'OFFENSIVE', 'DEFENSIVE', 'UNIVERSAL', 'MINING', 'CHISEL']);
const MASTER_STARS = ['FIRST_MASTER_STAR', 'SECOND_MASTER_STAR', 'THIRD_MASTER_STAR', 'FOURTH_MASTER_STAR', 'FIFTH_MASTER_STAR'];

function isSoulbound(item, meta) {
  if (item.ea.donated_museum) return true;
  if (meta && meta.soulbound) return true;
  return item.lore.some((line) => /Soulbound/.test(line));
}

function itemModifiers(item, pb) {
  const ea = item.ea;
  const mods = [];
  const add = (label, key, worth, qty = 1) => {
    if (!key || !(qty > 0)) return;
    const unit = pb.price(key);
    if (unit > 0) mods.push({ label, value: unit * qty * worth });
  };

  if (ea.enchantments && item.id !== 'ENCHANTED_BOOK') {
    for (const [name, level] of Object.entries(ea.enchantments)) {
      add(`${titleCase(name)} ${level}`, `ENCHANTMENT_${name.toUpperCase()}_${level}`, WORTH.enchantment);
    }
  }

  const hpb = ea.hot_potato_count || 0;
  add('Hot Potato Books', 'HOT_POTATO_BOOK', WORTH.hotPotato, Math.min(hpb, 10));
  add('Fuming Potato Books', 'FUMING_POTATO_BOOK', WORTH.fumingPotato, Math.max(hpb - 10, 0));
  if (ea.rarity_upgrades > 0) add('Recombobulator', 'RECOMBOBULATOR_3000', WORTH.recomb);
  add('Art of War', 'THE_ART_OF_WAR', WORTH.artOfWar, ea.art_of_war_count || 0);
  if (ea.artOfPeaceApplied || ea.art_of_peace_applied) add('Art of Peace', 'THE_ART_OF_PEACE', WORTH.artOfPeace);
  add('Wood Singularity', 'WOOD_SINGULARITY', WORTH.woodSingularity, ea.wood_singularity_count || 0);
  add('Farming for Dummies', 'FARMING_FOR_DUMMIES', WORTH.farmingForDummies, ea.farming_for_dummies_count || 0);
  add('Jalapeño Book', 'JALAPENO_BOOK', WORTH.jalapeno, ea.jalapeno_count || 0);
  add('Polarvoid Book', 'POLARVOID_BOOK', WORTH.polarvoid, ea.polarvoid || 0);
  add('Divan Powder Coating', 'DIVAN_POWDER_COATING', WORTH.divanCoating, ea.divan_powder_coating || 0);
  if (ea.ethermerge) add('Etherwarp Conduit', 'ETHERWARP_CONDUIT', WORTH.etherwarp);
  add('Transmission Tuners', 'TRANSMISSION_TUNER', WORTH.transmissionTuner, ea.tuned_transmission || 0);
  add('Mana Disintegrators', 'MANA_DISINTEGRATOR', WORTH.manaDisintegrator, ea.mana_disintegrator_count || 0);
  if (ea.talisman_enrichment) {
    add('Enrichment', `TALISMAN_ENRICHMENT_${ea.talisman_enrichment.toUpperCase()}`, WORTH.enrichment);
  }
  if (ea.power_ability_scroll) add('Power Scroll', ea.power_ability_scroll, WORTH.powerScroll);
  if (Array.isArray(ea.ability_scroll)) {
    for (const scroll of ea.ability_scroll) add(titleCase(scroll), scroll, WORTH.abilityScroll);
  }
  for (const part of ['drill_part_upgrade_module', 'drill_part_fuel_tank', 'drill_part_engine']) {
    if (ea[part]) add(titleCase(ea[part]), ea[part].toUpperCase(), WORTH.drillPart);
  }
  // Pulse Ring charge: each Thunder in a Bottle adds 50k.
  if (item.id === 'PULSE_RING' && ea.thunder_charge) {
    add('Thunder charge', 'THUNDER_IN_A_BOTTLE', WORTH.thunderCharge, Math.floor(ea.thunder_charge / 50000));
  }
  if (ea.dye_item) add('Dye', ea.dye_item, WORTH.dye);
  if (ea.skin) add('Skin', ea.skin, WORTH.skin);

  if (ea.modifier) {
    const stone = REFORGE_STONES[ea.modifier];
    if (stone) add(`${titleCase(ea.modifier)} reforge`, stone, WORTH.reforge);
  }

  if (ea.gems) gemModifiers(item, pb, mods);
  starModifiers(item, pb, mods);
  return mods;
}

function gemModifiers(item, pb, mods) {
  const gems = item.ea.gems;
  for (const [slot, value] of Object.entries(gems)) {
    if (slot === 'unlocked_slots' || slot.endsWith('_gem')) continue;
    const quality = typeof value === 'string' ? value : value && value.quality;
    if (!quality) continue;
    const slotType = slot.split('_')[0];
    const gemType = GENERIC_GEM_SLOTS.has(slotType) ? gems[`${slot}_gem`] : slotType;
    if (!gemType) continue;
    const price = pb.price(`${quality}_${gemType}_GEM`);
    if (price > 0) mods.push({ label: `${titleCase(quality)} ${titleCase(gemType)}`, value: price * WORTH.gemstone });
  }

  // Unlocking a slot costs gemstones too; count those for slots that start locked.
  const meta = pb.meta(item.id);
  const slots = meta && meta.gemstone_slots;
  if (!slots || !Array.isArray(gems.unlocked_slots)) return;
  for (const unlocked of gems.unlocked_slots) {
    const [type, idx] = unlocked.split('_');
    const ofType = slots.filter((s) => s.slot_type === type);
    const slot = ofType[Number(idx)];
    if (!slot || !slot.costs) continue;
    let value = 0;
    for (const cost of slot.costs) {
      if (cost.type === 'ITEM') value += pb.price(cost.item_id) * cost.amount;
    }
    if (value > 0) mods.push({ label: `${titleCase(type)} slot unlock`, value: value * WORTH.gemSlotUnlock });
  }
}

function starModifiers(item, pb, mods) {
  const ea = item.ea;
  const level = ea.upgrade_level ?? ea.dungeon_item_level ?? 0;
  if (!(level > 0)) return;
  const meta = pb.meta(item.id);
  const costs = (meta && meta.upgrade_costs) || [];

  let essence = 0;
  for (let i = 0; i < Math.min(level, costs.length); i++) {
    for (const cost of costs[i]) {
      if (cost.type === 'ESSENCE') essence += pb.price(`ESSENCE_${cost.essence_type}`) * cost.amount;
      else if (cost.type === 'ITEM') essence += pb.price(cost.item_id) * cost.amount;
    }
  }
  if (essence > 0) {
    mods.push({ label: `${Math.min(level, costs.length)} stars`, value: essence * WORTH.essenceStar });
  }

  if (costs.length === 5) {
    for (let i = 0; i < Math.min(level - 5, MASTER_STARS.length); i++) {
      const price = pb.price(MASTER_STARS[i]);
      if (price > 0) mods.push({ label: titleCase(MASTER_STARS[i]), value: price * WORTH.masterStar });
    }
  }
}

function valueItem(item, pb) {
  if (!item.id) return null;
  if (item.id === 'PET') {
    const pet = parsePetInfo(item.ea);
    if (pet && pet.type) return valuePet(pet, pb, item.ea.donated_museum);
  }

  const meta = pb.meta(item.id);
  const key = priceKey(item.ea);
  const hit = pb.lookup(key) || (key !== item.id ? pb.lookup(item.id) : null);
  const base = hit ? hit.price : 0;
  const mods = item.count > 1 ? [] : itemModifiers(item, pb);
  const modTotal = mods.reduce((sum, m) => sum + m.value, 0);

  return {
    id: item.id,
    name: item.name,
    count: item.count,
    tier: meta && meta.tier,
    base: base * item.count,
    source: hit ? hit.source : null,
    mods: mods.sort((a, b) => b.value - a.value),
    value: base * item.count + modTotal,
    soulbound: isSoulbound(item, meta),
    priced: Boolean(hit) || modTotal > 0,
  };
}

function valuePet(pet, pb, soulbound = false) {
  const baseKey = petBaseKey(pet);
  const low = pb.bin(`${baseKey}_LOW`);
  const max = pb.bin(`${baseKey}_MAX`);
  const any = pb.bin(baseKey);
  const level = levelFromXp(pet.exp, pet.type, pet.tier);
  const isMax = level >= maxLevel(pet.type);

  let base;
  if (isMax) {
    base = max ?? any ?? low;
  } else if (low != null && max != null) {
    const progress = Math.min((pet.exp || 0) / maxXp(pet.type, pet.tier), 1);
    base = low + (max - low) * progress;
  } else {
    base = low ?? any ?? max;
  }

  const mods = [];
  if (base != null && pet.candyUsed > 0 && !isMax) {
    mods.push({ label: `Pet candy (${pet.candyUsed})`, value: -base * (1 - WORTH.petCandy) });
  }
  if (pet.heldItem) {
    const price = pb.price(pet.heldItem);
    if (price > 0) mods.push({ label: titleCase(pet.heldItem.replace(/^PET_ITEM_/, '')), value: price * WORTH.petItem });
  }
  if (pet.skin) {
    const price = pb.price(`PET_SKIN_${pet.skin}`);
    if (price > 0) mods.push({ label: 'Pet skin', value: price * WORTH.petSkin });
  }
  const modTotal = mods.reduce((sum, m) => sum + m.value, 0);

  return {
    id: baseKey,
    name: `[Lvl ${level}] ${petName(pet.type)}`,
    count: 1,
    tier: pet.tier,
    base: base || 0,
    source: base != null ? 'auction' : null,
    mods: mods.sort((a, b) => b.value - a.value),
    value: (base || 0) + modTotal,
    soulbound: Boolean(soulbound),
    priced: base != null || modTotal > 0,
    active: Boolean(pet.active),
  };
}

function safeDecode(data, warnings, label) {
  if (!data) return [];
  try {
    return decodeItems(data);
  } catch (err) {
    warnings.push(`Could not read ${label}: ${err.message}`);
    return [];
  }
}

function blobs(container) {
  if (!container) return [];
  if (container.data) return [container.data];
  return Object.keys(container)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => container[k] && container[k].data)
    .filter(Boolean);
}

function category(key, label, entries) {
  const items = entries.filter(Boolean).sort((a, b) => b.value - a.value);
  return {
    key,
    label,
    items,
    total: items.reduce((sum, i) => sum + i.value, 0),
    unsoulbound: items.reduce((sum, i) => sum + (i.soulbound ? 0 : i.value), 0),
  };
}

function calculateNetworth({ profile, uuid, museum, pb }) {
  const member = profile.members[uuid] || {};
  const inv = member.inventory;
  const bags = (inv && inv.bag_contents) || {};
  const warnings = [];

  const fromBlobs = (sources, label) => sources
    .flatMap((data) => safeDecode(data, warnings, label))
    .map((item) => valueItem(item, pb));

  const categories = [];
  if (!inv) {
    warnings.push('Inventory API is disabled for this profile, so items are missing.');
  } else {
    categories.push(
      category('inventory', 'Inventory', fromBlobs(blobs(inv.inv_contents), 'inventory')),
      category('armor', 'Armor', fromBlobs(blobs(inv.inv_armor), 'armor')),
      category('equipment', 'Equipment', fromBlobs(blobs(inv.equipment_contents), 'equipment')),
      category('wardrobe', 'Wardrobe', fromBlobs(blobs(inv.wardrobe_contents), 'wardrobe')),
      category('enderchest', 'Ender Chest', fromBlobs(blobs(inv.ender_chest_contents), 'ender chest')),
      category('storage', 'Backpacks', fromBlobs(
        [...blobs(inv.backpack_icons), ...blobs(inv.backpack_contents)], 'backpacks')),
      category('vault', 'Personal Vault', fromBlobs(blobs(inv.personal_vault_contents), 'personal vault')),
      category('accessories', 'Accessory Bag', fromBlobs(blobs(bags.talisman_bag), 'accessory bag')),
      category('fishing', 'Fishing Bag', fromBlobs(blobs(bags.fishing_bag), 'fishing bag')),
      category('potions', 'Potion Bag', fromBlobs(blobs(bags.potion_bag), 'potion bag')),
      category('quiver', 'Quiver', fromBlobs(blobs(bags.quiver), 'quiver')),
    );

    const sackItems = Object.entries(inv.sacks_counts || {})
      .filter(([, n]) => n > 0)
      .map(([id, n]) => {
        const hit = pb.lookup(id);
        const meta = pb.meta(id);
        return {
          id, name: (meta && meta.name) || titleCase(id), count: n, tier: meta && meta.tier,
          base: (hit ? hit.price : 0) * n, value: (hit ? hit.price : 0) * n,
          source: hit ? hit.source : null, mods: [], soulbound: false, priced: Boolean(hit),
        };
      });
    categories.push(category('sacks', 'Sacks', [...sackItems, ...fromBlobs(blobs(bags.sacks_bag), 'sacks')]));
  }

  const pets = ((member.pets_data && member.pets_data.pets) || []).map((p) => valuePet(p, pb));
  categories.push(category('pets', 'Pets', pets));

  const essence = Object.entries((member.currencies && member.currencies.essence) || {})
    .map(([type, e]) => {
      const n = (e && e.current) || 0;
      if (!n) return null;
      const unit = pb.price(`ESSENCE_${type}`);
      return {
        id: `ESSENCE_${type}`, name: `${titleCase(type)} Essence`, count: n, tier: null,
        base: unit * n, value: unit * n, source: unit ? 'bazaar' : null, mods: [], soulbound: true, priced: unit > 0,
      };
    });
  categories.push(category('essence', 'Essence', essence));

  const museumMember = museum && museum[uuid];
  if (museumMember) {
    const donated = [];
    for (const entry of Object.values(museumMember.items || {})) {
      if (entry.borrowing) continue; // currently in the player's inventory, already counted
      donated.push(...fromBlobs(blobs(entry.items), 'museum'));
    }
    for (const entry of museumMember.special || []) donated.push(...fromBlobs(blobs(entry.items), 'museum'));
    for (const d of donated) if (d) d.soulbound = true;
    categories.push(category('museum', 'Museum', donated));
  }

  const purse = (member.currencies && member.currencies.coin_purse) || 0;
  const bank = profile.banking ? profile.banking.balance || 0 : null;
  const personalBank = (member.profile && member.profile.bank_account) || 0;
  if (bank === null) warnings.push('Banking API is disabled, so the bank balance is missing.');
  const coins = purse + (bank || 0) + personalBank;

  const itemTotal = categories.reduce((sum, c) => sum + c.total, 0);
  const itemUnsoulbound = categories.reduce((sum, c) => sum + c.unsoulbound, 0);
  const unpriced = categories.flatMap((c) => c.items.filter((i) => !i.priced).map((i) => ({ ...i, category: c.label })));

  return {
    total: coins + itemTotal,
    unsoulbound: coins + itemUnsoulbound,
    coins: { purse, bank, personalBank, total: coins },
    categories: categories.filter((c) => c.items.length > 0),
    unpriced,
    warnings,
  };
}

function titleCase(s) {
  return String(s).toLowerCase().split(/[_\s]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

module.exports = { calculateNetworth, valueItem, valuePet };
