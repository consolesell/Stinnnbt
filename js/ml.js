import { loadData } from './pipeline.js';

/**
 * Machine Learning Manager - Handles pattern recognition and trade prediction
 */
class MLManager {
    constructor() {
        this.models = new Map();
        this.featureWeights = new Map();
        this.performanceHistory = [];
    }

    /**
     * Train model based on historical trade data
     * @returns {Object} Training results and model statistics
     */
    trainModel() {
        const trades = loadData('trades');
        
        if (trades.length < 20) {
            return { error: 'Insufficient data for training', dataPoints: trades.length };
        }

        // Initialize statistics containers
        const stats = {
            rsi: { low: { wins: 0, losses: 0 }, middle: { wins: 0, losses: 0 }, high: { wins: 0, losses: 0 } },
            macd: { positive: { wins: 0, losses: 0 }, negative: { wins: 0, losses: 0 } },
            volatility: { low: { wins: 0, losses: 0 }, high: { wins: 0, losses: 0 } },
            trend: { uptrend: { wins: 0, losses: 0 }, downtrend: { wins: 0, losses: 0 }, sideways: { wins: 0, losses: 0 } },
            patterns: new Map(),
            combinations: new Map()
        };

        // Process each trade for pattern recognition
        trades.forEach(trade => {
            const isWin = trade.result === 'win';
            const indicators = trade.indicators;
            const marketConditions = trade.marketConditions;

            // RSI zones
            if (indicators.rsi < 30) {
                stats.rsi.low[isWin ? 'wins' : 'losses']++;
            } else if (indicators.rsi > 70) {
                stats.rsi.high[isWin ? 'wins' : 'losses']++;
            } else {
                stats.rsi.middle[isWin ? 'wins' : 'losses']++;
            }

            // MACD signals
            if (indicators.macd > 0) {
                stats.macd.positive[isWin ? 'wins' : 'losses']++;
            } else {
                stats.macd.negative[isWin ? 'wins' : 'losses']++;
            }

            // Volatility conditions
            if (indicators.volatility < 1.5) {
                stats.volatility.low[isWin ? 'wins' : 'losses']++;
            } else {
                stats.volatility.high[isWin ? 'wins' : 'losses']++;
            }

            // Market trends
            const trend = marketConditions.trend || 'sideways';
            stats.trend[trend][isWin ? 'wins' : 'losses']++;

            // Candle patterns
            if (marketConditions.candlePattern) {
                const pattern = marketConditions.candlePattern;
                if (!stats.patterns.has(pattern)) {
                    stats.patterns.set(pattern, { wins: 0, losses: 0 });
                }
                stats.patterns.get(pattern)[isWin ? 'wins' : 'losses']++;
            }

            // Multi-indicator combinations
            const combo = this.createCombinationKey(indicators, marketConditions);
            if (!stats.combinations.has(combo)) {
                stats.combinations.set(combo, { wins: 0, losses: 0, trades: [] });
            }
            const comboStats = stats.combinations.get(combo);
            comboStats[isWin ? 'wins' : 'losses']++;
            comboStats.trades.push(trade);
        });

        // Calculate win rates and store model
        const modelResults = this.calculateWinRates(stats);
        this.models.set('primary', modelResults);
        
        // Update feature weights based on performance
        this.updateFeatureWeights(modelResults);

        return {
            dataPoints: trades.length,
            model: modelResults,
            topCombinations: this.getTopCombinations(stats.combinations),
            featureImportance: this.calculateFeatureImportance(stats)
        };
    }

    /**
     * Calculate win rates for all analyzed patterns
     * @param {Object} stats - Statistics object
     * @returns {Object} Win rates and recommendations
     */
    calculateWinRates(stats) {
        const calculateRate = (wins, losses) => {
            const total = wins + losses;
            return total > 0 ? wins / total : 0;
        };

        return {
            rsi: {
                low: { 
                    winRate: calculateRate(stats.rsi.low.wins, stats.rsi.low.losses),
                    trades: stats.rsi.low.wins + stats.rsi.low.losses,
                    recommendation: calculateRate(stats.rsi.low.wins, stats.rsi.low.losses) > 0.6 ? 'CALL' : null
                },
                high: { 
                    winRate: calculateRate(stats.rsi.high.wins, stats.rsi.high.losses),
                    trades: stats.rsi.high.wins + stats.rsi.high.losses,
                    recommendation: calculateRate(stats.rsi.high.wins, stats.rsi.high.losses) > 0.6 ? 'PUT' : null
                }
            },
            macd: {
                positive: { 
                    winRate: calculateRate(stats.macd.positive.wins, stats.macd.positive.losses),
                    recommendation: calculateRate(stats.macd.positive.wins, stats.macd.positive.losses) > 0.6 ? 'CALL' : null
                },
                negative: { 
                    winRate: calculateRate(stats.macd.negative.wins, stats.macd.negative.losses),
                    recommendation: calculateRate(stats.macd.negative.wins, stats.macd.negative.losses) > 0.6 ? 'PUT' : null
                }
            },
            volatility: {
                low: { 
                    winRate: calculateRate(stats.volatility.low.wins, stats.volatility.low.losses),
                    trades: stats.volatility.low.wins + stats.volatility.low.losses
                },
                high: { 
                    winRate: calculateRate(stats.volatility.high.wins, stats.volatility.high.losses),
                    trades: stats.volatility.high.wins + stats.volatility.high.losses
                }
            },
            trends: Object.fromEntries(
                Object.entries(stats.trend).map(([trend, data]) => [
                    trend, 
                    { 
                        winRate: calculateRate(data.wins, data.losses),
                        trades: data.wins + data.losses
                    }
                ])
            ),
            patterns: Object.fromEntries(
                Array.from(stats.patterns.entries()).map(([pattern, data]) => [
                    pattern,
                    { 
                        winRate: calculateRate(data.wins, data.losses),
                        trades: data.wins + data.losses
                    }
                ])
            )
        };
    }

    /**
     * Predict trade decision based on current market indicators
     * @param {Object} indicators - Current market indicators
     * @param {Object} marketConditions - Current market conditions
     * @returns {Object} Trade prediction
     */
    predictTrade(indicators, marketConditions = {}) {
        const model = this.models.get('primary');
        
        if (!model) {
            return { 
                shouldTrade: false, 
                reason: 'Model not trained yet',
                confidence: 0
            };
        }

        const predictions = [];
        let totalConfidence = 0;
        let tradeSignals = [];

        // RSI-based prediction
        if (indicators.rsi < 30 && model.rsi.low.winRate > 0.6 && model.rsi.low.trades >= 5) {
            const confidence = Math.min(model.rsi.low.winRate * model.rsi.low.trades / 10, 0.9);
            predictions.push({ 
                signal: 'CALL', 
                confidence, 
                reason: `RSI oversold (${indicators.rsi.toFixed(1)})`,
                source: 'RSI'
            });
            tradeSignals.push('CALL');
            totalConfidence += confidence;
        } else if (indicators.rsi > 70 && model.rsi.high.winRate > 0.6 && model.rsi.high.trades >= 5) {
            const confidence = Math.min(model.rsi.high.winRate * model.rsi.high.trades / 10, 0.9);
            predictions.push({ 
                signal: 'PUT', 
                confidence, 
                reason: `RSI overbought (${indicators.rsi.toFixed(1)})`,
                source: 'RSI'
            });
            tradeSignals.push('PUT');
            totalConfidence += confidence;
        }

        // MACD-based prediction
        if (indicators.macd > 0 && model.macd.positive.winRate > 0.6) {
            const confidence = Math.min(model.macd.positive.winRate * 0.8, 0.8);
            predictions.push({ 
                signal: 'CALL', 
                confidence, 
                reason: 'MACD bullish crossover',
                source: 'MACD'
            });
            tradeSignals.push('CALL');
            totalConfidence += confidence;
        } else if (indicators.macd < 0 && model.macd.negative.winRate > 0.6) {
            const confidence = Math.min(model.macd.negative.winRate * 0.8, 0.8);
            predictions.push({ 
                signal: 'PUT', 
                confidence, 
                reason: 'MACD bearish crossover',
                source: 'MACD'
            });
            tradeSignals.push('PUT');
            totalConfidence += confidence;
        }

        // Pattern-based prediction
        if (marketConditions.candlePattern && model.patterns[marketConditions.candlePattern]) {
            const patternStats = model.patterns[marketConditions.candlePattern];
            if (patternStats.winRate > 0.6 && patternStats.trades >= 3) {
                const patternSignal = this.getPatternSignal(marketConditions.candlePattern);
                if (patternSignal) {
                    const confidence = Math.min(patternStats.winRate * 0.7, 0.8);
                    predictions.push({ 
                        signal: patternSignal, 
                        confidence, 
                        reason: `Pattern: ${marketConditions.candlePattern}`,
                        source: 'Pattern'
                    });
                    tradeSignals.push(patternSignal);
                    totalConfidence += confidence;
                }
            }
        }

        // Volatility filter
        const volatilityPenalty = indicators.volatility > 2.5 ? 0.3 : 0;
        totalConfidence -= volatilityPenalty;

        // Trend alignment bonus
        const trendAlignment = this.calculateTrendAlignment(tradeSignals, marketConditions.trend);
        totalConfidence += trendAlignment;

        // Determine final prediction
        if (predictions.length === 0) {
            return { shouldTrade: false, reason: 'No strong signals found', confidence: 0 };
        }

        const averageConfidence = totalConfidence / predictions.length;
        const consensusSignal = this.getConsensusSignal(tradeSignals);
        
        const finalPrediction = {
            shouldTrade: averageConfidence > 0.5,
            tradeType: consensusSignal,
            confidence: Math.min(Math.max(averageConfidence, 0), 1),
            predictions,
            consensusStrength: this.calculateConsensusStrength(tradeSignals),
            reason: predictions.map(p => p.reason).join(', ')
        };

        // Store prediction for performance tracking
        this.performanceHistory.push({
            prediction: finalPrediction,
            timestamp: new Date().toISOString(),
            indicators: { ...indicators },
            marketConditions: { ...marketConditions }
        });

        return finalPrediction;
    }

    /**
     * Get signal recommendation for candle patterns
     * @param {string} pattern - Candle pattern name
     * @returns {string|null} Trade signal or null
     */
    getPatternSignal(pattern) {
        const bullishPatterns = ['BullishEngulfing', 'Hammer', 'MorningStar', 'Doji'];
        const bearishPatterns = ['BearishEngulfing', 'ShootingStar', 'EveningStar'];
        
        if (bullishPatterns.includes(pattern)) return 'CALL';
        if (bearishPatterns.includes(pattern)) return 'PUT';
        return null;
    }

    /**
     * Calculate consensus from multiple signals
     * @param {Array} signals - Array of trade signals
     * @returns {string} Consensus signal
     */
    getConsensusSignal(signals) {
        const callCount = signals.filter(s => s === 'CALL').length;
        const putCount = signals.filter(s => s === 'PUT').length;
        return callCount > putCount ? 'CALL' : 'PUT';
    }

    /**
     * Calculate consensus strength
     * @param {Array} signals - Array of trade signals
     * @returns {number} Strength value between 0 and 1
     */
    calculateConsensusStrength(signals) {
        if (signals.length === 0) return 0;
        const dominant = this.getConsensusSignal(signals);
        const dominantCount = signals.filter(s => s === dominant).length;
        return dominantCount / signals.length;
    }

    /**
     * Calculate trend alignment bonus
     * @param {Array} signals - Trade signals
     * @param {string} trend - Market trend
     * @returns {number} Alignment bonus
     */
    calculateTrendAlignment(signals, trend) {
        if (!trend || signals.length === 0) return 0;
        
        const consensusSignal = this.getConsensusSignal(signals);
        
        if (trend === 'uptrend' && consensusSignal === 'CALL') return 0.1;
        if (trend === 'downtrend' && consensusSignal === 'PUT') return 0.1;
        if (trend === 'sideways') return -0.1; // Penalty for range-bound markets
        
        return -0.05; // Small penalty for counter-trend trades
    }

    /**
     * Create combination key for multi-indicator analysis
     * @param {Object} indicators - Market indicators
     * @param {Object} marketConditions - Market conditions
     * @returns {string} Combination key
     */
    createCombinationKey(indicators, marketConditions) {
        const rsiZone = indicators.rsi < 30 ? 'low' : indicators.rsi > 70 ? 'high' : 'middle';
        const macdSignal = indicators.macd > 0 ? 'positive' : 'negative';
        const volatilityLevel = indicators.volatility > 2 ? 'high' : 'low';
        const trend = marketConditions.trend || 'sideways';
        
        return `${rsiZone}-${macdSignal}-${volatilityLevel}-${trend}`;
    }

    /**
     * Get top performing combinations
     * @param {Map} combinations - Combinations data
     * @returns {Array} Top combinations
     */
    getTopCombinations(combinations) {
        return Array.from(combinations.entries())
            .map(([combo, data]) => ({
                combination: combo,
                winRate: data.wins / (data.wins + data.losses),
                totalTrades: data.wins + data.losses,
                wins: data.wins,
                losses: data.losses
            }))
            .filter(c => c.totalTrades >= 5)
            .sort((a, b) => b.winRate - a.winRate)
            .slice(0, 10);
    }

    /**
     * Calculate feature importance
     * @param {Object} stats - Statistics object
     * @returns {Object} Feature importance scores
     */
    calculateFeatureImportance(stats) {
        const importance = {};
        
        // RSI importance
        const rsiTotalTrades = stats.rsi.low.wins + stats.rsi.low.losses + 
                              stats.rsi.high.wins + stats.rsi.high.losses;
        const rsiWinRate = (stats.rsi.low.wins + stats.rsi.high.wins) / rsiTotalTrades;
        importance.rsi = rsiTotalTrades > 0 ? rsiWinRate * (rsiTotalTrades / 100) : 0;
        
        // MACD importance
        const macdTotalTrades = stats.macd.positive.wins + stats.macd.positive.losses +
                               stats.macd.negative.wins + stats.macd.negative.losses;
        const macdWinRate = (stats.macd.positive.wins + stats.macd.negative.wins) / macdTotalTrades;
        importance.macd = macdTotalTrades > 0 ? macdWinRate * (macdTotalTrades / 100) : 0;
        
        // Pattern importance
        let patternTotalTrades = 0;
        let patternWins = 0;
        stats.patterns.forEach(pattern => {
            patternTotalTrades += pattern.wins + pattern.losses;
            patternWins += pattern.wins;
        });
        importance.patterns = patternTotalTrades > 0 ? (patternWins / patternTotalTrades) * (patternTotalTrades / 100) : 0;
        
        return importance;
    }

    /**
     * Update feature weights based on recent performance
     * @param {Object} model - Model results
     */
    updateFeatureWeights(model) {
        this.featureWeights.set('rsi', Math.max(model.rsi.low.winRate, model.rsi.high.winRate));
        this.featureWeights.set('macd', Math.max(model.macd.positive.winRate, model.macd.negative.winRate));
        
        let maxPatternRate = 0;
        Object.values(model.patterns || {}).forEach(pattern => {
            maxPatternRate = Math.max(maxPatternRate, pattern.winRate);
        });
        this.featureWeights.set('patterns', maxPatternRate);
    }

    /**
     * Get model performance statistics
     * @returns {Object} Performance statistics
     */
    getModelPerformance() {
        const model = this.models.get('primary');
        if (!model) return null;

        const recentPredictions = this.performanceHistory.slice(-50);
        return {
            totalPredictions: this.performanceHistory.length,
            recentPredictions: recentPredictions.length,
            featureWeights: Object.fromEntries(this.featureWeights),
            modelQuality: this.assessModelQuality(model),
            lastTrained: new Date().toISOString()
        };
    }

    /**
     * Assess overall model quality
     * @param {Object} model - Model to assess
     * @returns {number} Quality score between 0 and 1
     */
    assessModelQuality(model) {
        let totalScore = 0;
        let componentCount = 0;

        // RSI quality
        const rsiScore = (model.rsi.low.winRate + model.rsi.high.winRate) / 2;
        totalScore += rsiScore;
        componentCount++;

        // MACD quality
        const macdScore = (model.macd.positive.winRate + model.macd.negative.winRate) / 2;
        totalScore += macdScore;
        componentCount++;

        // Pattern quality
        const patternRates = Object.values(model.patterns || {}).map(p => p.winRate);
        if (patternRates.length > 0) {
            const patternScore = patternRates.reduce((sum, rate) => sum + rate, 0) / patternRates.length;
            totalScore += patternScore;
            componentCount++;
        }

        return componentCount > 0 ? totalScore / componentCount : 0;
    }
}

// Export functions for compatibility
export function trainModel() {
    const ml = new MLManager();
    return ml.trainModel();
}

export function predictTrade(indicators, marketConditions) {
    const ml = new MLManager();
    return ml.predictTrade(indicators, marketConditions);
}

export function getModelPerformance() {
    const ml = new MLManager();
    return ml.getModelPerformance();
}

export { MLManager };
