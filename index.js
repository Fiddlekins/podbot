'use strict';

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const StringDecoder = require('string_decoder').StringDecoder;
const Discord = require('discord.js');


const TOKEN = fs.readFileSync('./token', 'utf8').trim(); // Trim because linux

class Podbot {
	constructor(token){
		this.client = new Discord.Client();
		this.commandCharacter = '/';
		this.podcastsPath = Podbot._makePodcastsDirectory();

		this._voiceConnections = new Map();
		this._voiceReceivers = new Map();
		this._podcastNames = new Map();

		this._writeStreams = new Map();

		this.client.on('ready', this._onReady.bind(this));

		this.client.on('message', this._onMessage.bind(this));

		// this.client.on('guildMemberSpeaking', this._onGuildMemberSpeaking.bind(this));

		this.client.login(token).catch(console.error);
	}

	_onReady(){
		console.log('Ready!');
	}

	_onMessage(message){
		if (message.content.charAt(0) === this.commandCharacter) {
			switch (message.content.slice(1)) {
				case 'podon':
					this._podon(message.member);
					break;
				case 'podoff':
					this._podoff(message.member);
					break;
			}
		}
	}

	_onGuildMemberSpeaking(member, speaking){
		if (speaking && member.voiceChannel) {
			let receiver = this._voiceReceivers.get(member.voiceChannelID);
			if (receiver) {
				let podcastName = this._podcastNames.get(member.voiceChannelID);
				let outputPath = path.join(this.podcastsPath, podcastName, `${member.id}-${Date.now()}`);
				let inputStream = receiver.createOpusStream(member);
				let outputStream = fs.createWriteStream(outputPath);
				// inputStream.pipe(outputStream);

				// let ffmpegArgs = '-f s32le -ar 24k -ac 2 -i pipe:0 -ar 48000 -ac 2 -acodec libopus -ab 256k -f s32le pipe:1'.split(' ');
				let ffmpegArgs = '-acodec libopus -f s32le -ar 24k -ac 2 -i pipe:0 -f s32le -ar 24k -ac 2 pipe:1'.split(' ');

				let ffmpeg = child_process.spawn('ffmpeg', ffmpegArgs, {shell: true});
				inputStream.pipe(ffmpeg.stdin);
				ffmpeg.stdout.pipe(outputStream);
				let decoder = new StringDecoder('utf8');
				ffmpeg.stderr.on('data', (data) =>{
					console.log(decoder.write(data));
				});
			}
		}
	}

	_podon(member){
		if (!this._checkMemberHasPermissions(member)) {
			return;
		}
		if (!member.voiceChannel) {
			return;
		}

		let podcastName = `${member.voiceChannelID}-${Date.now()}`;
		this._podcastNames.set(member.voiceChannelID, podcastName);
		Podbot._makeDirectory(path.join(this.podcastsPath, podcastName));

		member.voiceChannel.join().then((voiceConnection) =>{
			this._voiceConnections.set(member.voiceChannelID, voiceConnection);
			// actually just add an event to listen to dat opus
			let voiceReceiver = voiceConnection.createReceiver();
			voiceReceiver.on('opus', (user, data) =>{
				console.log(data);
				let writeStream = this._writeStreams.get(user.id);
				if (!writeStream) {
					let outputPath = path.join(this.podcastsPath, podcastName, `${user.id}-${Date.now()}`);
					writeStream = fs.createWriteStream(outputPath);
					writeStream.on('finish', () =>{
						console.log('finish');
						this._writeStreams.delete(user.id);
					});
					writeStream.on('close', () =>{
						console.log('close');
						this._writeStreams.delete(user.id);
					});
					this._writeStreams.set(user.id, writeStream);
				}
				writeStream.write(data);
			});
			// insert ended
			this._voiceReceivers.set(member.voiceChannelID, voiceReceiver);
		}).catch(console.error);
	}

	_podoff(member){
		if (!this._checkMemberHasPermissions(member)) {
			return;
		}

		this._voiceReceivers.get(member.voiceChannelID).destroy();
		this._voiceReceivers.delete(member.voiceChannelID);
		this._voiceConnections.get(member.voiceChannelID).disconnect();
		this._voiceConnections.delete(member.voiceChannelID);
		this._podcastNames.delete(member.voiceChannelID);
	}

	_checkMemberHasPermissions(member){
		return true;
	}

	static _makePodcastsDirectory(){
		let dir = path.join('.', 'podcasts');
		Podbot._makeDirectory(dir);
		return dir;
	}

	static _makeDirectory(dir){
		try {
			fs.mkdirSync(dir);
		} catch (err) {
			// Don't care, presumably the folder exists already
		}
	}
}

const podbot = new Podbot(TOKEN);
