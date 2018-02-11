'use strict';

const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const { extractTimestamp, formatDate, makeRelativePathsAbsolute } = require('./utils.js');
const decodeOpus = require('./decodeOpus.js').decodeOpus;
const processFragments = require('./processFragments.js').processFragments;

const configPath = path.join(__dirname, '..', 'config.json');

function formatChoice(podcast) {
	const timestamp = extractTimestamp(podcast);
	return `${podcast} (${formatDate(new Date(timestamp))})`;
}

function cleanPodcastChoice(choice) {
	return choice.split(' ')[0];
}

async function processDirectory(directory) {
	console.log(`Started processing ${directory}`);
	console.log(`Started decoding opus strings`);
	await decodeOpus(directory);
	console.log(`Finished decoding opus strings`);
	console.log(`Started reassembling raw PCM fragments`);
	await processFragments(directory);
	console.log(`Finished reassembling raw PCM fragments`);
	console.log(`Finished processing ${directory}`);
}

async function getPodcastList(podcastPath) {
	try {
		const podcasts = await fs.readdir(podcastPath);
		return podcasts.sort((podcast1, podcast2) => {
			return extractTimestamp(podcast1) < extractTimestamp(podcast2);
		});
	} catch (err) {
		return [];
	}
}

async function getPodcastPath() {
	try {
		const config = await fs.readJson(configPath);
		makeRelativePathsAbsolute(config);
		return config.podbot.podcastPath;
	} catch (err) {
		// Don't care about err, it just means there isn't a valid config file available
		return path.join(__dirname, '..', 'podcasts');
	}
}

async function promptUser() {
	const questions = [];
	const podcastPath = await getPodcastPath();
	const podcasts = await getPodcastList(podcastPath);
	if (podcasts.length) {
		questions.push({
			type: 'list',
			name: 'podcast',
			message: 'Please select podcast to process:',
			choices: podcasts.map(formatChoice),
			transformer: cleanPodcastChoice
		});
		const answers = await inquirer.prompt(questions);
		await processDirectory(path.join(podcastPath, cleanPodcastChoice(answers['podcast'])));
	} else {
		questions.push({
			type: 'input',
			name: 'podcastPath',
			message: 'Please input the path to the podcast to process:'
		});
		const answers = await inquirer.prompt(questions);
		await processDirectory(answers['podcastPath']);
	}
}

const relevantArguments = process.argv.slice(2);
if (relevantArguments.length > 0) {
	processDirectory(relevantArguments[0]).catch(console.error);
} else {
	promptUser().catch(console.error);
}
