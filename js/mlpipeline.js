// mlpipeline.js - Data cleaning, normalization, and Firebase integration

import { saveData, loadData } from './firebase.js';

/**
 * Clean and normalize tick or candle data
 * @param {Object} data - Raw data (tick or candle)
 * @returns {Object} Cleaned data
 */
export function cleanData(data) {
  // Remove invalid or missing values
  if (!data.price || isNaN(data.price)) return null;
  if (!data.time) data.time = new Date().toISOString();

  // Normalize (example: scale price if needed)
  return {
    ...data,
    price: parseFloat(data.price.toFixed(5)),
    volume: data.volume ? Math.round(data.volume) : 1
  };
}

/**
 * Categorize trade outcome with market context
 * @param {Object} trade - Trade data from historicalData
 * @param {Object} indicators - Current indicators
 * @returns {Object} Labeled data for ML
 */
export function labelTradeData(trade, indicators) {
  return {
    symbol: trade.symbol,
    timestamp: trade.timestamp.toISOString(),
    price: trade.price,
    result: trade.result, // 'win' or 'loss'
    pnl: trade.pnl,
    features: {
      rsi: indicators.rsi,
      macd_histogram: indicators.macd.histogram,
      volatility: indicators.volatility,
      adx: indicators.adx
    },
    label: trade.result === 'win' ? 1 : 0 // Binary label for ML
  };
}

/**
 * Save tick data to Firebase
 * @param {string} symbol - Symbol
 * @param {Object} tick - Tick data
 */
export async function saveTickData(symbol, tick) {
  const cleaned = cleanData(tick);
  if (cleaned) {
    await saveData(`ticks/${symbol}`, cleaned);
  }
}

/**
 * Save candle data to Firebase
 * @param {string} symbol - Symbol
 * @param {string} timeframe - Timeframe
 * @param {Object} candle - Candle data
 */
export async function saveCandleData(symbol, timeframe, candle) {
  const cleaned = cleanData(candle);
  if (cleaned) {
    await saveData(`candles/${symbol}/${timeframe}`, cleaned);
  }
}

/**
 * Save trade data to Firebase
 * @param {string} sessionId - Session ID
 * @param {Object} trade - Trade data
 * @param {Object} indicators - Indicators at trade time
 */
export async function saveTradeData(sessionId, trade, indicators) {
  const labeled = labelTradeData(trade, indicators);
  await saveData(`trades/${sessionId}`, labeled);
}

/**
 * Load dataset for ML training
 * @param {string} collectionPath - e.g., 'trades/sessionId'
 * @param {Object} queryParams - Query filters
 * @returns {Promise<{features: Array, labels: Array}>} Training-ready data
 */
export async function loadDataset(collectionPath, queryParams) {
  const data = await loadData(collectionPath, queryParams);
  const features = data.map(item => [
    item.features.rsi,
    item.features.macd_histogram,
    item.features.volatility,
    item.features.adx
  ]);
  const labels = data.map(item => [item.label]);
  return { features, labels };
}