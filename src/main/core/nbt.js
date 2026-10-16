'use strict';
// Minimal NBT reader for Hypixel's gzipped, base64-encoded item blobs.
// Hand-rolled instead of a library because we decode tens of thousands of
// auction items per price refresh and this is several times faster.

const zlib = require('zlib');

function readNbt(buf) {
  let o = 0;

  const readString = () => {
    const len = buf.readUInt16BE(o);
    o += 2;
    const s = buf.toString('utf8', o, o + len);
    o += len;
    return s;
  };

  const readPayload = (type) => {
    switch (type) {
      case 1: return buf.readInt8(o++);
      case 2: { const v = buf.readInt16BE(o); o += 2; return v; }
      case 3: { const v = buf.readInt32BE(o); o += 4; return v; }
      case 4: { const v = buf.readBigInt64BE(o); o += 8; return Number(v); }
      case 5: { const v = buf.readFloatBE(o); o += 4; return v; }
      case 6: { const v = buf.readDoubleBE(o); o += 8; return v; }
      case 7: {
        const len = buf.readInt32BE(o); o += 4;
        const v = buf.subarray(o, o + len); o += len;
        return v;
      }
      case 8: return readString();
      case 9: {
        const itemType = buf.readInt8(o++);
        const len = buf.readInt32BE(o); o += 4;
        const arr = new Array(Math.max(len, 0));
        for (let i = 0; i < len; i++) arr[i] = readPayload(itemType);
        return arr;
      }
      case 10: {
        const obj = {};
        for (;;) {
          const t = buf.readInt8(o++);
          if (t === 0) break;
          const name = readString();
          obj[name] = readPayload(t);
        }
        return obj;
      }
      case 11: {
        const len = buf.readInt32BE(o); o += 4;
        const arr = new Array(len);
        for (let i = 0; i < len; i++) { arr[i] = buf.readInt32BE(o); o += 4; }
        return arr;
      }
      case 12: {
        const len = buf.readInt32BE(o); o += 4;
        const arr = new Array(len);
        for (let i = 0; i < len; i++) { arr[i] = Number(buf.readBigInt64BE(o)); o += 8; }
        return arr;
      }
      default:
        throw new Error(`Unknown NBT tag type ${type} at offset ${o - 1}`);
    }
  };

  const rootType = buf.readInt8(o++);
  if (rootType !== 10) throw new Error('NBT root is not a compound');
  readString(); // root name, always empty
  return readPayload(10);
}

function decodeBlob(data) {
  const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
  const buf = raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw;
  return readNbt(buf);
}

// Returns the non-empty item slots of an inventory blob in a normalised shape.
function decodeItems(data) {
  if (!data) return [];
  const root = decodeBlob(data);
  const list = Array.isArray(root.i) ? root.i : [];
  const items = [];
  for (const slot of list) {
    const item = normaliseItem(slot);
    if (item) items.push(item);
  }
  return items;
}

function normaliseItem(slot) {
  if (!slot || !slot.tag) return null;
  const ea = slot.tag.ExtraAttributes || {};
  const display = slot.tag.display || {};
  return {
    id: ea.id || null,
    count: slot.Count || 1,
    name: display.Name || ea.id || 'Unknown item',
    lore: Array.isArray(display.Lore) ? display.Lore : [],
    ea,
  };
}

module.exports = { decodeBlob, decodeItems, normaliseItem };
