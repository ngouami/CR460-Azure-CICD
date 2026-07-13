/**
 * CogiCore — Couche Données (localStorage)
 * Chiffrement AES-GCM via WebCrypto API.
 * Toutes les opérations CRUD passent par ce module.
 */
'use strict';

const DB = (() => {
  const PREFIX = 'cogicore_v2_';

  // Clé de chiffrement dérivée du mot de passe admin (PBKDF2)
  let _cryptoKey = null;

  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name:'PBKDF2', salt:enc.encode(salt), iterations:310000, hash:'SHA-256' },
      keyMaterial,
      { name:'AES-GCM', length:256 },
      false, ['encrypt','decrypt']
    );
  }

  async function encrypt(data) {
    if (!_cryptoKey) return JSON.stringify(data); // mode dev sans clé
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, _cryptoKey, enc.encode(JSON.stringify(data)));
    return btoa(String.fromCharCode(...iv)) + '.' + btoa(String.fromCharCode(...new Uint8Array(ct)));
  }

  async function decrypt(raw) {
    if (!_cryptoKey || !raw.includes('.')) return JSON.parse(raw);
    const [ivB64, ctB64] = raw.split('.');
    const iv  = Uint8Array.from(atob(ivB64),  c => c.charCodeAt(0));
    const ct  = Uint8Array.from(atob(ctB64),  c => c.charCodeAt(0));
    const pt  = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, _cryptoKey, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  async function load(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      return await decrypt(raw);
    } catch { return null; }
  }

  async function save(key, data) {
    const enc = await encrypt(data);
    localStorage.setItem(PREFIX + key, enc);
  }

  function remove(key) { localStorage.removeItem(PREFIX + key); }

  async function initKey(password, salt) {
    _cryptoKey = await deriveKey(password, salt);
  }

  // ── API publique ──────────────────────────────────────────
  return {
    initKey,
    load,
    save,
    remove,

    // Helpers CRUD génériques
    async getAll(collection) {
      return (await load(collection)) || [];
    },
    async findById(collection, id) {
      const items = await this.getAll(collection);
      return items.find(i => i.id === id) || null;
    },
    async upsert(collection, item) {
      const items = await this.getAll(collection);
      const idx   = items.findIndex(i => i.id === item.id);
      const now   = new Date().toISOString();
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...item, updatedAt: now };
      } else {
        items.push({ ...item, id: item.id || Date.now(), createdAt: now });
      }
      await save(collection, items);
      return item;
    },
    async softDelete(collection, id) {
      const items = await this.getAll(collection);
      const idx   = items.findIndex(i => i.id === id);
      if (idx >= 0) {
        items[idx].deleted  = true;
        items[idx].deletedAt = new Date().toISOString();
        await save(collection, items);
      }
    },

    // Settings entreprise
    async getSettings() { return (await load('settings')) || {}; },
    async saveSettings(s) { await save('settings', s); },

    // Log d'activité
    async logActivity(action, detail) {
      const logs = (await load('activityLog')) || [];
      logs.unshift({ ts: new Date().toISOString(), action, detail });
      if (logs.length > 500) logs.length = 500;
      await save('activityLog', logs);
    },
  };
})();
