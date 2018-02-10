'use strict';

const fs = require('fs-extra');
const path = require('path');
const opus = require('node-opus');

const rate = 48000;
const frame_size = 1920;
const channels = 2;

const INPUT_EXTENSION = '.opus_string';

function getDecodedFrame(frameString, encoder, filename) {
	let buffer = Buffer.from(frameString, 'hex');
	try {
		buffer = encoder.decode(buffer, frame_size);
	} catch (err) {
		try {
			buffer = encoder.decode(buffer.slice(8), frame_size);
		} catch (err) {
			console.log(`${filename} was unable to be decoded`);
			return null;
		}
	}
	return buffer;
}

function convertOpusStringToRawPCM(inputPath, filename) {
	return new Promise((resolve, reject) => {
		let encoder = new opus.OpusEncoder(rate, channels);
		const inputStream = fs.createReadStream(inputPath);
		const outputStream = fs.createWriteStream(path.join(path.dirname(inputPath), `${filename}.raw_pcm`));
		let data = '';
		inputStream.on('data', chunk => {
			data += chunk.toString();
			const frames = data.split(',');
			if (frames.length) {
				data = frames.pop();
			}
			for (let frame of frames) {
				if (frame !== '') {
					const decodedBuffer = getDecodedFrame(frame, encoder, filename);
					if (decodedBuffer) {
						outputStream.write(decodedBuffer);
					}
				}
			}
		});
		inputStream.on('end', () => {
			outputStream.end((err) => {
				if (err) {
					console.error(err);
					reject(err);
				}
				resolve();
			});
		});
	});
}

async function convertAllOpusStringToRawPCM(inputDirectory) {
	let files;
	try {
		files = await fs.readdir(inputDirectory);
	} catch (err) {
		console.error(`Could not read input due to: ${err}`);
	}
	files = files.filter(file => path.extname(file) === INPUT_EXTENSION);
	let totalCount = files.length;
	let completedCount = 0;
	const updateProgress = () => {
		completedCount++;
		console.log(`Completed ${100 * completedCount / totalCount}%`);
	};
	await Promise.all(files.map(file => {
		return convertOpusStringToRawPCM(path.join(inputDirectory, file), path.basename(file, INPUT_EXTENSION)).then(updateProgress);
	}));
}

let inputDirectory = path.join('podcasts', process.argv[2]);

convertAllOpusStringToRawPCM(inputDirectory);
