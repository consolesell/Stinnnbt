import fs from 'fs';

// Default data structure
const DEFAULT_DATA = {
    ticks: [],
    candles: [],
    trades: [],
    shortTerm: {
        ticks: [],
        candles: [],
        trades: []
    }
};

// Maximum entries for short-term storage
const SHORT_TERM_LIMIT = 100;
// Maximum entries for long-term storage (0 for unlimited)
const LONG_TERM_LIMIT = 10000;
// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Initialize data.json if it doesn't exist
 */
function initializeDataFile() {
    if (!fs.existsSync('data.json')) {
        fs.writeFileSync('data.json', JSON.stringify(DEFAULT_DATA, null, 2));
    }
}

/**
 * Validate data entry based on type
 * @param {string} type - Data type (ticks, candles, trades)
 * @param {Object} entry - Data entry to validate
 * @returns {boolean} Whether the entry is valid
 */
function validateEntry(type, entry) {
    try {
        switch (type) {
            case 'ticks':
                return entry.id && typeof entry.id === 'string' &&
                       entry.symbol && typeof entry.symbol === 'string' &&
                       typeof entry.price === 'number' && isFinite(entry.price) &&
                       entry.timestamp && isValidDate(entry.timestamp) &&
                       typeof entry.volume === 'number' && entry.volume >= 0;
            case 'candles':
                return entry.id && typeof entry.id === 'string' &&
                       entry.symbol && typeof entry.symbol === 'string' &&
                       typeof entry.open === 'number' && isFinite(entry.open) &&
                       typeof entry.high === 'number' && isFinite(entry.high) &&
                       typeof entry.low === 'number' && isFinite(entry.low) &&
                       typeof entry.close === 'number' && isFinite(entry.close) &&
                       typeof entry.volume === 'number' && entry.volume >= 0 &&
                       entry.timestamp && isValidDate(entry.timestamp);
            case 'trades':
                return entry.id && typeof entry.id === 'string' &&
                       entry.symbol && typeof entry.symbol === 'string' &&
                       ['win', 'loss'].includes(entry.result) &&
                       typeof entry.pnl === 'number' && isFinite(entry.pnl) &&
                       entry.indicators && typeof entry.indicators === 'object' &&
                       typeof entry.indicators.rsi === 'number' && isFinite(entry.indicators.rsi) &&
                       typeof entry.indicators.macd === 'number' && isFinite(entry.indicators.macd) &&
                       typeof entry.indicators.volatility === 'number' && isFinite(entry.indicators.volatility) &&
                       entry.timestamp && isValidDate(entry.timestamp);
            default:
                return false;
        }
    } catch (error) {
        console.error(`Validation error for ${type}: ${error.message}`);
        return false;
    }
}

/**
 * Validate ISO date string
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} Whether the date is valid
 */
function isValidDate(dateStr) {
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date);
}

/**
 * Clean data entry by ensuring correct types and removing invalid fields
 * @param {Object} entry - Data entry to clean
 * @returns {Object} Cleaned entry
 */
function cleanEntry(entry) {
    const cleaned = { ...entry };
    for (const key in cleaned) {
        if (typeof cleaned[key] === 'number' && !isFinite(cleaned[key])) {
            cleaned[key] = 0; // Replace NaN or Infinity with 0
        }
        if (key === 'timestamp') {
            cleaned[key] = new Date(cleaned[key]).toISOString();
        }
    }
    return cleaned;
}

/**
 * Save data to data.json
 * @param {string} type - Data type (ticks, candles, trades)
 * @param {Object} entry - Data entry to save
 */
export function saveData(type, entry) {
    try {
        initializeDataFile();
        if (!['ticks', 'candles', 'trades'].includes(type)) {
            throw new Error(`Invalid data type: ${type}`);
        }

        if (!validateEntry(type, entry)) {
            throw new Error(`Invalid ${type} entry: ${JSON.stringify(entry)}`);
        }

        const cleanedEntry = cleanEntry(entry);
        const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

        // Append to main array
        data[type].push(cleanedEntry);

        // Update short-term storage
        data.shortTerm[type] = data[type].slice(-SHORT_TERM_LIMIT);

        // Enforce long-term limit if set
        if (LONG_TERM_LIMIT > 0 && data[type].length > LONG_TERM_LIMIT) {
            data[type] = data[type].slice(-LONG_TERM_LIMIT);
        }

        fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error saving ${type} data: ${error.message}`);
    }
}

/**
 * Load data from data.json
 * @param {string} type - Data type (ticks, candles, trades)
 * @param {number|null} limit - Number of entries to load (null for all)
 * @param {boolean} shortTerm - Whether to load short-term data
 * @returns {Array} Loaded data
 */
export function loadData(type, limit = null, shortTerm = false) {
    try {
        initializeDataFile();
        if (!['ticks', 'candles', 'trades'].includes(type)) {
            throw new Error(`Invalid data type: ${type}`);
        }

        const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
        const target = shortTerm ? data.shortTerm[type] : data[type];

        return limit ? target.slice(-limit) : target;
    } catch (error) {
        console.error(`Error loading ${type} data: ${error.message}`);
        return [];
    }
}

/**
 * Periodic cleanup of old data
 */
function cleanupOldData() {
    try {
        initializeDataFile();
        const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

        // Remove entries older than 7 days
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        ['ticks', 'candles', 'trades'].forEach(type => {
            data[type] = data[type].filter(entry => new Date(entry.timestamp) >= cutoff);
            data.shortTerm[type] = data[type].slice(-SHORT_TERM_LIMIT);
        });

        fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error during data cleanup: ${error.message}`);
    }
}

// Start periodic cleanup
setInterval(cleanupOldData, CLEANUP_INTERVAL_MS);