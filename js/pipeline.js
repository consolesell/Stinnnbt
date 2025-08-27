/**
 * Data Pipeline Manager - Handles browser-based data storage and retrieval
 */
class DataPipeline {
    constructor(dataFile = 'data.json') {
        this.dataFile = dataFile;
        this.initializeData();
    }

    /**
     * Initialize data in localStorage if it doesn't exist
     */
    async initializeData() {
        let data = JSON.parse(localStorage.getItem('derivBotData') || '{}');
        if (!data.ticks || !data.candles || !data.trades) {
            data = {
                ticks: [],
                candles: [],
                trades: []
            };
            localStorage.setItem('derivBotData', JSON.stringify(data));
        }

        // Optionally load initial data from data.json (if included in repo)
        try {
            const response = await fetch(this.dataFile);
            if (response.ok) {
                const initialData = await response.json();
                data = { ...data, ...initialData };
                localStorage.setItem('derivBotData', JSON.stringify(data));
            }
        } catch (error) {
            console.warn('No initial data.json found or fetch failed:', error);
        }
    }

    /**
     * Save data entry to specified type
     * @param {string} type - Data type (ticks, candles, trades)
     * @param {Object} entry - Data entry to save
     */
    saveData(type, entry) {
        try {
            const data = JSON.parse(localStorage.getItem('derivBotData') || '{}');
            
            // Clean and validate entry
            const cleanEntry = this.cleanEntry(type, entry);
            
            if (!data[type]) {
                data[type] = [];
            }
            
            data[type].push(cleanEntry);
            
            // Maintain storage limits (keep last 10000 entries per type)
            if (data[type].length > 10000) {
                data[type] = data[type].slice(-10000);
            }
            
            localStorage.setItem('derivBotData', JSON.stringify(data));
            return true;
        } catch (error) {
            console.error(`Error saving ${type} data:`, error);
            return false;
        }
    }

    /**
     * Load data of specified type
     * @param {string} type - Data type (ticks, candles, trades)
     * @param {number|null} limit - Limit number of entries (null for all)
     * @returns {Array} Data entries
     */
    loadData(type, limit = null) {
        try {
            const data = JSON.parse(localStorage.getItem('derivBotData') || '{}');
            const entries = data[type] || [];
            return limit ? entries.slice(-limit) : entries;
        } catch (error) {
            console.error(`Error loading ${type} data:`, error);
            return [];
        }
    }

    /**
     * Clean and validate data entry
     * @param {string} type - Data type
     * @param {Object} entry - Raw entry
     * @returns {Object} Cleaned entry
     */
    cleanEntry(type, entry) {
        const timestamp = new Date().toISOString();
        
        switch (type) {
            case 'ticks':
                return {
                    symbol: entry.symbol || 'UNKNOWN',
                    price: parseFloat(entry.price) || 0,
                    volume: parseFloat(entry.volume) || 0,
                    timestamp: entry.timestamp || timestamp
                };
                
            case 'candles':
                return {
                    symbol: entry.symbol || 'UNKNOWN',
                    open: parseFloat(entry.open) || 0,
                    high: parseFloat(entry.high) || 0,
                    low: parseFloat(entry.low) || 0,
                    close: parseFloat(entry.close) || 0,
                    volume: parseFloat(entry.volume) || 0,
                    timestamp: entry.timestamp || timestamp,
                    timeframe: entry.timeframe || 60
                };
                
            case 'trades':
                return {
                    id: entry.id || `trade_${Date.now()}`,
                    symbol: entry.symbol || 'UNKNOWN',
                    result: entry.result || 'unknown',
                    pnl: parseFloat(entry.pnl) || 0,
                    stake: parseFloat(entry.stake) || 0,
                    contractType: entry.contractType || 'UNKNOWN',
                    duration: parseInt(entry.duration) || 60,
                    indicators: {
                        rsi: parseFloat(entry.indicators?.rsi) || 0,
                        macd: parseFloat(entry.indicators?.macd) || 0,
                        volatility: parseFloat(entry.indicators?.volatility) || 0,
                        movingAverage: parseFloat(entry.indicators?.movingAverage) || 0,
                        bollingerPosition: entry.indicators?.bollingerPosition || 'middle',
                        adx: parseFloat(entry.indicators?.adx) || 0,
                        sentiment: parseFloat(entry.indicators?.sentiment) || 0
                    },
                    marketConditions: {
                        trend: entry.marketConditions?.trend || 'sideways',
                        volatilitySpike: entry.marketConditions?.volatilitySpike || false,
                        newsEvent: entry.marketConditions?.newsEvent || false,
                        candlePattern: entry.marketConditions?.candlePattern || null
                    },
                    timestamp: entry.timestamp || timestamp
                };
                
            default:
                return { ...entry, timestamp };
        }
    }

    /**
     * Get short-term data (latest N entries)
     * @param {string} type - Data type
     * @param {number} count - Number of entries
     * @returns {Array} Recent entries
     */
    getShortTermData(type, count = 100) {
        return this.loadData(type, count);
    }

    /**
     * Get long-term data (all entries)
     * @param {string} type - Data type
     * @returns {Array} All entries
     */
    getLongTermData(type) {
        return this.loadData(type);
    }

    /**
     * Get data statistics
     * @returns {Object} Statistics for each data type
     */
    getDataStats() {
        try {
            const data = JSON.parse(localStorage.getItem('derivBotData') || '{}');
            return {
                ticks: data.ticks?.length || 0,
                candles: data.candles?.length || 0,
                trades: data.trades?.length || 0,
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting data stats:', error);
            return { ticks: 0, candles: 0, trades: 0, lastUpdated: null };
        }
    }

    /**
     * Clear data of specified type
     * @param {string} type - Data type to clear
     */
    clearData(type) {
        try {
            const data = JSON.parse(localStorage.getItem('derivBotData') || '{}');
            data[type] = [];
            localStorage.setItem('derivBotData', JSON.stringify(data));
            return true;
        } catch (error) {
            console.error(`Error clearing ${type} data:`, error);
            return false;
        }
    }
}

// Export functions for compatibility
export function saveData(type, entry) {
    const pipeline = new DataPipeline();
    return pipeline.saveData(type, entry);
}

export function loadData(type, limit = null) {
    const pipeline = new DataPipeline();
    return pipeline.loadData(type, limit);
}

export function getShortTermData(type, count = 100) {
    const pipeline = new DataPipeline();
    return pipeline.getShortTermData(type, count);
}

export function getLongTermData(type) {
    const pipeline = new DataPipeline();
    return pipeline.getLongTermData(type);
}

export function getDataStats() {
    const pipeline = new DataPipeline();
    return pipeline.getDataStats();
}

export function clearData(type) {
    const pipeline = new DataPipeline();
    return pipeline.clearData(type);
}

export { DataPipeline };

// Initialize data on load
const pipeline = new DataPipeline();
pipeline.initializeData();
