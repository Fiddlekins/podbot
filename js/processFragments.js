'use strict';

const fs = require('fs-extra');
const path = require('path');
const child_process = require('child_process');
const { extractUserId, extractTimestamp, convertDurationToSamples } = require('./utils.js');
const outputFormats = require('./outputFormats.js');

const RATE = 48000;
const INPUT_EXTENSION = '.raw_pcm';

function getOutputCommand(outputPath, outputFormat) {
  switch (outputFormat) {
    case outputFormats.PCM:
      return `-f s16le -ar 48k -ac 2 ${outputPath}`;
    case outputFormats.WAV:
      return `${outputPath}.wav`;
    case outputFormats.MP3:
      return `${outputPath}.mp3`;
    default:
      throw new Error(`Invalid output format specified: ${outputFormat}`);
  }
}

async function reassemble(config, outputFormat) {
  let outputPath = path.join(config.id);
  let inputCommandArray = [];
  let filterPadCommandArray = [];
  let filterMergeCommandArray = [];
  let inputCommand = '';
  let filterCommand = '';
  let command = '';
  let newCommand = '';

  let commands = [];
  let temporaryOutputPath = `${config.id}-tmp-${commands.length}`;
  let subConfig = {
    id: config.id,
    fragments: []
  };

  for (let fragmentIndex = 0, inputIndex = 0; fragmentIndex < config.fragments.length; fragmentIndex++) {
    let fragment = config.fragments[fragmentIndex];
    inputCommandArray[fragmentIndex] = `-f s16le -ar 48k -ac 2 -i ${fragment.name}`;

    let filterCommands = [];
    if (fragment.totalSampleLength) {
      filterCommands.push(`apad=whole_len=${fragment.totalSampleLength}`);
    }
    if (fragment.delay) {
      filterCommands.push(`adelay=${fragment.delay}|${fragment.delay}`);
    }
    if (filterCommands.length) {
      filterPadCommandArray.push(`[${inputIndex}]${filterCommands.join(',')}[l${inputIndex}]`);
    }
    filterMergeCommandArray[inputIndex] = `[${filterCommands.length ? 'l' : ''}${inputIndex}]`;

    inputCommand = inputCommandArray.join(' ');
    filterCommand = `${filterPadCommandArray.join('; ')}${filterPadCommandArray.length ? '; ' : ''}${filterMergeCommandArray.join('')}concat=n=${inputIndex + 1}:v=0:a=1[a]`;

    newCommand = `ffmpeg -y ${inputCommand} -filter_complex "${filterCommand}" -map "[a]" -f s16le -ar 48k -ac 2 ${temporaryOutputPath}`;
    if (newCommand.length > 8000) {
      commands.push(command);
      subConfig.fragments.push({ name: temporaryOutputPath });
      temporaryOutputPath = `${config.id}-tmp-${commands.length}`;
      inputCommandArray.length = 0;
      filterPadCommandArray.length = 0;
      filterMergeCommandArray.length = 0;
      fragmentIndex--;
      inputIndex = 0;
    } else {
      command = newCommand;
      inputIndex++;
    }
  }

  if (commands.length) {
    commands.push(command);
    subConfig.fragments.push({ name: temporaryOutputPath });
    await Promise.all(commands.map(command => doCommand(command)));
    await reassemble(subConfig, outputFormat);
  } else {
    command = `ffmpeg -y ${inputCommand} -filter_complex "${filterCommand}" -map "[a]" ${getOutputCommand(outputPath, outputFormat)}`;
    await doCommand(command);
  }
}

function doCommand(command) {
  console.log(command);
  return new Promise((resolve, reject) => {
    let child = child_process.spawn(command, { shell: true });
    let string = '';
    child.stderr.on('data', (data) => {
      string += data
    });
    child.on('close', (code) => {
      console.log(code);
      if (code !== 0) {
        console.log(string);
      }
      resolve(code);
    });
    child.on('error', (err) => {
      console.log(err);
      reject(err);
    });
  });
}

async function assembleUsers(inputDirectory, outputFormat) {
  const users = {};
  const podcastTimestamp = extractTimestamp(inputDirectory.split(path.sep).pop());

  const files = await fs.readdir(inputDirectory);
  for (const file of files) {
    let ext = path.extname(file);
    if (ext === INPUT_EXTENSION) {
      let filename = path.basename(file, ext);
      let userId = extractUserId(filename);
      let timestamp = extractTimestamp(filename);
      users[userId] = users[userId] || {
        id: userId,
        fragments: []
      };
      users[userId].fragments.push({
        name: file,
        timestamp: timestamp,
        offset: timestamp - podcastTimestamp
      });
    }
  }

  process.chdir(inputDirectory);

  for (const user of Object.values(users)) {
    user.fragmentCount = user.fragments.length;
    // Make sure we've got the fragments in chronological order
    user.fragments.sort((a, b) => {
      return a.offset - b.offset;
    });
    // Set the delay for the first fragment
    user.fragments[0].delay = user.fragments[0].offset;

    // Track the fractions of samples that cannot immediately be added
    let leftOvers = 0;
    // Calculate the total sample count for each fragment in preparation for padding them with silence until they meet that total
    // For samples that have both a pad and a delay applied the delay must come second because the following doesn't account for it
    for (let fragmentIndex = 0; fragmentIndex < user.fragments.length - 1; fragmentIndex++) {
      let fragment = user.fragments[fragmentIndex];
      let nextFragment = user.fragments[fragmentIndex + 1];
      let { samples, remainder } = convertDurationToSamples(nextFragment.offset - fragment.offset, RATE);
      // Top up the leftover samples with the remainder
      leftOvers += remainder;
      // See if we've enough for a full sample yet
      let usableLeftOvers = Math.floor(leftOvers);
      // Adjust leftovers and current sample count accordingly to try and ensure we don't lose any time
      leftOvers -= usableLeftOvers;
      samples += usableLeftOvers;
      fragment.totalSampleLength = samples;
    }

    await reassemble(user, outputFormat);
    const files = await fs.readdir('.');
    var audios = [];
    for (const file of files) {
      let ext = path.extname(file);
      if (ext === `.${outputFormat}`) {
        audios.push(`${inputDirectory}/${file}`);
      }
    }
      console.log('audios=', audios);
    return audios;
  }
}

module.exports = {
  processFragments: assembleUsers
};
