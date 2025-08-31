/**
 * Pipeline - Handles data storage and retrieval for trading bot
 */

/**
 * Save data to localStorage
 * @param {string} key - Data key (e.g., 'trades', 'ticks', 'candles')
 * @param {Object} data - Data to save
 */
export function saveData(key, data) {
  try {
    if (!key || !data || typeof key !== 'string') {
      window.derivBot?.log(`[Pipeline] Invalid save data: key=${key}, data=${JSON.stringify(data)}`, 'error');
      return;
    }

    const existingData = localStorage.getItem(key) ? JSON.parse(localStorage.getItem(key)) : [];
    if (!Array.isArray(existingData)) {
      window.derivBot?.log(`[Pipeline] Invalid existing data for ${key}`, 'error');
      return;
    }

    existingData.push(data);
    if (existingData.length > 10000) {
      existingData.shift();
    }

    localStorage.setItem(key, JSON.stringify(existingData));
    window.derivBot?.log(`[Pipeline] Saved data to ${key}: ${JSON.stringify(data).slice(0, 50)}...`, 'debug');
  } catch (error) {
    window.derivBot?.log(`[Pipeline] Error saving data to ${key}: ${error.message}`, 'error');
  }
}

/**
 * Load data from localStorage
 * @param {string} key - Data key (e.g., 'trades', 'ticks', 'candles')
 * @param {number} [limit=Infinity] - Maximum number of records to return
 * @returns {Array<Object>} Loaded data
 */
export function loadData(key, limit = Infinity) {
  try {
    if (!key || typeof key !== 'string') {
      window.derivBot?.log(`[Pipeline] Invalid load key: ${key}`, 'error');
      return [];
    }

    const data = localStorage.getItem(key) ? JSON.parse(localStorage.getItem(key)) : [];
    if (!Array.isArray(data)) {
      window.derivBot?.log(`[Pipeline] Invalid data format for ${key}`, 'error');
      return [];
    }

    const result = data.slice(-limit);
    window.derivBot?.log(`[Pipeline] Loaded ${result.length} records from ${key}`, 'debug');
    return result;
  } catch (error) {
    window.derivBot?.log(`[Pipeline] Error loading data from ${key}: ${error.message}`, 'error');
    return [];
  }
}
