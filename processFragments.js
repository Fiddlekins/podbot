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

let assembleUsers = () =>{
	fs.readdir(inputDirectory, (err, files) =>{
		files.forEach((file) =>{
			let userId = extractUserId(file);
			let timestamp = extractTimestamp(file);
			users[userId] = users[userId] || [];
			users[userId].push({
				name: file,
				timestamp: timestamp,
				offset: timestamp - podcastTimestamp
			});
		});

		for (let userId in users) {
			if (users.hasOwnProperty(userId)) {
				let user = users[userId];
				addFragmentDelay(user);
			}
		}
	});
};

let addFragmentDelay = (user) =>{
	let outstandingFragmentCount = user.length;
	for (let fragment of user) {
		let inputPath = path.join(inputDirectory, fragment.name);
		let outputPath = path.join(inputDirectory, fragment.name + '-delay');
		let delay = fragment.offset;
		let command = `ffmpeg -f s32le -ar 24k -ac 2 -i ${inputPath} -af "adelay=${delay}|${delay}" -f s32le -acodec pcm_s32le ${outputPath}`;
		exec(command, {}, (err, stdout, stderr) =>{
			// console.log(err);
			// console.log(stderr);
			outstandingFragmentCount--;
			if (outstandingFragmentCount <= 0) {
				addFragmentDelayFinished(user);
			}
		});
	}
};

let addFragmentDelayFinished = (user) =>{
	user.sort((a, b) =>{
		return b.offset - a.offset;
	});
	let inputPath = path.join(inputDirectory, user[0].name + '-delay');
	let command = `ffmpeg -f s32le -ar 24k -ac 2 -i ${inputPath} -f null -`;
	exec(command, {}, (err, stdout, stderr) =>{
		// console.log(stderr);

		let match = stderr.match(/time=([0-9:.]+)/);
		let totalDuration = parseTimeIntoMilliseconds(match[1]) + 1000; // Add a second to ensure all fragments hit same total duration
		let totalSamples = Math.ceil(frequency * totalDuration / 1000);
		addFragmentPad(user, totalSamples);
	});
};

let addFragmentPad = (user, totalSamples) =>{
	let outstandingFragmentCount = user.length;
	for (let fragment of user) {
		let inputPath = path.join(inputDirectory, fragment.name + '-delay');
		let outputPath = path.join(inputDirectory, fragment.name + '-delay-pad');
		let command = `ffmpeg -f s32le -ar 24k -ac 2 -i ${inputPath} -af apad=whole_len=${totalSamples} -f s32le -acodec pcm_s32le ${outputPath}`;
		exec(command, {}, (err, stdout, stderr) =>{
			// console.log(err);
			// console.log(stderr);
			outstandingFragmentCount--;
			if (outstandingFragmentCount <= 0) {
				addFragmentPadFinished(user);
			}
		});
	}
};

let addFragmentPadFinished = (user) =>{

	let inputCommand = '';
	let filterInputCommand = '';
	let i = 0;
	for (let fragment of user) {
		let inputPath = path.join(inputDirectory, fragment.name + '-delay-pad');
		inputCommand += `-f s32le -ar 24k -ac 2 -i ${inputPath} `;
		filterInputCommand += `[${i}:a]`;
		i++;
	}
	let inputCount = user.length;
	let outputPath = path.join(inputDirectory, user[0].name.split('-')[0]);

	let command = `ffmpeg ${inputCommand}-filter_complex "${filterInputCommand}amerge=inputs=${inputCount}[aout]" -map "[aout]" -ac 2 -f s32le -acodec pcm_s32le ${outputPath}`;
	exec(command, {}, (err, stdout, stderr) =>{
		if (err) {
			console.log(err);
		}
		cleanTemporaryFiles(user);
	});
};

let cleanTemporaryFiles = (user) =>{
	let outstandingFragmentCount = user.length * 2;
	for (let fragment of user) {
		let tempPath1 = path.join(inputDirectory, fragment.name + '-delay');
		let tempPath2 = path.join(inputDirectory, fragment.name + '-delay-pad');

		fs.unlink(tempPath1, (err) =>{
			outstandingFragmentCount--;
			if (outstandingFragmentCount <= 0) {
				cleanTemporaryFilesFinished(user);
			}
		});

		fs.unlink(tempPath2, (err) =>{
			outstandingFragmentCount--;
			if (outstandingFragmentCount <= 0) {
				cleanTemporaryFilesFinished(user);
			}
		});
	}
};

let cleanTemporaryFilesFinished = (user) =>{
	console.log('done');
};

// And then do the rest

let inputDirectory = path.join('podcasts', '177736817146068992-1484693143354');
let podcastName = inputDirectory.split(path.sep);
podcastName = podcastName[podcastName.length - 1];
let podcastTimestamp = extractTimestamp(podcastName);

// Define global users object
let users = {};

assembleUsers();
