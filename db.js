const TC_DB = {
  _db: null,
  DB_NAME: 'twitterCleaner',
  DB_VERSION: 1,

  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('labels')) {
          const store = db.createObjectStore('labels', { keyPath: 'tweetId' });
          store.createIndex('label', 'label', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('model')) {
          db.createObjectStore('model', { keyPath: 'version' });
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async saveLabel(labelData) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('labels', 'readwrite');
      tx.objectStore('labels').put(labelData);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async getLabel(tweetId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('labels', 'readonly');
      const req = tx.objectStore('labels').get(tweetId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async getAllLabels() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('labels', 'readonly');
      const req = tx.objectStore('labels').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async getStats() {
    const labels = await this.getAllLabels();
    return {
      total: labels.length,
      spam: labels.filter(l => l.label === 'spam').length,
      good: labels.filter(l => l.label === 'good').length,
    };
  },

  async deleteLabel(tweetId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('labels', 'readwrite');
      tx.objectStore('labels').delete(tweetId);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async clearAll() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('labels', 'readwrite');
      tx.objectStore('labels').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async exportJSONL() {
    const labels = await this.getAllLabels();
    return labels.map(l => JSON.stringify(l)).join('\n');
  },

  async importJSONL(jsonlText) {
    const lines = jsonlText.trim().split('\n');
    let imported = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        data.source = 'imported';
        await this.saveLabel(data);
        imported++;
      } catch (e) {
        console.warn('[TC] Skipping invalid JSONL line:', e.message);
      }
    }
    return imported;
  },

  async saveModel(modelData) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('model', 'readwrite');
      tx.objectStore('model').put(modelData);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async getLatestModel() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('model', 'readonly');
      const store = tx.objectStore('model');
      const req = store.getAll();
      req.onsuccess = () => {
        const models = req.result;
        if (models.length === 0) return resolve(null);
        models.sort((a, b) => b.trainedAt - a.trainedAt);
        resolve(models[0]);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },
};

if (typeof globalThis !== 'undefined') {
  globalThis.TC_DB = TC_DB;
}
