/**
 * CandleManager - Manages candlestick data and pattern detection for trading
 * @class
 */
export class CandleManager {
  constructor({ timeframe = 60 } = {}) {
    this.timeframe = timeframe; // Timeframe in seconds
    this.candles = new Map(); // Map<symbol, Array<candle>>
    this.log = (message, type = 'info') => {
      window.derivBot?.log(`[CandleManager] ${message}`, type);
    };
  }

  /**
   * Set the timeframe for candlestick aggregation
   * @param {number} timeframe - Timeframe in seconds
   */
  setTimeframe(timeframe) {
    if (typeof timeframe !== 'number' || timeframe < 1) {
      this.log(`Invalid timeframe: ${timeframe}`, 'error');
      return;
    }
    this.timeframe = timeframe;
    this.log(`Timeframe set to ${timeframe}s`, 'debug');
  }

  /**
   * Initialize candle storage for a symbol
   * @param {string} symbol - Market symbol (e.g., 'R_10')
   */
  initializeSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') {
      this.log(`Invalid symbol: ${symbol}`, 'error');
      return;
    }
    if (!this.candles.has(symbol)) {
      this.candles.set(symbol, []);
      this.log(`Initialized candles for ${symbol}`, 'debug');
    }
  }

  /**
   * Add a tick to the candle data for a symbol
   * @param {string} symbol - Market symbol
   * @param {Object} tick - Tick data { price: number, time: Date, volume: number }
   */
  addTick(symbol, tick) {
    try {
      if (!symbol || !tick || typeof tick.price !== 'number' || !(tick.time instanceof Date) || typeof tick.volume !== 'number') {
        this.log(`Invalid tick data for ${symbol}: ${JSON.stringify(tick)}`, 'error');
        return;
      }

      let symbolCandles = this.candles.get(symbol);
      if (!symbolCandles) {
        this.initializeSymbol(symbol);
        symbolCandles = this.candles.get(symbol);
      }

      const timeBucket = Math.floor(tick.time.getTime() / (this.timeframe * 1000)) * (this.timeframe * 1000);
      const lastCandle = symbolCandles[symbolCandles.length - 1];

      if (lastCandle && lastCandle.time.getTime() === timeBucket) {
        lastCandle.high = Math.max(lastCandle.high, tick.price);
        lastCandle.low = Math.min(lastCandle.low, tick.price);
        lastCandle.close = tick.price;
        lastCandle.volume += tick.volume;
      } else {
        symbolCandles.push({
          time: new Date(timeBucket),
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: tick.volume,
        });
        if (symbolCandles.length > 1000) {
          symbolCandles.shift();
        }
      }

      this.candles.set(symbol, symbolCandles);
      this.log(`Added tick for ${symbol}: ${tick.price}`, 'debug');
    } catch (error) {
      this.log(`Error adding tick for ${symbol}: ${error.message}`, 'error');
    }
  }

  /**
   * Add historical tick data for backtesting
   * @param {string} symbol - Market symbol
   * @param {Object} tick - Historical tick data { price: number, time: Date, volume: number }
   */
  addHistoricalTick(symbol, tick) {
    this.addTick(symbol, tick);
    this.log(`Added historical tick for ${symbol}: ${tick.price}`, 'debug');
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
   * Detect candlestick patterns for a symbol
   * @param {string} symbol - Market symbol
   * @returns {string|null} Detected pattern or null
   */
  detectPattern(symbol) {
    try {
      const candles = this.getCandles(symbol);
      if (candles.length < 2) {
        this.log(`Insufficient candles for pattern detection in ${symbol}`, 'warning');
        return null;
      }

      const [prev, current] = candles.slice(-2);

      // Bullish Engulfing
      if (prev.close < prev.open && current.close > current.open && current.close > prev.open && current.open < prev.close) {
        return 'BullishEngulfing';
      }

      // Bearish Engulfing
      if (prev.close > prev.open && current.close < current.open && current.close < prev.open && current.open > prev.close) {
        return 'BearishEngulfing';
      }

      // Hammer
      if (current.close > current.open && (current.open - current.low) > 2 * (current.close - current.open) && (current.high - current.close) < (current.close - current.open)) {
        return 'Hammer';
      }

      // Shooting Star
      if (current.close < current.open && (current.high - current.open) > 2 * (current.open - current.close) && (current.close - current.low) < (current.open - current.close)) {
        return 'ShootingStar';
      }

      // Doji
      if (Math.abs(current.open - current.close) < (current.high - current.low) * 0.1) {
        return 'Doji';
      }

      return null;
    } catch (error) {
      this.log(`Error detecting pattern for ${symbol}: ${error.message}`, 'error');
      return null;
    }
  }
}
