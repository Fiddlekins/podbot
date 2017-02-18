'use strict';

const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;

const frequency = 24000;

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
	return Math.ceil(frequency * duration / 1000);
};

let addDelay = (inputPath, outputPath, delay) => {
	return new Promise((resolve, reject) => {
		let command = `ffmpeg -f s32le -ar 24k -ac 2 -i ${inputPath} -af "adelay=${delay}|${delay}" -f s32le -acodec pcm_s32le ${outputPath}`;
		exec(command, {}, (err, stdout, stderr) => {
			if (err) {
				reject(err);
			}
			resolve(stdout, stderr);
		});
	});
};

let addPad = (inputPath, outputPath, samples) => {
	return new Promise((resolve, reject) => {
		let command = `ffmpeg -f s32le -ar 24k -ac 2 -i ${inputPath} -y -af apad=whole_len=${samples} -f s32le -acodec pcm_s32le ${outputPath}`;
		exec(command, {}, (err, stdout, stderr) => {
			if (err) {
				reject(err);
			}
			resolve(stdout, stderr);
		});
	});
};

let getDuration = (inputPath) => {
	return new Promise((resolve, reject) => {
		let command = `ffmpeg -f s32le -ar 24k -ac 2 -i ${inputPath} -f null -`;
		exec(command, {}, (err, stdout, stderr) => {
			if (err) {
				reject(err);
			}
			let match = stderr.match(/time=([0-9:.]+)/);
			let duration = parseTimeIntoMilliseconds(match[1]);

			resolve(duration, stdout, stderr);
		});
	});
};

let merge = (inputPathArray, outputPath) => {
	return new Promise((resolve, reject) => {
		let inputCommand = '';
		let filterInputCommand = '';
		let i = 0;
		for (let inputPath of inputPathArray) {
			inputCommand += `-f s32le -ar 24k -ac 2 -i ${inputPath} `;
			filterInputCommand += `[${i}:a]`;
			i++;
		}
		let inputCount = inputPathArray.length;

		let command = `ffmpeg ${inputCommand}-filter_complex "${filterInputCommand}amerge=inputs=${inputCount}[aout]" -map "[aout]" -ac 2 -f s32le -acodec pcm_s32le ${outputPath}`;
		exec(command, {}, (err, stdout, stderr) => {
			if (err) {
				reject(err);
			}
			resolve(stdout, stderr);
		});
	});
};

let concat = (inputPathArray, outputPath) => {
	return new Promise((resolve, reject) => {
		let inputCommand = '';
		for (let inputPath of inputPathArray) {
			inputCommand += `-f s32le -ar 24k -ac 2 -i ${inputPath} `;
		}

		let command = `ffmpeg ${inputCommand}-y -filter_complex "[0:0] [1:0] concat=n=2:v=0:a=1 [a0]" -map "[a0]" -ac 2 -f s32le -acodec pcm_s32le ${outputPath}`;
		exec(command, {}, (err, stdout, stderr) => {
			if (err) {
				reject(err);
			}
			resolve(stdout, stderr);
		});
	});
};

let addTemporaryFile = (userId, filePath) => {
	temporaryFiles[userId] = temporaryFiles[userId] || new Set();
	temporaryFiles[userId].add(filePath);
};

let assembleUsers = () => {
	fs.readdir(inputDirectory, (err, files) => {
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
					name: filename,
					timestamp: timestamp,
					offset: timestamp - podcastTimestamp
				});
			}
		});

		for (let userId in users) {
			if (users.hasOwnProperty(userId)) {
				let user = users[userId];
				user.fragmentCount = user.fragments.length;
				delayFirstFragment(user);
			}
		}
	});
};

let delayFirstFragment = (user) => {
	user.fragments.sort((a, b) => {
		return a.offset - b.offset;
	});
	let fragment = user.fragments[0];
	let inputPath = path.join(inputDirectory, fragment.name);
	user.flipFlop = 1;
	let outputPath = path.join(inputDirectory, `${user.id}_${user.flipFlop}`);
	let delay = fragment.offset;
	addDelay(inputPath, outputPath, delay).then((stdout, stderr) => {
		user.fragments.shift();
		padAndConcatenateFragments(user);
	}).catch(console.error);
};

let padAndConcatenateFragments = (user) => {
	let nextFragment = user.fragments.shift();
	if (nextFragment) {
		let totalSamples = convertDurationToSamples(nextFragment.offset);
		let inputPath = path.join(inputDirectory, `${user.id}_${user.flipFlop}`);
		let outputPath = path.join(inputDirectory, `${user.id}_${1 - user.flipFlop}`);
		addTemporaryFile(user.id, inputPath);
		addTemporaryFile(user.id, outputPath);
		user.flipFlop = 1 - user.flipFlop;
		addPad(inputPath, outputPath, totalSamples).then((stdout, stderr) => {
			inputPath = path.join(inputDirectory, `${user.id}_${user.flipFlop}`);
			outputPath = path.join(inputDirectory, `${user.id}_${1 - user.flipFlop}`);
			user.flipFlop = 1 - user.flipFlop;
			let inputPathArray = [inputPath, path.join(inputDirectory, nextFragment.name)];
			concat(inputPathArray, outputPath).then((stderr, stdout) => {
				console.log(`User ${user.id} has completed ${100 * (user.fragmentCount - user.fragments.length) / user.fragmentCount}%`);
				if (user.fragments.length) {
					padAndConcatenateFragments(user);
				} else {
					fs.rename(outputPath, path.join(inputDirectory, user.id), (err) => {
						cleanTemporaryFiles(user);
					});
				}
			}).catch(console.error);
		}).catch(console.error);
	} else {
		fs.rename(path.join(inputDirectory, `${user.id}_${user.flipFlop}`), path.join(inputDirectory, user.id), (err) => {
			cleanTemporaryFiles(user);
		});
	}
};

let addFragmentDelay = (user) => {
	let outstandingFragmentCount = user.fragments.length;
	for (let fragment of user.fragments) {
		let inputPath = path.join(inputDirectory, fragment.name);
		let outputPath = path.join(inputDirectory, fragment.name + '-delay');
		addTemporaryFile(user.id, outputPath);
		let delay = fragment.offset;
		addDelay(inputPath, outputPath, delay).then((stdout, stderr) => {
			outstandingFragmentCount--;
			if (outstandingFragmentCount <= 0) {
				addFragmentDelayFinished(user);
			}
		}).catch(console.error);
	}
};

let addFragmentDelayFinished = (user) => {
	user.fragments.sort((a, b) => {
		return b.offset - a.offset;
	});
	let inputPath = path.join(inputDirectory, user.fragments[0].name + '-delay');
	getDuration(inputPath).then((duration, stdout, stderr) => {
		let samples = convertDurationToSamples(duration + 1000); // Add a second to ensure all fragments hit same total duration
		addFragmentPad(user, samples);
	}).catch(console.error);
};

let addFragmentPad = (user, samples) => {
	let outstandingFragmentCount = user.fragments.length;
	for (let fragment of user.fragments) {
		let inputPath = path.join(inputDirectory, fragment.name + '-delay');
		let outputPath = path.join(inputDirectory, fragment.name + '-delay-pad');
		addTemporaryFile(user.id, outputPath);
		addPad(inputPath, outputPath, samples).then((stdout, stderr) => {
			outstandingFragmentCount--;
			if (outstandingFragmentCount <= 0) {
				addFragmentPadFinished(user);
			}
		}).catch(console.error);
	}
};

let addFragmentPadFinished = (user) => {
	let inputPathArray = user.fragments.map((fragment) => {
		return path.join(inputDirectory, fragment.name + '-delay-pad');
	});
	let outputPath = path.join(inputDirectory, user.id);
	merge(inputPathArray, outputPath).then((stdout, stderr) => {
		console.log(stdout);
		cleanTemporaryFiles(user);
	}).catch(console.error);
};

let cleanTemporaryFiles = (user) => {
	let files = temporaryFiles[user.id];
	if (files) {
		files.forEach((filePath) => {
			fs.unlink(filePath, (err) => {
				files.delete(filePath);
				if (files.size <= 0) {
					cleanTemporaryFilesFinished(user);
				}
			});
		});
	} else {
		cleanTemporaryFilesFinished(user);
	}
};

let cleanTemporaryFilesFinished = (user) => {
	console.log(`User ${user.id} finished!`);
};

// And then do the rest

let inputDirectory = path.join('podcasts', process.argv[2]);
let podcastName = inputDirectory.split(path.sep);
podcastName = podcastName[podcastName.length - 1];
let podcastTimestamp = extractTimestamp(podcastName);

// Define global users object
let users = {};
let temporaryFiles = {};

assembleUsers();
