'use strict';

const fs = require('fs-extra');
const path = require('path');
const Discord = require('discord.js');
const log = require('./log.js');

class Podbot {
	constructor(config) {
		this._config = config;

		this._client = new Discord.Client();

		this._voiceConnections = new Map();
		this._voiceReceivers = new Map();
		this._writeStreams = new Map();

		this._client.on('ready', this._onReady.bind(this));

		this._client.on('message', this._onMessage.bind(this));

		this._client.on('guildMemberSpeaking', this._onGuildMemberSpeaking.bind(this));

		this._client.on('disconnect', (e) => {
			log.warn(`Disconnected from gateway with code ${e.code}`);
		});

		this._client.on('reconnecting', () => {
			log.warn(`Reconnecting`);
		});

		this._client.on('error', log.error);
		this._client.on('warn', log.warn);

		this._init();
	}

	async destroy() {
		await this._client.destroy();
		this._client = null;
		this._writeStreams.forEach(stream => {
			try {
				stream.destroy('Podbot destroyed');
			} catch (err) {
				log.error(err);
			}
		});
		this._voiceConnections.clear();
		this._voiceReceivers.clear();
		this._writeStreams.clear();
	}

	async _init() {
		await fs.ensureDir(this._config.podcastPath);
		await this._connect();
	}

	async _connect() {
		await this._client.login(this._config.token);
	}

	_onReady() {
		log.log(`Connected as ${this._client.user.username}#${this._client.user.discriminator} ${this._client.user.id}`);
		if (this._config.game.length) {
			this._client.user.setGame(this._config.game);
		}
	}

	_onMessage(message) {
		if (message.content.startsWith(this._config.commandPrefix)) {
			switch (message.content.slice(this._config.commandPrefix.length)) {
				case 'podon':
					this._podon(message).catch(log.error.bind(log));
					break;
				case 'podoff':
					this._podoff(message).catch(log.error.bind(log));
					break;
			}
		}
	}

	_onGuildMemberSpeaking(member, speaking) {
		// Close the writeStream when a member stops speaking
		if (!speaking && member.voiceChannel) {
			const receiver = this._voiceReceivers.get(member.voiceChannelID);
			if (receiver) {
				const writeStream = this._writeStreams.get(member.id);
				if (writeStream) {
					this._writeStreams.delete(member.id);
					writeStream.end(err => {
						if (err) {
							log.error(err);
						}
					});
				}
			}
		}
	}

	async _podon(message) {
		const member = message.member;
		if (!member) {
			return;
		}
		if (!this._hasPermission(member)) {
			return;
		}
		if (!member.voiceChannel) {
			await message.reply(`you're not in a voice channel`);
			return;
		}
		const podcastName = `${member.voiceChannelID}-${Date.now()}`;
		const newPodcastPath = path.join(this._config.podcastPath, podcastName);
		await fs.ensureDir(newPodcastPath);
		const voiceConnection = await member.voiceChannel.join();
		this._voiceConnections.set(member.voiceChannelID, voiceConnection);
		const voiceReceiver = voiceConnection.createReceiver();
		this._voiceReceivers.set(member.voiceChannelID, voiceReceiver);
		voiceReceiver.on('opus', (user, data) => {
			const hexString = data.toString('hex');
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
				const outputPath = path.join(newPodcastPath, `${user.id}-${Date.now()}.opus_string`);
				writeStream = fs.createWriteStream(outputPath);
				this._writeStreams.set(user.id, writeStream);
			}
			writeStream.write(`,${hexString}`);
		});
	}

	async _podoff(message) {
		const member = message.member;
		if (!member) {
			return;
		}
		if (!this._hasPermission(member)) {
			return;
		}
		if (!member.voiceChannel) {
			await message.reply(`you're not in a voice channel`);
			return;
		}
		if (this._voiceReceivers.get(member.voiceChannelID)) {
			this._voiceReceivers.get(member.voiceChannelID).destroy();
			this._voiceReceivers.delete(member.voiceChannelID);
			this._voiceConnections.get(member.voiceChannelID).disconnect();
			this._voiceConnections.delete(member.voiceChannelID);
		}
	}

	_hasPermission(member) {
		if (this._config.controllers.users.includes(member.id)) {
			return true;
		}
		for (const roleName of this._config.controllers.roles) {
			if (member.roles.exists('name', roleName)) {
				return true;
			}
		}
		return false;
	}
}

module.exports = Podbot;
