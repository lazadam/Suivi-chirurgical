/**
 * IndexedDB wrapper for the surgical tracking app.
 * Stores patients, follow-up visits and media (images / videos) locally
 * in the user's browser. No data ever leaves the device.
 */
(function (global) {
  const DB_NAME = 'suivi-chirurgical';
  const DB_VERSION = 1;

  const STORES = {
    patients: 'patients',
    followups: 'followups',
    media: 'media',
  };

  class Database {
    constructor() {
      this.db = null;
    }

    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          this.db = req.result;
          resolve(this.db);
        };
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORES.patients)) {
            const s = db.createObjectStore(STORES.patients, {
              keyPath: 'id',
              autoIncrement: true,
            });
            s.createIndex('lastName', 'lastName', { unique: false });
            s.createIndex('surgeryDate', 'surgeryDate', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.followups)) {
            const s = db.createObjectStore(STORES.followups, {
              keyPath: 'id',
              autoIncrement: true,
            });
            s.createIndex('patientId', 'patientId', { unique: false });
            s.createIndex('date', 'date', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.media)) {
            const s = db.createObjectStore(STORES.media, {
              keyPath: 'id',
              autoIncrement: true,
            });
            s.createIndex('patientId', 'patientId', { unique: false });
            s.createIndex('followupId', 'followupId', { unique: false });
          }
        };
      });
    }

    _run(storeName, mode, action) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction([storeName], mode);
        const store = tx.objectStore(storeName);
        const req = action(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    add(store, data) {
      return this._run(store, 'readwrite', (s) => s.add(data));
    }
    put(store, data) {
      return this._run(store, 'readwrite', (s) => s.put(data));
    }
    get(store, id) {
      return this._run(store, 'readonly', (s) => s.get(id));
    }
    getAll(store) {
      return this._run(store, 'readonly', (s) => s.getAll());
    }
    getAllByIndex(store, index, value) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction([store], 'readonly');
        const idx = tx.objectStore(store).index(index);
        const req = idx.getAll(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    remove(store, id) {
      return this._run(store, 'readwrite', (s) => s.delete(id));
    }

    async deletePatient(patientId) {
      const followups = await this.getAllByIndex(
        STORES.followups,
        'patientId',
        patientId
      );
      const media = await this.getAllByIndex(
        STORES.media,
        'patientId',
        patientId
      );
      for (const f of followups) await this.remove(STORES.followups, f.id);
      for (const m of media) await this.remove(STORES.media, m.id);
      await this.remove(STORES.patients, patientId);
    }

    async exportAll() {
      const [patients, followups, media] = await Promise.all([
        this.getAll(STORES.patients),
        this.getAll(STORES.followups),
        this.getAll(STORES.media),
      ]);
      // Convert media blobs to base64 for JSON serialization
      const mediaSerialized = await Promise.all(
        media.map(async (m) => ({
          ...m,
          blob: m.blob ? await blobToBase64(m.blob) : null,
        }))
      );
      return {
        format: 'suivi-chirurgical/v1',
        exportedAt: new Date().toISOString(),
        patients,
        followups,
        media: mediaSerialized,
      };
    }

    async importAll(payload, { replace = false } = {}) {
      if (!payload || payload.format !== 'suivi-chirurgical/v1') {
        throw new Error('Format de fichier non reconnu');
      }
      if (replace) {
        // wipe existing data
        for (const store of Object.values(STORES)) {
          await this._run(store, 'readwrite', (s) => s.clear());
        }
      }
      // Re-add with fresh IDs when not replacing, to avoid conflicts
      const patientIdMap = new Map();
      for (const p of payload.patients || []) {
        const original = p.id;
        const toInsert = { ...p };
        if (!replace) delete toInsert.id;
        const newId = await this.add(STORES.patients, toInsert);
        patientIdMap.set(original, newId);
      }
      const followupIdMap = new Map();
      for (const f of payload.followups || []) {
        const original = f.id;
        const toInsert = { ...f };
        if (!replace) {
          delete toInsert.id;
          if (patientIdMap.has(f.patientId)) {
            toInsert.patientId = patientIdMap.get(f.patientId);
          }
        }
        const newId = await this.add(STORES.followups, toInsert);
        followupIdMap.set(original, newId);
      }
      for (const m of payload.media || []) {
        const toInsert = { ...m };
        if (m.blob && typeof m.blob === 'string') {
          toInsert.blob = await base64ToBlob(m.blob, m.mimeType || 'application/octet-stream');
        }
        if (!replace) {
          delete toInsert.id;
          if (patientIdMap.has(m.patientId)) {
            toInsert.patientId = patientIdMap.get(m.patientId);
          }
          if (m.followupId && followupIdMap.has(m.followupId)) {
            toInsert.followupId = followupIdMap.get(m.followupId);
          }
        }
        await this.add(STORES.media, toInsert);
      }
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function base64ToBlob(dataUrl, fallbackMime) {
    // dataUrl expected as "data:<mime>;base64,<data>"
    const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
    if (!match) {
      const binary = atob(dataUrl);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: fallbackMime });
    }
    const mime = match[1];
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  global.db = new Database();
  global.DB_STORES = STORES;
})(window);
