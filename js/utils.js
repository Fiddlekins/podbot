'use strict';

const path = require('path');

function extractUserId(name) {
  return name.split('-')[0];
}

function extractTimestamp(name) {
  return parseInt(name.split('-')[1], 10);
}

function convertDurationToSamples(duration, frequency) {
  let samples = frequency * duration / 1000;
  let wholeSamples = Math.floor(samples);
  return { samples: wholeSamples, remainder: samples - wholeSamples };
}

function formatDate(date) {
  return date.toLocaleString();
}

function makeRelativePathsAbsolute(config) {
  config.podbot.podcastPath = path.join(__dirname, '..', config.podbot.podcastPath);
}

module.exports = {
  extractUserId,
  extractTimestamp,
  convertDurationToSamples,
  formatDate,
  makeRelativePathsAbsolute
};
