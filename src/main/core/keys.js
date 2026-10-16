'use strict';
// Maps an item's ExtraAttributes to the key we price it under. The same
// function runs over auction listings and over the player's items, so both
// sides agree on what counts as "the same item".

const { levelFromXp, maxLevel } = require('./pets');

function parsePetInfo(ea) {
  if (!ea || !ea.petInfo) return null;
  try {
    return typeof ea.petInfo === 'string' ? JSON.parse(ea.petInfo) : ea.petInfo;
  } catch {
    return null;
  }
}

function petBaseKey(pet) {
  return `PET_${pet.type}_${pet.tier}`;
}

// Level bucket used when collecting auction prices for pets.
function petBucket(pet) {
  const level = levelFromXp(pet.exp, pet.type, pet.tier);
  if (level >= maxLevel(pet.type)) return 'MAX';
  if (level <= 10) return 'LOW';
  return null;
}

function priceKey(ea) {
  const id = ea && ea.id;
  if (!id) return null;

  if (id === 'ENCHANTED_BOOK' && ea.enchantments) {
    const entries = Object.entries(ea.enchantments);
    if (entries.length === 1) {
      const [name, level] = entries[0];
      return `ENCHANTMENT_${name.toUpperCase()}_${level}`;
    }
  }
  if ((id === 'RUNE' || id === 'UNIQUE_RUNE') && ea.runes) {
    const [[type, level]] = Object.entries(ea.runes);
    return `RUNE_${type}_${level}`;
  }
  if (id === 'NEW_YEAR_CAKE' && ea.new_years_cake != null) return `NEW_YEAR_CAKE_${ea.new_years_cake}`;
  if (id.startsWith('PARTY_HAT') && ea.party_hat_color) return `${id}_${ea.party_hat_color.toUpperCase()}`;
  if (id === 'ABICASE' && ea.model) return `ABICASE_${ea.model.toUpperCase()}`;
  return id;
}

module.exports = { priceKey, parsePetInfo, petBaseKey, petBucket };
