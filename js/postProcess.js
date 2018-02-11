'use strict';

const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const { extractTimestamp, formatDate } = require('./utils.js');
const decodeOpus = require('./decodeOpus.js').decodeOpus;
const processFragments = require('./processFragments.js').processFragments;

function formatChoice(podcast) {
	const timestamp = extractTimestamp(podcast);
	return `${podcast} (${formatDate(new Date(timestamp))})`;
}

function cleanPodcastChoice(choice) {
	return choice.split(' ')[0];
}

async function processDirectory(directory) {
	console.log(`Starting to process ${directory}`);
	await decodeOpus(directory);
	await processFragments(directory);
	console.log(`Finished processing ${directory}`);
}

async function promptUser() {
	const questions = [];
	const podcastPath = path.join(__dirname, '..', 'podcasts');
	const podcasts = await fs.readdir(podcastPath);
	questions.push({
		type: 'list',
		name: 'podcast',
		message: 'Please select podcast to process:',
		choices: podcasts.map(formatChoice).reverse(),
		transformer: cleanPodcastChoice
	});
	const answers = await inquirer.prompt(questions);
	await processDirectory(path.join(podcastPath, cleanPodcastChoice(answers['podcast'])));
}

const relevantArguments = process.argv.slice(2);
if (relevantArguments.length > 0) {
	processDirectory(relevantArguments[0]).catch(console.error);
} else {
	promptUser().catch(console.error);
}
