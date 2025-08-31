/**
 * IndicatorManager - Calculates technical indicators and correlations for trading
 * @class
 */
export class IndicatorManager {
  constructor() {
    this.indicators = {
      rsi: 0,
      movingAverage: 0,
      volatility: 0,
      bollingerBands: { upper: 0, middle: 0, lower: 0 },
      macd: { line: 0, signal: 0, histogram: 0 },
      stochastic: { k: 0, d: 0 },
      adx: 0,
      obv: 0,
      sentiment: 0,
    };
    this.correlations = new Map();
    this.log = (message, type = 'info') => {
      window.derivBot?.log(`[IndicatorManager] ${message}`, type);
    };
  }

  /**
   * Update indicators based on candle data
   * @param {Array<Object>} candles - Array of candle objects
   */
  updateIndicators(candles) {
    try {
      if (!Array.isArray(candles) || candles.length < 14) {
        this.log('Insufficient candle data for indicators', 'warning');
        return;
      }

      const closes = candles.map((c) => c.close);
      this.indicators.rsi = this.calculateRSI(closes);
      this.indicators.movingAverage = this.calculateMA(closes, 20);
      this.indicators.volatility = this.calculateVolatility(closes);
      this.indicators.bollingerBands = this.calculateBollingerBands(closes);
      this.indicators.macd = this.calculateMACD(closes);
      this.indicators.stochastic = this.calculateStochastic(candles);
      this.indicators.adx = this.calculateADX(candles);
      this.indicators.obv = this.calculateOBV(candles);
      this.indicators.sentiment = this.calculateSentiment(closes);

      this.log('Indicators updated', 'debug');
    } catch (error) {
      this.log(`Error updating indicators: ${error.message}`, 'error');
    }
  }

  /**
   * Calculate RSI (Relative Strength Index)
   * @param {Array<number>} closes - Array of closing prices
   * @returns {number} RSI value
   */
  calculateRSI(closes) {
    if (closes.length < 14) return 0;
    const period = 14;
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = closes[closes.length - i] - closes[closes.length - i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculate Moving Average
   * @param {Array<number>} closes - Array of closing prices
   * @param {number} period - MA period
   * @returns {number} MA value
   */
  calculateMA(closes, period = 20) {
    if (closes.length < period) return 0;
    const slice = closes.slice(-period);
    return slice.reduce((sum, price) => sum + price, 0) / period;
  }

  /**
   * Calculate Volatility
   * @param {Array<number>} closes - Array of closing prices
   * @returns {number} Volatility percentage
   */
  calculateVolatility(closes) {
    if (closes.length < 20) return 0;
    const slice = closes.slice(-20);
    const mean = slice.reduce((sum, price) => sum + price, 0) / slice.length;
    const variance = slice.reduce((sum, price) => sum + ((price - mean) ** 2), 0) / slice.length;
    return Math.sqrt(variance) / mean * 100;
  }

  /**
   * Calculate Bollinger Bands
   * @param {Array<number>} closes - Array of closing prices
   * @returns {Object} { upper, middle, lower }
   */
  calculateBollingerBands(closes) {
    if (closes.length < 20) return { upper: 0, middle: 0, lower: 0 };
    const period = 20;
    const slice = closes.slice(-period);
    const middle = this.calculateMA(closes, period);
    const stdDev = Math.sqrt(slice.reduce((sum, price) => sum + ((price - middle) ** 2), 0) / period);
    return {
      upper: middle + 2 * stdDev,
      middle,
      lower: middle - 2 * stdDev,
    };
  }

  /**
   * Calculate MACD
   * @param {Array<number>} closes - Array of closing prices
   * @returns {Object} { line, signal, histogram }
   */
  calculateMACD(closes) {
    if (closes.length < 26) return { line: 0, signal: 0, histogram: 0 };
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const line = ema12 - ema26;
    const signal = this.calculateEMA(candles.slice(-9).map(() => line), 9);
    return { line, signal, histogram: line - signal };
  }

  /**
   * Calculate EMA (Exponential Moving Average)
   * @param {Array<number>} prices - Array of prices
   * @param {number} period - EMA period
   * @returns {number} EMA value
   */
  calculateEMA(prices, period) {
    if (prices.length < period) return 0;
    const k = 2 / (period + 1);
    let ema = prices[prices.length - period];
    for (let i = prices.length - period + 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  }

  /**
   * Calculate Stochastic Oscillator
   * @param {Array<Object>} candles - Array of candle objects
   * @returns {Object} { k, d }
   */
  calculateStochastic(candles) {
    if (candles.length < 14) return { k: 0, d: 0 };
    const period = 14;
    const slice = candles.slice(-period);
    const highestHigh = Math.max(...slice.map((c) => c.high));
    const lowestLow = Math.min(...slice.map((c) => c.low));
    const currentClose = slice[slice.length - 1].close;
    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    const d = this.calculateMA(candles.slice(-3).map(() => k), 3);
    return { k, d };
  }

  /**
   * Calculate ADX (Average Directional Index)
   * @param {Array<Object>} candles - Array of candle objects
   * @returns {number} ADX value
   */
  calculateADX(candles) {
    if (candles.length < 14) return 0;
    // Simplified ADX calculation (placeholder)
    return 20; // Replace with actual ADX logic if needed
  }

  /**
   * Calculate OBV (On-Balance Volume)
   * @param {Array<Object>} candles - Array of candle objects
   * @returns {number} OBV value
   */
  calculateOBV(candles) {
    if (candles.length < 2) return 0;
    let obv = 0;
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].close > candles[i - 1].close) {
        obv += candles[i].volume;
      } else if (candles[i].close < candles[i - 1].close) {
        obv -= candles[i].volume;
      }
    }
    return obv;
  }

  /**
   * Calculate market sentiment (placeholder)
   * @param {Array<number>} closes - Array of closing prices
   * @returns {number} Sentiment score
   */
  calculateSentiment(closes) {
    if (closes.length < 20) return 0;
    const recent = closes.slice(-10);
    const older = closes.slice(-20, -10);
    const recentAvg = recent.reduce((sum, p) => sum + p, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p, 0) / older.length;
    return (recentAvg - olderAvg) / olderAvg * 100;
  }

  /**
   * Update correlations between symbols
   * @param {Map<string, Array<Object>>} candlesMap - Map of symbol to candles
   */
  updateCorrelations(candlesMap) {
    try {
      this.correlations.clear();
      const symbols = Array.from(candlesMap.keys());
      for (let i = 0; i < symbols.length; i++) {
        for (let j = i + 1; j < symbols.length; j++) {
          const symbol1 = symbols[i];
          const symbol2 = symbols[j];
          const closes1 = candlesMap.get(symbol1).slice(-50).map((c) => c.close);
          const closes2 = candlesMap.get(symbol2).slice(-50).map((c) => c.close);
          if (closes1.length < 50 || closes2.length < 50) continue;
          const correlation = this.calculateCorrelation(closes1, closes2);
          this.correlations.set(`${symbol1}-${symbol2}`, correlation);
        }
      }
      this.log('Correlations updated', 'debug');
    } catch (error) {
      this.log(`Error updating correlations: ${error.message}`, 'error');
    }
  }

  /**
   * Calculate Pearson correlation between two price series
   * @param {Array<number>} series1 - First price series
   * @param {Array<number>} series2 - Second price series
   * @returns {number} Correlation coefficient
   */
  calculateCorrelation(series1, series2) {
    if (series1.length !== series2.length) return 0;
    const n = series1.length;
    const mean1 = series1.reduce((sum, val) => sum + val, 0) / n;
    const mean2 = series2.reduce((sum, val) => sum + val, 0) / n;
    let cov = 0;
    let std1 = 0;
    let std2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = series1[i] - mean1;
      const diff2 = series2[i] - mean2;
      cov += diff1 * diff2;
      std1 += diff1 ** 2;
      std2 += diff2 ** 2;
    }

    return cov / Math.sqrt(std1 * std2);
  }

  /**
   * Get current indicators
   * @returns {Object} Current indicator values
   */
  getIndicators() {
    return { ...this.indicators };
  }

  /**
   * Get current correlations
   * @returns {Map<string, number>} Correlation map
   */
  getCorrelations() {
    return new Map(this.correlations);
  }
}
