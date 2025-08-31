/**
 * CandleManager - Manages candlestick data and pattern detection
 * @class
 */
import { saveData, loadData } from './pipeline.js';

export class CandleManager {
    constructor({ timeframe = 60 } = {}) {
        this.timeframe = timeframe * 1000; // Convert to milliseconds
        this.candles = new Map(); // Map<symbol, Array<Candle>>
        this.loadCandles();
    }

    /**
     * Load candles from localStorage
     */
    loadCandles() {
        try {
            const candlesData = loadData('candles') || [];
            candlesData.forEach(candle => {
                if (!this.candles.has(candle.symbol)) {
                    this.candles.set(candle.symbol, []);
                }
                this.candles.get(candle.symbol).push(candle);
            });
            console.log(`Loaded ${candlesData.length} candles from storage`);
        } catch (error) {
            console.error(`Error loading candles: ${error.message}`);
        }
    }

    /**
     * Save candles to localStorage
     * @param {string} symbol - Market symbol
     */
    saveCandles(symbol) {
        try {
            const candles = this.candles.get(symbol) || [];
            saveData('candles', candles);
            console.log(`Saved ${candles.length} candles for ${symbol} to storage`);
        } catch (error) {
            console.error(`Error saving candles: ${error.message}`);
        }
    }

    /**
     * Initialize candles for a symbol
     * @param {string} symbol - Market symbol
     */
    initializeSymbol(symbol) {
        if (!this.candles.has(symbol)) {
            this.candles.set(symbol, []);
            console.log(`Initialized candle storage for ${symbol}`);
        }
    }

    /**
     * Set candle timeframe
     * @param {number} timeframe - Timeframe in seconds
     */
    setTimeframe(timeframe) {
        this.timeframe = timeframe * 1000;
        console.log(`Set candle timeframe to ${timeframe} seconds`);
    }

    /**
     * Add a tick to the candle data
     * @param {string} symbol - Market symbol
     * @param {Object} tick - Tick data { price, time, volume }
     */
    addTick(symbol, tick) {
        if (!symbol || !tick || !tick.price || !tick.time) {
            console.error('Invalid tick data:', { symbol, tick });
            return;
        }

        if (!this.candles.has(symbol)) {
            this.initializeSymbol(symbol);
        }

        const candles = this.candles.get(symbol);
        const timestamp = Math.floor(tick.time.getTime() / this.timeframe) * this.timeframe;
        let currentCandle = candles[candles.length - 1];

        if (!currentCandle || currentCandle.timestamp !== timestamp) {
            currentCandle = {
                symbol,
                timestamp,
                open: tick.price,
                high: tick.price,
                low: tick.price,
                close: tick.price,
                volume: tick.volume || 0
            };
            candles.push(currentCandle);
        } else {
            currentCandle.high = Math.max(currentCandle.high, tick.price);
            currentCandle.low = Math.min(currentCandle.low, tick.price);
            currentCandle.close = tick.price;
            currentCandle.volume += tick.volume || 0;
        }

        if (candles.length > 100) {
            candles.shift();
        }

        this.saveCandles(symbol);
    }

    /**
     * Add historical tick data for backtesting
     * @param {string} symbol - Market symbol
     * @param {Object} tick - Historical tick data
     */
    addHistoricalTick(symbol, tick) {
        this.addTick(symbol, {
            price: tick.price,
            time: new Date(tick.timestamp),
            volume: tick.volume || 1
        });
    }

    /**
     * Get candles for a symbol
     * @param {string} symbol - Market symbol
     * @returns {Array<Object>} Array of candle objects
     */
    getCandles(symbol) {
        return this.candles.get(symbol) || [];
    }

    /**
     * Detect candlestick patterns
     * @param {string} symbol - Market symbol
     * @returns {string|null} Detected pattern or null
     */
    detectPattern(symbol) {
        const candles = this.candles.get(symbol);
        if (!candles || candles.length < 3) {
            console.warn(`Insufficient candles for pattern detection: ${symbol}`);
            return null;
        }

        const [prev2, prev, current] = candles.slice(-3);

        // Bullish Engulfing
        if (prev.close < prev.open && current.close > current.open && 
            current.close > prev.open && current.open < prev.close) {
            return 'BullishEngulfing';
        }

        // Bearish Engulfing
        if (prev.close > prev.open && current.close < current.open && 
            current.close < prev.open && current.open > prev.close) {
            return 'BearishEngulfing';
        }

        // Doji
        if (Math.abs(current.open - current.close) <= (current.high - current.low) * 0.1) {
            return 'Doji';
        }

        // Hammer
        if (current.close > current.open && 
            (current.high - current.close) <= (current.close - current.open) * 0.3 && 
            (current.close - current.open) <= (current.open - current.low) * 0.3) {
            return 'Hammer';
        }

        // Morning Star (3-candle bullish reversal)
        if (prev2.close < prev2.open && 
            Math.abs(prev.open - prev.close) <= (prev.high - prev.low) * 0.3 && 
            current.close > current.open && current.close > prev2.open) {
            return 'MorningStar';
        }

        // Shooting Star (bearish reversal)
        if (current.close < current.open && 
            (current.open - current.low) <= (current.open - current.close) * 0.3 && 
            (current.high - current.open) >= (current.open - current.close) * 2) {
            return 'ShootingStar';
        }

        // Evening Star (3-candle bearish reversal)
        if (prev2.close > prev2.open && 
            Math.abs(prev.open - prev.close) <= (prev.high - prev.low) * 0.3 && 
            current.close < current.open && current.close < prev2.open) {
            return 'EveningStar';
        }

        // Bullish Harami
        if (prev.close < prev.open && current.close > current.open && 
            current.open > prev.close && current.close < prev.open) {
            return 'BullishHarami';
        }

        // Bearish Harami
        if (prev.close > prev.open && current.close < current.open && 
            current.open < prev.close && current.close > prev.open) {
            return 'BearishHarami';
        }

        return null;
    }
}
