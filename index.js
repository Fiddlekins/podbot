'use strict';

const fs = require('fs');
const path = require('path');
const Discord = require('discord.js');

const TOKEN = fs.readFileSync('./token', 'utf8').trim(); // Trim because linux
const CONTROLLER_IDS = [];

// Populate controller_ids
fs.readFile('./controllers', 'utf8', (err, data) =>{
	if (!err) {
		[].push.apply(CONTROLLER_IDS, data.split(/\s+/));
	}
});


class Podbot {
	constructor(token){
		this.client = new Discord.Client();
		this.commandCharacter = '/';
		this.podcastsPath = Podbot._makePodcastsDirectory();

		this._controllerUsers = new Set();

		this._voiceConnections = new Map();
		this._voiceReceivers = new Map();
		this._podcastNames = new Map();

		this.client.on('ready', this._onReady.bind(this));

		this.client.on('message', this._onMessage.bind(this));

		this.client.on('guildMemberSpeaking', this._onGuildMemberSpeaking.bind(this));

		this.client.login(token).catch(console.error);
	}

	_onReady(){
		console.log('Ready!');

		CONTROLLER_IDS.forEach((id) =>{
			this.client.fetchUser(id).then(user =>{
				this._controllerUsers.add(user);
			}).catch(console.error);
		});
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
				let inputStream = receiver.createPCMStream(member);
				let outputStream = fs.createWriteStream(outputPath);
				inputStream.pipe(outputStream);
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
			this._voiceReceivers.set(member.voiceChannelID, voiceConnection.createReceiver());
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
		if (this._controllerUsers.has(member.user)) {
			return true;
		}
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
