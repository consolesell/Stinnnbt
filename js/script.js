/**
 * AdvancedDerivBot - A sophisticated trading bot for Deriv platform with modular candle and indicator support
 * @class
 */
import { CandleManager } from './candles.js';
import { IndicatorManager } from './indicators.js';
import { saveData, loadData } from './pipeline.js';
import { predictTrade } from './ml.js';

class AdvancedDerivBot {
  constructor() {
    // WebSocket connection
    this.ws = null;
    this.isConnected = false;
    this.isTrading = false;
    this.appId = 1089;
    this.apiToken = null;
    this.connectionRetries = 0;
    this.maxRetries = 3;
    this.debugMode = true;

    // Trading statistics
    this.balance = 0;
    this.totalTrades = 0;
    this.wins = 0;
    this.losses = 0;
    this.currentStreak = 0;
    this.totalPnL = 0;
    this.currentStake = 1;
    this.initialStake = 1;
    this.lastTradeResult = null;
    this.consecutiveLosses = 0;

    // Market data
    this.currentPrice = 0;
    this.candleManager = new CandleManager({ timeframe: 60 });
    this.indicatorManager = new IndicatorManager();

    // Trading configuration with defaults
    this.config = {
      strategy: 'martingale',
      symbol: 'R_10',
      symbols: ['R_10'],
      tradeType: 'CALL',
      duration: 60,
      maxLoss: 50,
      maxProfit: 100,
      maxTrades: 50,
      multiplier: 2.1,
      stopLossEnabled: true,
      takeProfitEnabled: true,
      maxDrawdown: 20,
      maxConsecutiveLosses: 5,
      cooldownPeriod: 300000,
      positionSizing: 'kelly',
      fixedFraction: 0.02,
      customStrategyRules: [],
      useMultiTimeframe: true,
      useDynamicSwitching: true,
      trailingProfitThreshold: 0.5,
      useCandlePatterns: true,
      candleTimeframe: 60,
      chartType: 'line',
    };

    // Trading state management
    this.tradeQueue = [];
    this.activeContract = null;
    this.lastTradeTime = 0;
    this.minTradeInterval = 5000;
    this.isProcessingQueue = false;
    this.requestIdCounter = 1;
    this.isPaused = false;
    this.historicalData = [];
    this.strategyStats = {};
    this.pauseExtensions = 0;
    this.maxPauseExtensions = 3;

    // Economic calendar
    this.newsEvents = [
      { hour: 12, minute: 30, duration: 15, description: 'US Non-Farm Payrolls' },
      { hour: 14, minute: 0, duration: 10, description: 'US CPI Release' },
      { hour: 8, minute: 30, duration: 15, description: 'EU ECB Rate Decision' },
    ];
    this.correlations = this.indicatorManager.getCorrelations();

    this.init();
  }

  /**
   * Initialize bot components and event listeners
   */
  init() {
    // Initialize all configured symbols
    this.config.symbols.forEach((symbol) => {
      this.candleManager.initializeSymbol(symbol);
      this.log(`Initialized symbol: ${symbol}`, 'info');
    });
    this.setupEventListeners();
    this.loadHistoricalData();
    this.updateUI();
    this.log('Bot initialized successfully', 'info');
  }

  /**
   * Log messages to console and UI
   * @param {string} message - Message to log
   * @param {string} type - Log type (info, warning, error, success, debug)
   */
  log(message, type = 'info') {
    if (this.debugMode || type !== 'debug') {
      console.log(`[${type.toUpperCase()}] ${message}`);
      window.updateLog?.(`${new Date().toISOString()} [${type.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Load historical data from storage
   */
  loadHistoricalData() {
    try {
      this.historicalData = loadData('trades') || [];
      this.log(`Loaded ${this.historicalData.length} historical trades`, 'info');
    } catch (error) {
      this.log(`Error loading historical data: ${error.message}`, 'error');
    }
  }

  /**
   * Setup all event listeners for UI controls
   */
  setupEventListeners() {
    const addListener = (id, event, handler) => {
      const element = document.getElementById(id);
      if (!element) {
        this.log(`Error: Element with ID '${id}' not found`, 'error');
        return;
      }
      element.addEventListener(event, handler);
      if (this.debugMode) {
        this.log(`Event listener added for ${id}:${event}`, 'debug');
      }
    };

    addListener('connect-btn', 'click', () => this.connect());
    addListener('start-btn', 'click', () => this.startTrading());
    addListener('stop-btn', 'click', () => this.stopTrading());
    addListener('reset-btn', 'click', () => this.resetStats());
    addListener('backtest-btn', 'click', () => this.runBacktest());
    addListener('app-id', 'change', (e) => {
      this.appId = parseInt(e.target.value, 10) || 1089;
      this.log(`App ID updated: ${this.appId}`, 'debug');
    });
    addListener('api-token', 'change', (e) => {
      this.apiToken = e.target.value.trim();
      this.log('API token updated', 'debug');
    });

    const configInputs = [
      'strategy-select',
      'symbols',
      'trade-type',
      'duration',
      'stake',
      'max-loss',
      'max-profit',
      'max-trades',
      'multiplier',
      'stop-loss-enabled',
      'take-profit-enabled',
      'max-drawdown',
      'max-consecutive-losses',
      'cooldown-period',
      'position-sizing',
      'fixed-fraction',
      'custom-strategy-rules',
      'multi-timeframe',
      'dynamic-switching',
      'use-candle-patterns',
      'candle-timeframe',
      'chart-type',
    ];

    configInputs.forEach((id) => {
      addListener(id, 'change', () => {
        this.updateConfig();
        this.log(`Config input '${id}' changed`, 'debug');
      });
    });

    addListener('clear-log', 'click', () => this.clearLog());
  }

  /**
   * Update trading configuration from UI inputs with validation
   */
  updateConfig() {
    const getValue = (id, type = 'string') => {
      const element = document.getElementById(id);
      if (!element) {
        this.log(`Error: Config element '${id}' not found`, 'error');
        return null;
      }
      try {
        if (id === 'symbols') {
          return Array.from(element.selectedOptions).map((opt) => opt.value);
        }
        const value = type === 'number' ? parseFloat(element.value) :
                      type === 'integer' ? parseInt(element.value, 10) :
                      type === 'boolean' ? element.checked :
                      type === 'json' ? JSON.parse(element.value || '[]') :
                      element.value;
        return Number.isNaN(value) ? null : value;
      } catch (error) {
        this.log(`Error parsing config for '${id}': ${error.message}`, 'error');
        return null;
      }
    };

    try {
      const newConfig = {
        strategy: getValue('strategy-select') || this.config.strategy,
        symbols: getValue('symbols') || this.config.symbols,
        tradeType: getValue('trade-type') || this.config.tradeType,
        duration: getValue('duration', 'integer') || this.config.duration,
        maxLoss: getValue('max-loss', 'number') || this.config.maxLoss,
        maxProfit: getValue('max-profit', 'number') || this.config.maxProfit,
        maxTrades: getValue('max-trades', 'integer') || this.config.maxTrades,
        multiplier: getValue('multiplier', 'number') || this.config.multiplier,
        stopLossEnabled: getValue('stop-loss-enabled', 'boolean') ?? this.config.stopLossEnabled,
        takeProfitEnabled: getValue('take-profit-enabled', 'boolean') ?? this.config.takeProfitEnabled,
        maxDrawdown: getValue('max-drawdown', 'number') || this.config.maxDrawdown,
        maxConsecutiveLosses: getValue('max-consecutive-losses', 'integer') || this.config.maxConsecutiveLosses,
        cooldownPeriod: getValue('cooldown-period', 'integer') || this.config.cooldownPeriod,
        positionSizing: getValue('position-sizing') || this.config.positionSizing,
        fixedFraction: getValue('fixed-fraction', 'number') || this.config.fixedFraction,
        customStrategyRules: getValue('custom-strategy-rules', 'json') || this.config.customStrategyRules,
        useMultiTimeframe: getValue('multi-timeframe', 'boolean') ?? this.config.useMultiTimeframe,
        useDynamicSwitching: getValue('dynamic-switching', 'boolean') ?? this.config.useDynamicSwitching,
        useCandlePatterns: getValue('use-candle-patterns', 'boolean') ?? this.config.useCandlePatterns,
        candleTimeframe: getValue('candle-timeframe', 'integer') || this.config.candleTimeframe,
        chartType: getValue('chart-type') || this.config.chartType,
      };

      // Validation
      if (newConfig.symbols.length === 0) {
        this.log('Error: At least one symbol must be selected', 'error');
        return;
      }
      if (newConfig.duration < 1) {
        this.log('Error: Duration must be at least 1 second', 'error');
        newConfig.duration = 1;
      }
      if (newConfig.maxLoss < 0) {
        this.log('Error: Max loss cannot be negative', 'error');
        newConfig.maxLoss = 0;
      }
      if (newConfig.maxProfit < 0) {
        this.log('Error: Max profit cannot be negative', 'error');
        newConfig.maxProfit = 0;
      }
      if (newConfig.maxTrades < 1) {
        this.log('Error: Max trades must be at least 1', 'error');
        newConfig.maxTrades = 1;
      }
      if (newConfig.multiplier < 1) {
        this.log('Error: Multiplier must be at least 1', 'error');
        newConfig.multiplier = 1;
      }
      if (newConfig.maxDrawdown < 0) {
        this.log('Error: Max drawdown cannot be negative', 'error');
        newConfig.maxDrawdown = 0;
      }
      if (newConfig.maxConsecutiveLosses < 1) {
        this.log('Error: Max consecutive losses must be at least 1', 'error');
        newConfig.maxConsecutiveLosses = 1;
      }
      if (newConfig.cooldownPeriod < 1000) {
        this.log('Error: Cooldown period must be at least 1000ms', 'error');
        newConfig.cooldownPeriod = 1000;
      }
      if (newConfig.fixedFraction < 0) {
        this.log('Error: Fixed fraction cannot be negative', 'error');
        newConfig.fixedFraction = 0;
      }
      if (newConfig.candleTimeframe < 1) {
        this.log('Error: Candle timeframe must be at least 1 second', 'error');
        newConfig.candleTimeframe = 1;
      }

      this.config = { ...this.config, ...newConfig };
      this.config.symbol = this.config.symbols[0] || 'R_10';
      this.initialStake = parseFloat((getValue('stake', 'number') || this.initialStake).toFixed(1));
      this.currentStake = this.initialStake;
      this.candleManager.setTimeframe(this.config.candleTimeframe);

      // Re-initialize symbols after config update
      this.config.symbols.forEach((symbol) => {
        this.candleManager.initializeSymbol(symbol);
        this.log(`Re-initialized symbol: ${symbol}`, 'info');
      });

      this.log(`Configuration updated: ${this.config.strategy} strategy on ${this.config.symbols.join(', ')}`, 'info');
    } catch (error) {
      this.log(`Configuration error: ${error.message}`, 'error');
    }
  }

  /**
   * Establish WebSocket connection to Deriv API
   */
  async connect() {
    this.log('Initiating connection...', 'info');
    if (!this.appId || Number.isNaN(this.appId)) {
      this.log('Error: Valid App ID is required', 'error');
      this.updateConnectionStatus('Error: Invalid App ID', false);
      return;
    }

    if (!this.apiToken) {
      this.log('Warning: API token not provided; authentication will be skipped', 'warning');
    }

    if (this.connectionRetries >= this.maxRetries) {
      this.log('Error: Maximum connection retries reached', 'error');
      this.updateConnectionStatus('Error: Max Retries Reached', false);
      return;
    }

    try {
      this.updateConnectionStatus('Connecting...', false);
      const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`;
      this.log(`Connecting to WebSocket: ${wsUrl}`, 'debug');
      this.ws = new WebSocket(wsUrl);
      this.connectionRetries++;

      this.ws.onopen = () => {
        this.isConnected = true;
        this.connectionRetries = 0;
        this.updateConnectionStatus('Connected', true);
        this.log('WebSocket connected successfully', 'success');

        if (this.apiToken) {
          this.log('Sending authentication request', 'debug');
          this.authenticate();
        }
        this.config.symbols.forEach((symbol) => {
          this.log(`Subscribing to ticks for ${symbol}`, 'debug');
          this.subscribeToTicks(symbol);
        });
        this.requestBalance();
        this.processQueue();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.log(`Received message: ${data.msg_type} (req_id: ${data.req_id || 'none'})`, 'debug');
          this.handleMessage(data);
        } catch (error) {
          this.log(`Error parsing WebSocket message: ${error.message}`, 'error');
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.updateConnectionStatus('Disconnected', false);
        this.log('WebSocket connection closed', 'warning');

        if (this.connectionRetries < this.maxRetries) {
          this.log(`Retrying connection (${this.connectionRetries + 1}/${this.maxRetries})...`, 'info');
          setTimeout(() => this.connect(), 5000);
        }
      };

      this.ws.onerror = (error) => {
        this.log(`WebSocket error: ${error.message || 'Unknown error'}`, 'error');
        this.updateConnectionStatus('Error', false);
      };
    } catch (error) {
      this.log(`Connection error: ${error.message}`, 'error');
      this.updateConnectionStatus('Error', false);
      if (this.connectionRetries < this.maxRetries) {
        this.log(`Retrying connection (${this.connectionRetries + 1}/${this.maxRetries})...`, 'info');
        setTimeout(() => this.connect(), 5000);
      }
    }
  }

  /**
   * Authenticate with Deriv API using token
   */
  authenticate() {
    this.sendMessage({
      authorize: this.apiToken,
      req_id: this.generateReqId(),
    });
  }

  /**
   * Request account balance
   */
  requestBalance() {
    this.sendMessage({
      balance: 1,
      req_id: this.generateReqId(),
    });
  }

  /**
   * Subscribe to market tick data for a symbol
   * @param {string} symbol - Market symbol
   */
  subscribeToTicks(symbol) {
    this.sendMessage({
      ticks: symbol,
      subscribe: 1,
      req_id: this.generateReqId(),
    });
    this.candleManager.initializeSymbol(symbol);
  }

  /**
   * Generate unique request ID
   * @returns {number} Request ID
   */
  generateReqId() {
    return this.requestIdCounter++;
  }

  /**
   * Send WebSocket message
   * @param {Object} message - Message to send
   */
  sendMessage(message) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      this.log(`Sent message: ${message.msg_type || Object.keys(message)[0]} (req_id: ${message.req_id || 'none'})`, 'debug');
    } else {
      this.log('Cannot send message: WebSocket not connected', 'error');
      this.tradeQueue.push(message);
    }
  }

  /**
   * Process queued WebSocket messages
   */
  processQueue() {
    if (this.isProcessingQueue || !this.isConnected || this.ws.readyState !== WebSocket.OPEN) return;
    this.isProcessingQueue = true;

    while (this.tradeQueue.length > 0) {
      const message = this.tradeQueue.shift();
      this.sendMessage(message);
    }

    this.isProcessingQueue = false;
  }

  /**
   * Handle incoming WebSocket messages
   * @param {Object} data - Message data from API
   */
  handleMessage(data) {
    if (data.error) {
      const errorMsg = `API Error: ${data.error.message} (code: ${data.error.code}, req_id: ${data.req_id || 'unknown'})`;
      this.log(errorMsg, 'error');
      if (data.error.code === 'InvalidStake') {
        this.adjustStakeForRetry();
      } else if (data.error.code === 'RateLimit') {
        this.log('Rate limit hit; retrying after delay', 'warning');
        setTimeout(() => this.processQueue(), 1000);
      }
      return;
    }

    switch (data.msg_type) {
      case 'authorize':
        this.log('Authentication successful', 'success');
        this.requestBalance();
        break;
      case 'balance':
        this.balance = data.balance?.balance ?? this.balance;
        this.updateUI();
        break;
      case 'tick':
        this.processTick(data.tick);
        break;
      case 'proposal':
        this.handleProposal(data.proposal);
        break;
      case 'buy':
        this.handleBuy(data.buy);
        break;
      case 'proposal_open_contract':
        this.handleContractUpdate(data.proposal_open_contract);
        break;
      default:
        this.log(`Unhandled message type: ${data.msg_type}`, 'warning');
    }
  }

  /**
   * Adjust stake and retry if API rejects due to invalid stake
   */
  adjustStakeForRetry() {
    this.currentStake = parseFloat(Math.max(0.60, this.currentStake - 0.1).toFixed(1));
    this.log(`Retrying with adjusted stake: $${this.currentStake}`, 'warning');
    this.executeTrade(this.config.tradeType, this.config.symbol);
  }

  /**
   * Process market tick data
   * @param {Object} tick - Tick data from API
   */
  processTick(tick) {
    try {
      if (!tick?.symbol) {
        this.log('Invalid tick: missing symbol', 'error');
        return;
      }
      this.currentPrice = tick.quote;
      const tickData = {
        symbol: tick.symbol,
        price: this.currentPrice,
        volume: tick.volume || this.estimateVolume(this.currentPrice),
        timestamp: new Date(tick.epoch * 1000).toISOString(),
      };
      saveData('ticks', tickData);

      this.candleManager.addTick(tick.symbol, {
        price: this.currentPrice,
        time: new Date(tick.epoch * 1000),
        volume: tick.volume || this.estimateVolume(this.currentPrice),
      });

      const candles = this.candleManager.getCandles(tick.symbol);
      if (candles.length > 0) {
        const latestCandle = candles[candles.length - 1];
        const candleData = {
          symbol: tick.symbol,
          open: latestCandle.open,
          high: latestCandle.high,
          low: latestCandle.low,
          close: latestCandle.close,
          volume: latestCandle.volume,
          timestamp: new Date(latestCandle.time).toISOString(),
          timeframe: this.config.candleTimeframe,
        };
        saveData('candles', candleData);

        this.indicatorManager.updateIndicators(candles);
        const candleMap = new Map(this.config.symbols.map((s) => [s, this.candleManager.getCandles(s)]));
        this.indicatorManager.updateCorrelations(candleMap);
        window.updatePriceChart?.(candles, tick.symbol);
      } else {
        this.log(`No candles available for ${tick.symbol}`, 'warning');
      }

      if (tick.symbol === this.config.symbol && this.isTrading && !this.activeContract && !this.isPaused) {
        this.evaluateTradeSignal(tick.symbol);
      }

      this.updateUI();
    } catch (error) {
      this.log(`Error processing tick: ${error.message}`, 'error');
    }
  }

  /**
   * Estimate volume when Deriv API doesn't provide it
   * @param {number} currentPrice - Current price
   * @returns {number} Estimated volume
   */
  estimateVolume(currentPrice) {
    const prices = this.candleManager.getCandles(this.config.symbol).map((c) => c.close);
    if (prices.length < 2) return 1;
    const priceChange = Math.abs(currentPrice - prices[prices.length - 2]);
    return Math.max(1, Math.round(priceChange * 1000));
  }

  /**
   * Evaluate trading signals for a symbol
   * @param {string} symbol - Market symbol
   */
  evaluateTradeSignal(symbol) {
    if (Date.now() - this.lastTradeTime < this.minTradeInterval || this.isPaused) {
      return;
    }

    const signal = this.getTradeSignal(symbol);
    if (signal.shouldTrade) {
      this.executeTrade(signal.tradeType, symbol);
    }
  }

  /**
   * Get trading signal based on strategy and candle patterns
   * @param {string} symbol - Market symbol
   * @returns {Object} Trading signal
   */
  getTradeSignal(symbol) {
    if (this.config.useDynamicSwitching) {
      this.config.strategy = this.selectBestStrategy();
    }

    const signal = (() => {
      switch (this.config.strategy) {
        case 'martingale':
          return this.getMartingaleSignal();
        case 'dalembert':
          return this.getDalembertSignal();
        case 'trend-follow':
          return this.getTrendFollowSignal();
        case 'mean-reversion':
          return this.getMeanReversionSignal();
        case 'rsi-strategy':
          return this.getRSISignal();
        case 'grid':
          return this.getGridSignal(symbol);
        case 'arbitrage':
          return this.getArbitrageSignal();
        case 'ml-based':
          return this.getMLBasedSignal();
        case 'custom':
          return this.getCustomSignal();
        default:
          return { shouldTrade: false, tradeType: 'CALL' };
      }
    })();

    if (signal.shouldTrade && this.config.useCandlePatterns) {
      const pattern = this.candleManager.detectPattern(symbol);
      signal.shouldTrade = this.confirmSignalWithPattern(signal.tradeType, pattern);
      if (signal.shouldTrade) {
        this.log(`Trade confirmed with pattern: ${pattern || 'None'}`, 'info');
      } else {
        this.log(`Trade skipped: No confirming candle pattern for ${signal.tradeType}`, 'warning');
      }
    }

    return signal;
  }

  /**
   * Confirm trade signal with candle patterns
   * @param {string} tradeType - Trade type (CALL/PUT)
   * @param {string} pattern - Detected candle pattern
   * @returns {boolean} Whether signal is confirmed
   */
  confirmSignalWithPattern(tradeType, pattern) {
    if (!pattern) return false;
    return (
      (tradeType === 'CALL' && ['BullishEngulfing', 'Hammer', 'MorningStar'].includes(pattern)) ||
      (tradeType === 'PUT' && ['BearishEngulfing', 'ShootingStar'].includes(pattern)) ||
      pattern === 'Doji'
    );
  }

  /**
   * Get Martingale strategy signal
   * @returns {Object} Trading signal
   */
  getMartingaleSignal() {
    return this.getRSISignal();
  }

  /**
   * Get D'Alembert strategy signal
   * @returns {Object} Trading signal
   */
  getDalembertSignal() {
    return this.getRSISignal();
  }

  /**
   * Get Trend Following strategy signal
   * @returns {Object} Trading signal
   */
  getTrendFollowSignal() {
    const indicators = this.indicatorManager.getIndicators();
    const candles = this.candleManager.getCandles(this.config.symbol);
    if (candles.length < 10) {
      this.log(`Insufficient candles for trend-follow: ${candles.length}`, 'warning');
      return { shouldTrade: false };
    }

    const shortMA = this.config.useMultiTimeframe ? this.indicatorManager.calculateMA(candles, 5) : indicators.movingAverage;
    return {
      shouldTrade: indicators.adx > 20,
      tradeType: this.currentPrice > shortMA ? 'CALL' : 'PUT',
    };
  }

  /**
   * Get Mean Reversion strategy signal
   * @returns {Object} Trading signal
   */
  getMeanReversionSignal() {
    const indicators = this.indicatorManager.getIndicators();
    const candles = this.candleManager.getCandles(this.config.symbol);
    if (candles.length < 20) {
      this.log(`Insufficient candles for mean-reversion: ${candles.length}`, 'warning');
      return { shouldTrade: false };
    }

    const longMA = this.config.useMultiTimeframe ? this.indicatorManager.calculateMA(candles, 20) : indicators.movingAverage;
    const deviation = Math.abs(this.currentPrice - longMA) / longMA * 100;

    if (deviation > indicators.volatility * 1.5 && indicators.adx < 20) {
      return {
        shouldTrade: true,
        tradeType: this.currentPrice > longMA ? 'PUT' : 'CALL',
      };
    }
    return { shouldTrade: false };
  }

  /**
   * Get RSI strategy signal
   * @returns {Object} Trading signal
   */
  getRSISignal() {
    const indicators = this.indicatorManager.getIndicators();
    if (indicators.rsi === 0) {
      this.log('RSI not calculated; skipping signal', 'warning');
      return { shouldTrade: false };
    }

    return {
      shouldTrade: (indicators.rsi > 70 || indicators.rsi < 30),
      tradeType: indicators.rsi > 70 ? 'PUT' : 'CALL',
    };
  }

  /**
   * Get Grid Trading strategy signal
   * @param {string} symbol - Market symbol
   * @returns {Object} Trading signal
   */
  getGridSignal(symbol) {
    const indicators = this.indicatorManager.getIndicators();
    const candles = this.candleManager.getCandles(symbol);
    if (candles.length < 20) {
      this.log(`Insufficient candles for grid signal: ${candles.length}`, 'warning');
      return { shouldTrade: false };
    }

    const gridSize = indicators.volatility * 0.01;
    const middlePrice = indicators.bollingerBands.middle;
    const gridLevel = Math.round((this.currentPrice - middlePrice) / gridSize);
    if (Math.abs(gridLevel) > 5) return { shouldTrade: false };

    return {
      shouldTrade: indicators.volatility < 2,
      tradeType: gridLevel > 0 ? 'PUT' : 'CALL',
    };
  }

  /**
   * Get Arbitrage strategy signal
   * @returns {Object} Trading signal
   */
  getArbitrageSignal() {
    if (this.config.symbols.length < 2) {
      this.log('Arbitrage requires at least two symbols', 'warning');
      return { shouldTrade: false };
    }

    const symbol1 = this.config.symbols[0];
    const symbol2 = this.config.symbols[1];
    const candles1 = this.candleManager.getCandles(symbol1).slice(-50);
    const candles2 = this.candleManager.getCandles(symbol2).slice(-50);

    if (candles1.length < 50 || candles2.length < 50) {
      this.log(`Insufficient candles for arbitrage: ${symbol1}=${candles1.length}, ${symbol2}=${candles2.length}`, 'warning');
      return { shouldTrade: false };
    }

    const price1 = candles1[candles1.length - 1].close;
    const price2 = candles2[candles2.length - 1].close;
    const spread = Math.abs(price1 - price2) / Math.min(price1, price2);

    if (spread > 0.01) {
      return {
        shouldTrade: true,
        tradeType: price1 > price2 ? 'PUT' : 'CALL',
        symbol: price1 > price2 ? symbol1 : symbol2,
      };
    }
    return { shouldTrade: false };
  }

  /**
   * Get Machine Learning-based strategy signal
   * @returns {Object} Trading signal
   */
  getMLBasedSignal() {
    if (this.historicalData.length < 20) {
      this.log('Insufficient historical data for ML prediction', 'warning');
      return { shouldTrade: false, tradeType: 'CALL' };
    }

    const indicators = this.indicatorManager.getIndicators();
    const marketConditions = {
      trend: this.detectMarketTrend(),
      volatilitySpike: this.detectVolatilitySpike(),
      candlePattern: this.candleManager.detectPattern(this.config.symbol),
      newsEvent: this.checkMarketConditions(),
    };

    try {
      const mlSignal = predictTrade(indicators, marketConditions);
      window.updateMLFeatureChart?.({
        rsi: mlSignal.features?.rsi || 0,
        macd: mlSignal.features?.macd || 0,
        volatility: mlSignal.features?.volatility || 0,
      });
      this.log(`ML Prediction: ${mlSignal.reason} (Confidence: ${(mlSignal.confidence * 100).toFixed(1)}%)`, 'info');
      return {
        shouldTrade: mlSignal.shouldTrade,
        tradeType: mlSignal.tradeType || 'CALL',
        confidence: mlSignal.confidence,
      };
    } catch (error) {
      this.log(`ML prediction error: ${error.message}`, 'error');
      return { shouldTrade: false, tradeType: 'CALL' };
    }
  }

  /**
   * Get Custom strategy signal based on user-defined rules
   * @returns {Object} Trading signal
   */
  getCustomSignal() {
    if (!this.config.customStrategyRules.length) {
      this.log('No custom strategy rules defined', 'warning');
      return { shouldTrade: false };
    }

    const indicators = this.indicatorManager.getIndicators();
    const conditionsMet = this.config.customStrategyRules.every((rule) => {
      switch (rule.indicator) {
        case 'rsi':
          return rule.operator === '>' ? indicators.rsi > rule.value : indicators.rsi < rule.value;
        case 'macd':
          return rule.operator === '>' ? indicators.macd.histogram > rule.value : indicators.macd.histogram < rule.value;
        case 'stochastic':
          return rule.operator === '>' ? indicators.stochastic.k > rule.value : indicators.stochastic.k < rule.value;
        case 'bollinger':
          return rule.operator === '>' ? this.currentPrice > indicators.bollingerBands.upper :
                 rule.operator === '<' ? this.currentPrice < indicators.bollingerBands.lower : false;
        case 'adx':
          return rule.operator === '>' ? indicators.adx > rule.value : indicators.adx < rule.value;
        default:
          return false;
      }
    });

    return {
      shouldTrade: conditionsMet,
      tradeType: conditionsMet ? (indicators.macd.histogram > 0 ? 'CALL' : 'PUT') : 'CALL',
    };
  }

  /**
   * Adjust stake size based on position sizing strategy
   */
  adjustStakeBasedOnStrategy() {
    if (this.lastTradeResult === null) {
      this.currentStake = parseFloat(this.initialStake.toFixed(1));
      return;
    }

    const indicators = this.indicatorManager.getIndicators();
    const drawdown = this.balance > 0 ? (this.totalPnL / this.balance) * 100 : 0;
    const volatilityFactor = indicators.volatility > 2.5 ? 0.5 : 1;
    const drawdownFactor = drawdown < -10 ? 0.75 : 1;

    switch (this.config.positionSizing) {
      case 'fixed':
        this.currentStake = this.balance * this.config.fixedFraction * volatilityFactor * drawdownFactor;
        break;
      case 'volatility':
        this.currentStake = this.initialStake / (1 + indicators.volatility / 100) * volatilityFactor * drawdownFactor;
        break;
      case 'kelly':
      default:
        this.currentStake = this.calculateOptimalStake() * volatilityFactor * drawdownFactor;
    }

    switch (this.config.strategy) {
      case 'martingale':
        this.currentStake = this.lastTradeResult === 'loss' ?
          parseFloat((this.currentStake * this.config.multiplier).toFixed(1)) :
          this.initialStake;
        break;
      case 'dalembert':
        this.currentStake = this.lastTradeResult === 'loss' ?
          parseFloat((this.currentStake + this.initialStake).toFixed(1)) :
          parseFloat(Math.max(this.initialStake, this.currentStake - this.initialStake).toFixed(1));
        break;
    }

    this.currentStake = parseFloat(Math.min(this.currentStake, this.balance * 0.1, 100).toFixed(1));
    this.currentStake = parseFloat(Math.max(this.currentStake, 0.35).toFixed(1));
    this.log(`Adjusted stake: $${this.currentStake}`, 'debug');
  }

  /**
   * Calculate optimal stake using Kelly Criterion
   * @returns {number} Optimal stake
   */
  calculateOptimalStake() {
    const winRate = this.wins / (this.wins + this.losses) || 0.5;
    const avgWin = this.historicalData
      .filter((trade) => trade.result === 'win')
      .reduce((sum, trade) => sum + trade.pnl, 0) / (this.wins || 1);
    const avgLoss = this.historicalData
      .filter((trade) => trade.result === 'loss')
      .reduce((sum, trade) => sum + trade.pnl, 0) / (this.losses || 1);
    const kellyFraction = winRate - ((1 - winRate) / (avgWin / Math.abs(avgLoss) || 1));
    return this.balance * Math.max(0, Math.min(kellyFraction, 0.1));
  }

  /**
   * Predict trade duration based on market conditions
   * @returns {number} Predicted duration in seconds
   */
  predictDuration() {
    const indicators = this.indicatorManager.getIndicators();
    const baseDuration = this.config.duration || 60;
    const volFactor = Math.max(0.5, Math.min(2, 1 / (indicators.volatility / 1)));
    const trendFactor = indicators.adx / 25;
    let predictedDuration = baseDuration * volFactor * trendFactor;
    predictedDuration = Math.round(predictedDuration / 5) * 5;
    return Math.max(5, Math.min(600, predictedDuration));
  }

  /**
   * Execute a trade with specified parameters
   * @param {string} tradeType - Type of trade (CALL/PUT)
   * @param {string} symbol - Market symbol
   */
  async executeTrade(tradeType, symbol) {
    if (!this.isConnected || !this.isTrading || !this.shouldExecuteTrade() || this.isPaused) {
      this.log(`Cannot execute trade: connected=${this.isConnected}, trading=${this.isTrading}, paused=${this.isPaused}`, 'warning');
      return;
    }

    this.adjustStakeBasedOnStrategy();
    const predictedDuration = this.predictDuration();

    const proposalRequest = {
      proposal: 1,
      amount: this.currentStake,
      basis: 'stake',
      contract_type: tradeType,
      currency: 'USD',
      symbol: symbol || this.config.symbol,
      duration: predictedDuration,
      duration_unit: 's',
      req_id: this.generateReqId(),
    };

    this.sendMessage(proposalRequest);
    this.lastTradeTime = Date.now();
    this.log(`Proposal requested: ${tradeType} ${symbol || this.config.symbol} - $${this.currentStake} for ${predictedDuration}s`, 'info');
  }

  /**
   * Check if trade execution is allowed based on risk management
   * @returns {boolean} Whether trade should be executed
   */
  shouldExecuteTrade() {
    if (this.checkMarketConditions()) {
      this.adaptiveCooldown();
      return false;
    }

    if (this.totalTrades >= this.config.maxTrades) {
      this.log('Maximum trades reached for this session', 'warning');
      this.stopTrading();
      return false;
    }

    if (this.config.stopLossEnabled && this.totalPnL <= -this.config.maxLoss) {
      this.log('Stop loss triggered', 'warning');
      this.stopTrading();
      return false;
    }

    if (this.config.takeProfitEnabled && this.totalPnL >= this.config.maxProfit) {
      this.log('Take profit triggered', 'success');
      this.stopTrading();
      return false;
    }

    if (this.currentStake > this.balance) {
      this.log('Insufficient balance for trade', 'error');
      this.stopTrading();
      return false;
    }

    const drawdown = this.balance > 0 ? (this.totalPnL / this.balance) * 100 : 0;
    if (drawdown <= -this.config.maxDrawdown) {
      this.log('Maximum drawdown reached', 'warning');
      this.adaptiveCooldown();
      return false;
    }

    if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      this.log('Maximum consecutive losses reached', 'warning');
      this.adaptiveCooldown();
      return false;
    }

    const indicators = this.indicatorManager.getIndicators();
    const bandWidth = (indicators.bollingerBands.upper - indicators.bollingerBands.lower) / indicators.bollingerBands.middle * 100;
    if (bandWidth > 10) {
      this.log('Trading paused due to wide Bollinger Bands', 'warning');
      this.adaptiveCooldown();
      return false;
    }

    return true;
  }

  /**
   * Adaptive cooldown logic based on market conditions
   */
  adaptiveCooldown() {
    if (this.pauseExtensions >= this.maxPauseExtensions) {
      this.log('Maximum pause extensions reached; resuming trading', 'info');
      this.isPaused = false;
      this.consecutiveLosses = 0;
      this.pauseExtensions = 0;
      return;
    }

    const indicators = this.indicatorManager.getIndicators();
    const currentTrend = this.detectMarketTrend();
    const isUnfavorable = currentTrend === 'sideways' || indicators.volatility > 2.5 || indicators.adx > 25;

    if (isUnfavorable) {
      this.isPaused = true;
      this.pauseExtensions++;
      this.log('Paused due to unfavorable conditions', 'warning');
      setTimeout(() => {
        if (
          this.isTrading &&
          !this.checkMarketConditions() &&
          this.detectMarketTrend() !== 'sideways' &&
          this.indicatorManager.getIndicators().volatility <= 2.5 &&
          this.indicatorManager.getIndicators().adx <= 25
        ) {
          this.isPaused = false;
          this.consecutiveLosses = 0;
          this.pauseExtensions = 0;
          this.log('Resuming after adaptive cooldown', 'info');
        } else {
          this.log('Extending cooldown due to persistent unfavorable conditions', 'warning');
          this.adaptiveCooldown();
        }
      }, this.config.cooldownPeriod);
    }
  }

  /**
   * Check for dynamic exit conditions
   * @param {Object} contract - Contract update data
   * @returns {boolean} Whether to exit early
   */
  checkDynamicExit(contract) {
    if (!contract.profit || !contract.current_spot) return false;

    const indicators = this.indicatorManager.getIndicators();
    const profitRatio = contract.profit / this.currentStake;
    const isReversing = (contract.current_spot > indicators.bollingerBands.upper && indicators.macd.histogram < 0) ||
                        (contract.current_spot < indicators.bollingerBands.lower && indicators.macd.histogram > 0);

    if (profitRatio > this.config.trailingProfitThreshold && isReversing) {
      this.log(`Triggering early exit to lock profit: $${contract.profit.toFixed(2)}`, 'info');
      this.sendMessage({ sell: contract.contract_id, price: contract.current_spot, req_id: this.generateReqId() });
      return true;
    }
    return false;
  }

  /**
   * Handle trade proposal response
   * @param {Object} proposal - Proposal data from API
   */
  handleProposal(proposal) {
    if (proposal.id) {
      this.sendMessage({
        buy: proposal.id,
        price: this.currentStake,
        req_id: this.generateReqId(),
      });
      this.log(`Buying contract: ${proposal.display_name} - $${this.currentStake}`, 'info');
    }
  }

  /**
   * Handle contract purchase response
   * @param {Object} buy - Buy response from API
   */
  handleBuy(buy) {
    if (buy.contract_id) {
      this.activeContract = {
        id: buy.contract_id,
        stake: this.currentStake,
        type: buy.shortcode,
        buyPrice: buy.buy_price,
        startTime: new Date(),
        symbol: buy.symbol,
      };

      window.notifyContractPurchase?.({
        symbol: buy.symbol,
        contractType: buy.shortcode.includes('CALL') ? 'CALL' : 'PUT',
        contractId: buy.contract_id,
        buyPrice: buy.buy_price,
        expectedPayout: buy.payout || 0,
        duration: `${this.predictDuration()}s`,
        entrySpot: this.currentPrice,
        barrier: buy.barrier || 0,
      });

      this.sendMessage({
        proposal_open_contract: 1,
        contract_id: buy.contract_id,
        subscribe: 1,
        req_id: this.generateReqId(),
      });

      this.log(`Contract purchased: ${buy.contract_id} - $${buy.buy_price}`, 'success');
    }
  }

  /**
   * Handle contract status updates
   * @param {Object} contract - Contract update data
   */
  handleContractUpdate(contract) {
    if (!this.activeContract) return;

    if (this.config.takeProfitEnabled && this.checkDynamicExit(contract)) {
      return;
    }

    const isWin = contract.is_sold && parseFloat(contract.sell_price) > parseFloat(contract.buy_price);
    const pnl = contract.is_sold ? parseFloat(contract.sell_price) - parseFloat(contract.buy_price) : 0;

    if (contract.is_sold) {
      this.totalTrades++;
      this.totalPnL += pnl;

      if (isWin) {
        this.wins++;
        this.currentStreak = this.currentStreak > 0 ? this.currentStreak + 1 : 1;
        this.lastTradeResult = 'win';
        this.consecutiveLosses = 0;
        this.log(`Trade WON: +$${pnl.toFixed(2)}`, 'success');
      } else {
        this.losses++;
        this.currentStreak = this.currentStreak < 0 ? this.currentStreak - 1 : -1;
        this.lastTradeResult = 'loss';
        this.consecutiveLosses++;
        this.log(`Trade LOST: -$${Math.abs(pnl).toFixed(2)}`, 'error');
        this.adaptiveCooldown();
      }

      const indicators = this.indicatorManager.getIndicators();
      const tradeData = {
        id: `trade_${Date.now()}`,
        symbol: this.activeContract.symbol,
        result: this.lastTradeResult,
        pnl: parseFloat(pnl.toFixed(2)),
        stake: this.currentStake,
        contractType: this.activeContract.type.includes('CALL') ? 'CALL' : 'PUT',
        duration: this.predictDuration(),
        indicators: {
          rsi: indicators.rsi,
          macd: indicators.macd.histogram,
          volatility: indicators.volatility,
          movingAverage: indicators.movingAverage,
          bollingerPosition: this.currentPrice > indicators.bollingerBands.upper ? 'above' :
                            this.currentPrice < indicators.bollingerBands.lower ? 'below' : 'middle',
          adx: indicators.adx,
          sentiment: indicators.sentiment,
        },
        marketConditions: {
          trend: this.detectMarketTrend(),
          volatilitySpike: this.detectVolatilitySpike(),
          newsEvent: this.checkMarketConditions(),
          candlePattern: this.candleManager.detectPattern(this.activeContract.symbol),
        },
        timestamp: new Date().toISOString(),
      };
      saveData('trades', tradeData);

      this.updateStrategyStats(this.config.strategy, this.lastTradeResult);
      this.historicalData.push({
        result: this.lastTradeResult,
        pnl,
        symbol: this.activeContract.symbol,
        timestamp: new Date(),
        price: this.currentPrice,
      });

      this.activeContract = null;
      this.requestBalance();
      this.updateUI();
    }
  }

  /**
   * Update strategy performance statistics
   * @param {string} strategy - Strategy name
   * @param {string} result - Trade result (win/loss)
   */
  updateStrategyStats(strategy, result) {
    if (!this.strategyStats[strategy]) {
      this.strategyStats[strategy] = { wins: 0, losses: 0, totalPnL: 0 };
    }
    this.strategyStats[strategy][result === 'win' ? 'wins' : 'losses']++;
    this.strategyStats[strategy].totalPnL += this.totalPnL;
  }

  /**
   * Select best strategy based on performance
   * @returns {string} Best strategy
   */
  selectBestStrategy() {
    if (!this.config.useDynamicSwitching) return this.config.strategy;
    let bestStrategy = this.config.strategy;
    let bestWinRate = 0;

    Object.entries(this.strategyStats).forEach(([strategy, stats]) => {
      const total = stats.wins + stats.losses;
      const winRate = total > 0 ? stats.wins / total : 0;
      if (winRate > bestWinRate && total >= 10) {
        bestWinRate = winRate;
        bestStrategy = strategy;
      }
    });

    return bestStrategy;
  }

  /**
   * Detect market trend
   * @returns {string} Trend direction (uptrend/downtrend/sideways)
   */
  detectMarketTrend() {
    const candles = this.candleManager.getCandles(this.config.symbol);
    if (candles.length < 20) return 'sideways';
    const prices = candles.slice(-20).map((c) => c.close);
    const maShort = this.indicatorManager.calculateMA(prices, 5);
    const maLong = this.indicatorManager.calculateMA(prices, 20);
    return maShort > maLong ? 'uptrend' : maShort < maLong ? 'downtrend' : 'sideways';
  }

  /**
   * Detect volatility spike
   * @returns {boolean} Whether a volatility spike is detected
   */
  detectVolatilitySpike() {
    const indicators = this.indicatorManager.getIndicators();
    return indicators.volatility > 3;
  }

  /**
   * Check market conditions (e.g., news events)
   * @returns {boolean} Whether adverse conditions exist
   */
  checkMarketConditions() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    return this.newsEvents.some((event) => {
      const eventStart = event.hour * 60 + event.minute;
      const eventEnd = eventStart + event.duration;
      const currentTime = currentHour * 60 + currentMinute;
      return currentTime >= eventStart && currentTime <= eventEnd;
    });
  }

  /**
   * Start trading
   */
  startTrading() {
    if (!this.isConnected) {
      this.log('Cannot start trading: Not connected to WebSocket', 'error');
      return;
    }
    this.isTrading = true;
    this.isPaused = false;
    this.log('Trading started', 'success');
    this.updateUI();
  }

  /**
   * Stop trading
   */
  stopTrading() {
    this.isTrading = false;
    this.isPaused = false;
    this.tradeQueue = [];
    this.log('Trading stopped', 'info');
    this.updateUI();
  }

  /**
   * Reset trading statistics
   */
  resetStats() {
    this.totalTrades = 0;
    this.wins = 0;
    this.losses = 0;
    this.currentStreak = 0;
    this.totalPnL = 0;
    this.currentStake = this.initialStake;
    this.consecutiveLosses = 0;
    this.lastTradeResult = null;
    this.strategyStats = {};
    this.historicalData = [];
    this.log('Statistics reset', 'info');
    this.updateUI();
  }

  /**
   * Clear log display
   */
  clearLog() {
    window.clearLogDisplay?.();
    this.log('Log cleared', 'info');
  }

  /**
   * Update UI elements
   */
  updateUI() {
    window.updateUI?.({
      balance: this.balance.toFixed(2),
      totalTrades: this.totalTrades,
      wins: this.wins,
      losses: this.losses,
      currentStreak: this.currentStreak,
      totalPnL: this.totalPnL.toFixed(2),
      currentStake: this.currentStake.toFixed(2),
      isTrading: this.isTrading,
      isConnected: this.isConnected,
      indicators: this.indicatorManager.getIndicators(),
      correlations: Object.fromEntries(this.indicatorManager.getCorrelations()),
      strategyStats: this.strategyStats,
    });
  }

  /**
   * Update connection status in UI
   * @param {string} status - Connection status
   * @param {boolean} isConnected - Whether connected
   */
  updateConnectionStatus(status, isConnected) {
    this.isConnected = isConnected;
    window.updateConnectionStatus?.(status, isConnected);
    this.updateUI();
  }

  /**
   * Run backtest on historical data
   */
  runBacktest() {
    const trades = loadData('trades', 100) || [];
    if (trades.length < 50) {
      this.log('Insufficient historical data for backtesting', 'error');
      return;
    }

    let simulatedPnL = 0;
    let simulatedTrades = 0;
    let simulatedWins = 0;
    const backtestStats = { wins: 0, losses: 0, totalPnL: 0 };

    trades.forEach((trade, i) => {
      if (i < 26) return; // Skip initial trades for indicator warm-up
      this.candleManager.addHistoricalTick(this.config.symbol, {
        price: trade.price || this.currentPrice,
        time: new Date(trade.timestamp),
        volume: this.estimateVolume(trade.price || this.currentPrice),
      });

      const candles = this.candleManager.getCandles(this.config.symbol);
      if (candles.length >= 14) {
        this.indicatorManager.updateIndicators(candles);
        const signal = this.getTradeSignal(this.config.symbol);
        if (signal.shouldTrade) {
          simulatedTrades++;
          const indicators = this.indicatorManager.getIndicators();
          const slippage = indicators.volatility * 0.01;
          const fee = this.currentStake * 0.01;
          const simulatedStake = parseFloat(this.calculateOptimalStake().toFixed(1));

          // Simulate trade outcome based on historical data
          const outcome = trade.result;
          const simulatedPnl = outcome === 'win' ? simulatedStake * (0.85 - fee - slippage) : -simulatedStake;

          simulatedPnL += simulatedPnl;
          if (outcome === 'win') {
            simulatedWins++;
            backtestStats.wins++;
          } else {
            backtestStats.losses++;
          }
          backtestStats.totalPnL += simulatedPnl;

          const tradeData = {
            id: `backtest_${Date.now()}_${i}`,
            symbol: this.config.symbol,
            result: outcome,
            pnl: parseFloat(simulatedPnl.toFixed(2)),
            stake: simulatedStake,
            contractType: signal.tradeType,
            duration: this.predictDuration(),
            indicators: {
              rsi: indicators.rsi,
              macd: indicators.macd.histogram,
              volatility: indicators.volatility,
            },
            timestamp: new Date().toISOString(),
          };
          saveData('backtest_trades', tradeData);
        }
      }
    });

    const winRate = simulatedTrades > 0 ? (simulatedWins / simulatedTrades) * 100 : 0;
    this.log(`Backtest completed: ${simulatedTrades} trades, ${simulatedWins} wins, ${winRate.toFixed(1)}% win rate, Total PnL: $${simulatedPnL.toFixed(2)}`, 'info');
    window.updateBacktestResults?.({
      totalTrades: simulatedTrades,
      wins: simulatedWins,
      losses: simulatedTrades - simulatedWins,
      winRate: winRate.toFixed(1),
      totalPnL: simulatedPnL.toFixed(2),
      stats: backtestStats,
    });
  }
}

// Instantiate and expose bot globally
window.derivBot = new AdvancedDerivBot();
