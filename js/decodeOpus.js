'use strict';

const fs = require('fs-extra');
const path = require('path');
const opus = require('node-opus');

const RATE = 48000;
const FRAME_SIZE = 1920;
const CHANNELS = 2;
const INPUT_EXTENSION = '.opus_string';
const OUTPUT_EXTENSION = '.raw_pcm';

function getDecodedFrame(frameString, encoder, filename) {
  let buffer = Buffer.from(frameString, 'hex');
  try {
    buffer = encoder.decode(buffer, FRAME_SIZE);
  } catch (err) {
    try {
      buffer = encoder.decode(buffer.slice(8), FRAME_SIZE);
    } catch (err) {
      console.log(`${filename} was unable to be decoded`);
      return null;
    }
  }
  return buffer;
}

function convertOpusStringToRawPCM(inputPath, filename) {
  return new Promise((resolve, reject) => {
    let encoder = new opus.OpusEncoder(RATE, CHANNELS);
    const inputStream = fs.createReadStream(inputPath);
    const outputStream = fs.createWriteStream(path.join(path.dirname(inputPath), `${filename}${OUTPUT_EXTENSION}`));
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

module.exports = {
  decodeOpus: convertAllOpusStringToRawPCM
};
