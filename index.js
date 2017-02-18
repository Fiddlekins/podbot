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

const TOKEN = fs.readFileSync('./token', 'utf8').trim(); // Trim because linux

class Podbot {
	constructor(token) {
		this.client = new Discord.Client();
		this.commandCharacter = '/';
		this.podcastsPath = Podbot._makePodcastsDirectory();

		this._controllerUsers = new Set();

		this._voiceConnections = new Map();
		this._voiceReceivers = new Map();
		this._writeStreams = new Map();

		this.client.on('ready', this._onReady.bind(this));

		this.client.on('message', this._onMessage.bind(this));

		this.client.on('guildMemberSpeaking', this._onGuildMemberSpeaking.bind(this));

		this.client.login(token).catch(console.error);
	}

	_onReady() {
		console.log('Ready!');

		CONTROLLER_IDS.forEach((id) =>{
			this.client.fetchUser(id).then(user =>{
				this._controllerUsers.add(user);
			}).catch(console.error);
		});
	}

	_onMessage(message) {
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

	_onGuildMemberSpeaking(member, speaking) {
		// Close the writeStream when a member stops speaking
		if (!speaking && member.voiceChannel) {
			let receiver = this._voiceReceivers.get(member.voiceChannelID);
			if (receiver) {
				let writeStream = this._writeStreams.get(member.id);
				if (writeStream) {
					this._writeStreams.delete(member.id);
					writeStream.end(err => {
						if (err) {
							console.error(err);
						}
					});
				}
			}
		}
	}

	_podon(member) {
		if (!this._checkMemberHasPermissions(member)) {
			return;
		}
		if (!member.voiceChannel) {
			return;
		}

		let podcastName = `${member.voiceChannelID}-${Date.now()}`;
		Podbot._makeDirectory(path.join(this.podcastsPath, podcastName));

		member.voiceChannel.join().then((voiceConnection) => {
			this._voiceConnections.set(member.voiceChannelID, voiceConnection);
			let voiceReceiver = voiceConnection.createReceiver();
			voiceReceiver.on('opus', (user, data) => {
				let hexString = data.toString('hex');
				let writeStream = this._writeStreams.get(user.id);
				if (!writeStream) {
					/* If there isn't an ongoing writeStream and a frame of silence is received then it must be the
					 *   left over trailing silence frames used to signal the end of the transmission.
					 * If we do not ignore this frame at this point we will create a new writeStream that is labelled
					 *   as starting at the current time, but there will actually be a time delay before it is further
					 *   populated by data once the user has begun speaking again.
					 * This delay would not be captured however since no data is sent for it, so the result would be
					 *   the audio fragments being out of time when reassembled.
					 * For this reason a packet of silence cannot be used to create a new writeStream.
					 */
					if (hexString === 'f8fffe') {
						return;
					}
					let outputPath = path.join(this.podcastsPath, podcastName, `${user.id}-${Date.now()}.opus_string`);
					writeStream = fs.createWriteStream(outputPath);
					this._writeStreams.set(user.id, writeStream);
				}
				writeStream.write(`,${hexString}`);
			});
			this._voiceReceivers.set(member.voiceChannelID, voiceReceiver);
		}).catch(console.error);
	}

	_podoff(member) {
		if (!this._checkMemberHasPermissions(member)) {
			return;
		}

		this._voiceReceivers.get(member.voiceChannelID).destroy();
		this._voiceReceivers.delete(member.voiceChannelID);
		this._voiceConnections.get(member.voiceChannelID).disconnect();
		this._voiceConnections.delete(member.voiceChannelID);
	}

	_checkMemberHasPermissions(member){
		if (this._controllerUsers.has(member.user)) {
			return true;
		}
	}

	static _makePodcastsDirectory() {
		let dir = path.join('.', 'podcasts');
		Podbot._makeDirectory(dir);
		return dir;
	}

	static _makeDirectory(dir) {
		try {
			fs.mkdirSync(dir);
		} catch (err) {
			// Don't care, presumably the folder exists already
		}
	}
}

const podbot = new Podbot(TOKEN);
