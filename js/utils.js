'use strict';

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

module.exports = {
	extractUserId,
	extractTimestamp,
	convertDurationToSamples,
	formatDate
};
