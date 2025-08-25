// knowledge.js - Calculate bot's intelligence level

/**
 * Calculate ML intelligence level
 * @param {number} datasetSize - Number of data samples
 * @param {number} modelConfidence - Average confidence from predictions
 * @param {number} backtestWinRate - Win rate from backtest
 * @param {number} liveWinRate - Live trading win rate
 * @returns {number} Intelligence level (0-10)
 */
export function calculateIntelligenceLevel(datasetSize, modelConfidence, backtestWinRate, liveWinRate) {
  if (datasetSize < 50) return 0; // Insufficient data

  const dataScore = Math.min(10, datasetSize / 50); // Max 10 for 500+ samples
  const confScore = modelConfidence * 10; // 0-10 based on 0-1 confidence
  const backtestScore = backtestWinRate / 10; // Assuming win rate 0-100%
  const liveScore = liveWinRate / 10;

  const level = (dataScore + confScore + backtestScore + liveScore) / 4;
  return Math.round(Math.min(10, Math.max(0, level)));
}

/**
 * Get status message based on level
 * @param {number} level - Intelligence level
 * @returns {string} Status
 */
export function getKnowledgeStatus(level) {
  if (level < 3) return 'Insufficient data - Training needed';
  if (level < 7) return 'Training in progress';
  return 'Ready - High confidence';
}