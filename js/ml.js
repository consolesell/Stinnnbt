/**
 * ML - Machine learning-based trade predictions
 */

/**
 * Predict trade based on indicators and market conditions
 * @param {Object} indicators - Technical indicators from IndicatorManager
 * @param {Object} marketConditions - Market conditions { trend, volatilitySpike, candlePattern, newsEvent }
 * @returns {Object} Trade signal { shouldTrade, tradeType, confidence, reason, features }
 */
export function predictTrade(indicators, marketConditions) {
  try {
    if (!indicators || !marketConditions) {
      window.derivBot?.log('[ML] Invalid input for prediction', 'error');
      return { shouldTrade: false, tradeType: 'CALL', confidence: 0, reason: 'Invalid input', features: {} };
    }

    const { rsi, macd, volatility, adx } = indicators;
    const { trend, volatilitySpike, candlePattern, newsEvent } = marketConditions;

    if (newsEvent || volatilitySpike) {
      return {
        shouldTrade: false,
        tradeType: 'CALL',
        confidence: 0,
        reason: `Avoid trading during ${newsEvent ? 'news event' : 'volatility spike'}`,
        features: { rsi, macd: macd.histogram, volatility },
      };
    }

    let score = 0;
    let reason = '';

    // RSI-based signal
    if (rsi > 70) {
      score -= 0.3;
      reason += 'Overbought RSI; ';
    } else if (rsi < 30) {
      score += 0.3;
      reason += 'Oversold RSI; ';
    }

    // MACD-based signal
    if (macd.histogram > 0) {
      score += 0.2;
      reason += 'Bullish MACD; ';
    } else if (macd.histogram < 0) {
      score -= 0.2;
      reason += 'Bearish MACD; ';
    }

    // Trend-based signal
    if (trend === 'uptrend') {
      score += 0.2;
      reason += 'Uptrend detected; ';
    } else if (trend === 'downtrend') {
      score -= 0.2;
      reason += 'Downtrend detected; ';
    }

    // Candle pattern confirmation
    if (candlePattern && ['BullishEngulfing', 'Hammer', 'MorningStar'].includes(candlePattern)) {
      score += 0.15;
      reason += `Bullish pattern: ${candlePattern}; `;
    } else if (candlePattern && ['BearishEngulfing', 'ShootingStar'].includes(candlePattern)) {
      score -= 0.15;
      reason += `Bearish pattern: ${candlePattern}; `;
    }

    // Volatility and ADX filters
    if (volatility > 2.5 || adx > 25) {
      score *= 0.5;
      reason += 'High volatility or strong trend; ';
    }

    const confidence = Math.min(Math.max(Math.abs(score), 0), 1);
    const shouldTrade = confidence > 0.5;
    const tradeType = score > 0 ? 'CALL' : 'PUT';

    return {
      shouldTrade,
      tradeType,
      confidence,
      reason: reason || 'No strong signal',
      features: { rsi, macd: macd.histogram, volatility },
    };
  } catch (error) {
    window.derivBot?.log(`[ML] Prediction error: ${error.message}`, 'error');
    return { shouldTrade: false, tradeType: 'CALL', confidence: 0, reason: 'Prediction error', features: {} };
  }
}
