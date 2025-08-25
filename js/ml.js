// ml.js - ML training and inference using TensorFlow.js

import * as tf from '@tensorflow/tfjs';

/**
 * Train a simple neural network model for binary classification (buy/sell)
 * @param {Array} features - 2D array of features [samples, features]
 * @param {Array} labels - 2D array of labels [samples, 1]
 * @returns {Promise<tf.Sequential>} Trained model
 */
export async function trainModel(features, labels) {
  const xs = tf.tensor2d(features);
  const ys = tf.tensor2d(labels);

  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 8, inputShape: [4], activation: 'relu' })); // 4 features: RSI, MACD, volatility, ADX
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' })); // Binary output

  model.compile({
    optimizer: 'adam',
    loss: 'binaryCrossentropy',
    metrics: ['accuracy']
  });

  await model.fit(xs, ys, {
    epochs: 50,
    verbose: 0 // Silent training
  });

  return model;
}

/**
 * Make prediction using trained model
 * @param {tf.Sequential} model - Trained model
 * @param {Array} newFeatures - 1D array of new features [RSI, MACD, volatility, ADX]
 * @returns {Object} Prediction { prediction: 'bullish'|'bearish', confidence: number }
 */
export function predict(model, newFeatures) {
  const input = tf.tensor2d([newFeatures]);
  const output = model.predict(input);
  const prob = output.dataSync()[0];
  return {
    prediction: prob > 0.5 ? 'bullish' : 'bearish',
    confidence: prob > 0.5 ? prob : 1 - prob
  };
}