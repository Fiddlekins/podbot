'use strict';

const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;

const frequency = 24000;

// Define functions

let extractUserId = (name) =>{
	return name.split('-')[0];
};

let extractTimestamp = (name) =>{
	return parseInt(name.split('-')[1], 10);
};

let parseTimeIntoMilliseconds = (timeString) =>{
	let intsDec = timeString.split('.');
	let ints = intsDec[0].split(':').map((num) =>{
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

	let int = ints.reduce((a, b) =>{
		return a + b;
	}, 0);

	let dec = 0;
	if (intsDec[1]) {
		dec = parseFloat(`0.${intsDec[1]}`) * 1000;
	}

	return int + dec;
};

let convertDurationToSamples = (duration) =>{
	return Math.ceil(frequency * duration / 1000);
};

let addDelay = (inputPath, outputPath, delay) =>{
	return new Promise((resolve, reject) =>{
		let command = `ffmpeg -f s32le -ar 24k -ac 2 -i ${inputPath} -af "adelay=${delay}|${delay}" -f s32le -acodec pcm_s32le ${outputPath}`;
		exec(command, {}, (err, stdout, stderr) =>{
			if (err) {
				reject(err);
			}
			resolve(stdout, stderr);
		});
	});
};

let addPad = (inputPath, outputPath, samples) =>{
	return new Promise((resolve, reject) =>{
		let command = `ffmpeg -f s32le -ar 24k -ac 2 -i ${inputPath} -af apad=whole_len=${samples} -f s32le -acodec pcm_s32le ${outputPath}`;
		exec(command, {}, (err, stdout, stderr) =>{
			if (err) {
				reject(err);
			}
			resolve(stdout, stderr);
		});
	});
};

let getDuration = (inputPath) =>{
	return new Promise((resolve, reject) =>{
		let command = `ffmpeg -f s32le -ar 24k -ac 2 -i ${inputPath} -f null -`;
		exec(command, {}, (err, stdout, stderr) =>{
			if (err) {
				reject(err);
			}
			let match = stderr.match(/time=([0-9:.]+)/);
			let duration = parseTimeIntoMilliseconds(match[1]);

			resolve(duration, stdout, stderr);
		});
	});
};

let merge = (inputPathArray, outputPath) =>{
	return new Promise((resolve, reject) =>{
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
		exec(command, {}, (err, stdout, stderr) =>{
			if (err) {
				reject(err);
			}
			resolve(stdout, stderr);
		});
	});
};

let addTemporaryFile = (userId, filePath) =>{
	temporaryFiles[userId] = temporaryFiles[userId] || new Set();
	temporaryFiles[userId].add(filePath);
};

let assembleUsers = () =>{
	fs.readdir(inputDirectory, (err, files) =>{
		files.forEach((file) =>{
			let userId = extractUserId(file);
			let timestamp = extractTimestamp(file);
			users[userId] = users[userId] || {
					id: userId,
					fragments: []
				};
			users[userId].fragments.push({
				name: file,
				timestamp: timestamp,
				offset: timestamp - podcastTimestamp
			});
		});

		for (let userId in users) {
			if (users.hasOwnProperty(userId)) {
				let user = users[userId];
				user.fragments.sort((a, b) =>{
					return a.offset - b.offset;
				});
				addFragmentDelay(user);
			}
		}
	});
};

let addFragmentDelay = (user) =>{
	let outstandingFragmentCount = user.fragments.length;
	for (let fragment of user.fragments) {
		let inputPath = path.join(inputDirectory, fragment.name);
		let outputPath = path.join(inputDirectory, fragment.name + '-delay');
		addTemporaryFile(user.id, outputPath);
		let delay = fragment.offset;
		addDelay(inputPath, outputPath, delay).then((stdout, stderr) =>{
			outstandingFragmentCount--;
			if (outstandingFragmentCount <= 0) {
				addFragmentDelayFinished(user);
			}
		}).catch(console.error);
	}
};

let addFragmentDelayFinished = (user) =>{
	user.fragments.sort((a, b) =>{
		return b.offset - a.offset;
	});
	let inputPath = path.join(inputDirectory, user.fragments[0].name + '-delay');
	getDuration(inputPath).then((duration, stdout, stderr) =>{
		let samples = convertDurationToSamples(duration + 1000); // Add a second to ensure all fragments hit same total duration
		addFragmentPad(user, samples);
	}).catch(console.error);
};

let addFragmentPad = (user, samples) =>{
	let outstandingFragmentCount = user.fragments.length;
	for (let fragment of user.fragments) {
		let inputPath = path.join(inputDirectory, fragment.name + '-delay');
		let outputPath = path.join(inputDirectory, fragment.name + '-delay-pad');
		addTemporaryFile(user.id, outputPath);
		addPad(inputPath, outputPath, samples).then((stdout, stderr) =>{
			outstandingFragmentCount--;
			if (outstandingFragmentCount <= 0) {
				addFragmentPadFinished(user);
			}
		}).catch(console.error);
	}
};

let addFragmentPadFinished = (user) =>{
	let inputPathArray = user.fragments.map((fragment) =>{
		return path.join(inputDirectory, fragment.name + '-delay-pad');
	});
	let outputPath = path.join(inputDirectory, user.id);
	merge(inputPathArray, outputPath).then((stdout, stderr) =>{
		cleanTemporaryFiles(user);
	}).catch(console.error);
};

let cleanTemporaryFiles = (user) =>{
	let files = temporaryFiles[user.id];
	files.forEach((filePath) =>{
		fs.unlink(filePath, (err) =>{
			files.delete(filePath);
			if (files.size <= 0) {
				cleanTemporaryFilesFinished(user);
			}
		});
	});
};

let cleanTemporaryFilesFinished = (user) =>{
	console.log(`User ${user.id} finished!`);
};

// And then do the rest

let inputDirectory = path.join('podcasts', '177736817146068992-1484616351048');
let podcastName = inputDirectory.split(path.sep);
podcastName = podcastName[podcastName.length - 1];
let podcastTimestamp = extractTimestamp(podcastName);

// Define global users object
let users = {};
let temporaryFiles = {};

assembleUsers();
