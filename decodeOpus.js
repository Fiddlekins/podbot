'use strict';

const fs = require('fs');
const path = require('path');
const opus = require('node-opus');

const rate = 48000;
const frame_size = 1920;
const channels = 2;

let total = 0;
let complete = 0;

let convertOpusStringToRawPCM = (inputPath, filename) => {
	total++;
	let encoder = new opus.OpusEncoder(rate, channels);
	fs.readFile(inputPath, { encoding: 'utf8' }, (err, data) => {
		let frames = data.slice(1).split(','); // Starts with a comma so toss the empty first entry
		let buffers = frames.map(str => {
			return Buffer.from(str, 'hex');
		});
		try {
			buffers = buffers.map(buffer => {
				return encoder.decode(buffer, frame_size);
			});
		} catch (err) {
			try {
				buffers = buffers.map(buffer => {
					return encoder.decode(buffer.slice(8), frame_size);
				});
			} catch (err) {
				console.log(`${filename} was unable to be decoded`);
			}
		}
		let outputStream = fs.createWriteStream(path.join(path.dirname(inputPath), `${filename}.raw_pcm`));
		for (let buffer of buffers) {
			outputStream.write(buffer);
		}
		outputStream.end((err) => {
			if (err) {
				console.error(err);
			}
			complete++;
			console.log(`Completed ${100 * complete / total}%`);
		});
	});
};

let convertAllOpusStringToRawPCM = (inputDirectory) => {
	fs.readdir(inputDirectory, (err, files) => {
		if (err) {
			console.error(`Could not read input due to: ${err}`);
		} else {
			files.forEach((file) => {
				let ext = path.extname(file);
				if (ext === '.opus_string') {
					convertOpusStringToRawPCM(path.join(inputDirectory, file), path.basename(file, ext));
				}
			});
		}
	});
};

let inputDirectory = path.join('podcasts', process.argv[2]);

convertAllOpusStringToRawPCM(inputDirectory);
