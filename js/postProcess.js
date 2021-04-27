'use strict';

const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const { extractTimestamp, formatDate, makeRelativePathsAbsolute } = require('./utils.js');
const processFragments = require('./processFragments.js').processFragments;
const outputFormats = require('./outputFormats.js');

const configPath = path.join(__dirname, '..', 'config.json');
const ALL_PODCASTS = 'All available podcasts';

function formatChoice(podcast) {
  const timestamp = extractTimestamp(podcast);
  return `${podcast} (${formatDate(new Date(timestamp))})`;
}

function cleanPodcastChoice(choice) {
  return choice.split(' ')[0];
}

async function processDirectory(directory, outputFormat) {
  console.log(`Started reassembling raw PCM fragments`);
  const audios = await processFragments(directory, outputFormat);
  console.log(`Finished reassembling raw PCM fragments`);
  console.log(`Finished processing ${directory}`);
  return audios;
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

async function getConfig() {
  try {
    const config = await fs.readJson(configPath);
    makeRelativePathsAbsolute(config);
    return config;
  } catch (err) {
    // Don't care about err, it just means there isn't a valid config file available
    // Return a bunch of defaults instead
    return {
      podbot: {
        podcastPath: path.join(__dirname, '..', 'podcasts')
      }
    };
  }
}

async function promptUserForPodcastDirectory(config) {
  const questions = [];
  const podcastPath = config.podbot.podcastPath;
  const podcasts = await getPodcastList(podcastPath);
  const choices = podcasts.map(formatChoice);
  choices.unshift(ALL_PODCASTS);
  if (podcasts.length) {
    questions.push({
      type: 'list',
      name: 'podcast',
      message: 'Please select podcast to process:',
      choices: choices,
      transformer: cleanPodcastChoice
    });
    const answers = await inquirer.prompt(questions);
    if (answers['podcast'] === ALL_PODCASTS) {
      return podcasts.map(podcast => path.join(podcastPath, podcast));
    }
    return path.join(podcastPath, cleanPodcastChoice(answers['podcast']));
  } else {
    questions.push({
      type: 'input',
      name: 'podcastPath',
      message: 'Please input the path to the podcast to process:'
    });
    const answers = await inquirer.prompt(questions);
    return answers['podcastPath'];
  }
}

async function promptUserForOutputFormat() {
  const questions = [];
  questions.push({
    type: 'list',
    name: 'outputFormat',
    message: 'Please select output format:',
    choices: Object.values(outputFormats).filter(format => format !== outputFormats.CHOOSE),
    default: outputFormats.WAV
  });
  const answers = await inquirer.prompt(questions);
  return answers['outputFormat'];
}

async function init() {
  let [podcastDirectory, outputFormat] = process.argv.slice(2);
  let podcastDirectories;
  let config = null;
  if (!podcastDirectory) {
    config = config || await getConfig();
    podcastDirectory = await promptUserForPodcastDirectory(config);
    if (Array.isArray(podcastDirectory)) {
      podcastDirectories = podcastDirectory;
    }
  }
  if (!outputFormat) {
    config = config || await getConfig();
    outputFormat = config && config.postProcess && config.postProcess.format;
    if (!outputFormat || outputFormat === outputFormats.CHOOSE) {
      outputFormat = await promptUserForOutputFormat();
    }
  }
  if (podcastDirectories) {
    for (const podcastDirectory of podcastDirectories) {
      await processDirectory(podcastDirectory, outputFormat);
    }
  } else {
    await processDirectory(podcastDirectory, outputFormat);
  }
}

init().catch(console.error);

module.exports = {
  processDirectory: processDirectory
};
