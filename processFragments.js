'use strict';

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const frequency = 48000;

// Define functions

let extractUserId = (name) => {
	return name.split('-')[0];
};

let extractTimestamp = (name) => {
	return parseInt(name.split('-')[1], 10);
};

let parseTimeIntoMilliseconds = (timeString) => {
	let intsDec = timeString.split('.');
	let ints = intsDec[0].split(':').map((num) => {
		return parseInt(num, 10);
	}).reverse();

	// Multiply days into hours
	for (let i = 3; i < ints.length; i++) {
		ints[i] *= 24;
	}

	// Multiply hours into minutes
	for (let i = 2; i < ints.length; i++) {
		ints[i] *= 60;
	}

	// Multiply minutes into seconds
	for (let i = 1; i < ints.length; i++) {
		ints[i] *= 60;
	}

	// Multiply seconds into milliseconds
	for (let i = 0; i < ints.length; i++) {
		ints[i] *= 1000;
	}

	let int = ints.reduce((a, b) => {
		return a + b;
	}, 0);

	let dec = 0;
	if (intsDec[1]) {
		dec = parseFloat(`0.${intsDec[1]}`) * 1000;
	}

	return int + dec;
};

let convertDurationToSamples = (duration) => {
	let samples = frequency * duration / 1000;
	let wholeSamples = Math.floor(samples);
	return { samples: wholeSamples, remainder: samples - wholeSamples };
};

let reassemble = (config) => {
	return new Promise((resolve, reject) => {
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
			console.log(commands.length);

			Promise.all(commands.map(command => {
				return doCommand(command);
			})).then(() => {
				reassemble(subConfig).then((code) => {
					resolve(code);
				}).catch(reject);
			}).catch(reject);
		} else {
			command = `ffmpeg -y ${inputCommand} -filter_complex "${filterCommand}" -map "[a]" -f s16le -ar 48k -ac 2 ${outputPath}`;
			console.log(command);
			doCommand(command).then(resolve).catch(reject);
		}
	});
};

let doCommand = (command) => {
	return new Promise((resolve, reject) => {
		console.log('new command');
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
};

let assembleUsers = (inputDirectory) => {
	fs.readdir(inputDirectory, async(err, files) => {
		files.forEach((file) => {
			let ext = path.extname(file);
			if (ext === '.raw_pcm') {
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
		});

		process.chdir(inputDirectory);

		for (let userId in users) {
			if (users.hasOwnProperty(userId)) {
				let user = users[userId];
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
					let { samples, remainder } = convertDurationToSamples(nextFragment.offset - fragment.offset);
					// Top up the leftover samples with the remainder
					leftOvers += remainder;
					// See if we've enough for a full sample yet
					let usableLeftOvers = Math.floor(leftOvers);
					// Adjust leftovers and current sample count accordingly to try and ensure we don't lose any time
					leftOvers -= usableLeftOvers;
					samples += usableLeftOvers;
					fragment.totalSampleLength = samples;
				}

				await reassemble(user).catch(console.error);
			}
		}
	});
};

// And then do the rest

let inputDirectory = path.join('podcasts', process.argv[2]);
let podcastName = inputDirectory.split(path.sep);
podcastName = podcastName[podcastName.length - 1];
let podcastTimestamp = extractTimestamp(podcastName);

// Define global users object
let users = {};
let temporaryFiles = {};

assembleUsers(inputDirectory);
