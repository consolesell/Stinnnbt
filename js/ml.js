/**
 * MLManager - Manages machine learning model for trading predictions
 * @class
 */
import { loadData } from './pipeline.js';

export class MLManager {
    constructor() {
        // Load persisted model state from localStorage
        this.models = new Map(JSON.parse(localStorage.getItem('mlModels') || '[]'));
        this.featureWeights = new Map(JSON.parse(localStorage.getItem('mlFeatureWeights') || '[]'));
        this.performanceHistory = JSON.parse(localStorage.getItem('mlPerformanceHistory') || '[]');
        this.minConfidenceThreshold = 0.7; // Minimum confidence for trade signals
        console.log('MLManager initialized, loaded model state from storage');
    }

    /**
     * Train the ML model using historical trade data
     * @returns {Object} Training result
     */
    trainModel() {
        try {
            const trades = loadData('trades');
            if (!trades || trades.length < 20) {
                console.warn('Insufficient trade data for training');
                return { error: 'Insufficient trade data', featureImportance: {} };
            }

            // Initialize feature weights if empty
            if (this.featureWeights.size === 0) {
                this.featureWeights.set('rsi', 0.2);
                this.featureWeights.set('macd', 0.2);
                this.featureWeights.set('volatility', 0.15);
                this.featureWeights.set('movingAverage', 0.15);
                this.featureWeights.set('bollingerPosition', 0.1);
                this.featureWeights.set('adx', 0.1);
                this.featureWeights.set('sentiment', 0.05);
                this.featureWeights.set('candlePattern', 0.05);
            }

            // Simple training: Update feature weights based on successful trades
            const successfulTrades = trades.filter(trade => trade.result === 'win');
            const featureImportance = {};
            for (const feature of this.featureWeights.keys()) {
                const avgValue = successfulTrades.reduce((sum, trade) => {
                    if (feature === 'candlePattern') {
                        return sum + (['BullishEngulfing', 'Hammer', 'MorningStar', 'BullishHarami'].includes(trade.marketConditions[feature]) ? 1 : 0);
                    }
                    return sum + (trade.indicators[feature] || 0);
                }, 0) / (successfulTrades.length || 1);
                featureImportance[feature] = this.featureWeights.get(feature) * avgValue;
            }

            // Normalize feature importance
            const totalWeight = Object.values(featureImportance).reduce((sum, val) => sum + val, 0);
            for (const feature in featureImportance) {
                featureImportance[feature] = totalWeight ? featureImportance[feature] / totalWeight : 0;
            }

            // Update performance history
            this.performanceHistory.push({
                timestamp: new Date().toISOString(),
                tradesProcessed: trades.length,
                featureImportance
            });
            if (this.performanceHistory.length > 100) {
                this.performanceHistory.shift();
            }

            // Save model state to localStorage
            this.saveModelState();

            console.log('ML model trained successfully');
            return { featureImportance };
        } catch (error) {
            console.error(`Error training ML model: ${error.message}`);
            return { error: `Training failed: ${error.message}`, featureImportance: {} };
        }
    }

    /**
     * Save model state to localStorage
     */
    saveModelState() {
        try {
            localStorage.setItem('mlModels', JSON.stringify([...this.models]));
            localStorage.setItem('mlFeatureWeights', JSON.stringify([...this.featureWeights]));
            localStorage.setItem('mlPerformanceHistory', JSON.stringify(this.performanceHistory));
            console.log('ML model state saved to storage');
        } catch (error) {
            console.error(`Error saving ML model state: ${error.message}`);
        }
    }

    /**
     * Predict trade based on indicators and market conditions
     * @param {Object} indicators - Technical indicators
     * @param {Object} marketConditions - Market conditions
     * @returns {Object} Prediction result
     */
    predictTrade(indicators, marketConditions) {
        try {
            if (!indicators || !marketConditions) {
                console.error('Invalid input for prediction:', { indicators, marketConditions });
                return { shouldTrade: false, tradeType: null, confidence: 0, reason: 'Invalid input' };
            }

            // Calculate weighted score for trade decision
            let score = 0;
            score += (indicators.rsi > 70 ? -1 : indicators.rsi < 30 ? 1 : 0) * (this.featureWeights.get('rsi') || 0.2);
            score += (indicators.macd > 0 ? 1 : -1) * (this.featureWeights.get('macd') || 0.2);
            score += (indicators.volatility < 2 ? 0.5 : -0.5) * (this.featureWeights.get('volatility') || 0.15);
            score += (indicators.movingAverage && this.candles?.slice(-1)[0]?.close > indicators.movingAverage ? 1 : -1) * (this.featureWeights.get('movingAverage') || 0.15);
            score += (indicators.bollingerPosition === 'above' ? -1 : indicators.bollingerPosition === 'below' ? 1 : 0) * (this.featureWeights.get('bollingerPosition') || 0.1);
            score += (indicators.adx > 25 ? 1 : 0) * (this.featureWeights.get('adx') || 0.1);
            score += (indicators.sentiment > 0 ? 1 : -1) * (this.featureWeights.get('sentiment') || 0.05);

            // Adjust score based on candle patterns
            const bullishPatterns = ['BullishEngulfing', 'Hammer', 'MorningStar', 'BullishHarami'];
            const bearishPatterns = ['BearishEngulfing', 'ShootingStar', 'EveningStar', 'BearishHarami'];
            if (bullishPatterns.includes(marketConditions.candlePattern)) {
                score += (this.featureWeights.get('candlePattern') || 0.05);
            } else if (bearishPatterns.includes(marketConditions.candlePattern)) {
                score -= (this.featureWeights.get('candlePattern') || 0.05);
            }

            // Adjust for market conditions
            if (marketConditions.volatilitySpike || marketConditions.newsEvent) {
                score *= 0.5; // Reduce confidence during high volatility or news
            }

            const confidence = Math.min(1, Math.max(0, Math.abs(score)));
            const shouldTrade = confidence >= this.minConfidenceThreshold && !marketConditions.volatilitySpike && !marketConditions.newsEvent;

            // Save performance history
            this.performanceHistory.push({
                timestamp: new Date().toISOString(),
                indicators,
                marketConditions,
                score,
                confidence,
                shouldTrade,
                tradeType: score > 0 ? 'CALL' : 'PUT'
            });
            if (this.performanceHistory.length > 100) {
                this.performanceHistory.shift();
            }

            this.saveModelState();

            const result = {
                shouldTrade,
                tradeType: score > 0 ? 'CALL' : 'PUT',
                confidence,
                reason: shouldTrade ? `High confidence score: ${confidence.toFixed(2)}` : `Low confidence: ${confidence.toFixed(2)}`,
                featureImportance: Object.fromEntries(this.featureWeights)
            };
            console.log(`Trade prediction: ${JSON.stringify(result)}`);
            return result;
        } catch (error) {
            console.error(`Error predicting trade: ${error.message}`);
            return { shouldTrade: false, tradeType: null, confidence: 0, reason: `Prediction failed: ${error.message}` };
        }
    }
}
