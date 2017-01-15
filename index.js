'use strict';

const fs = require('fs');
const Discord = require('discord.js');

const TOKEN = fs.readFileSync('./token', 'utf8').trim(); // Trim because linux


class Podbot {
	constructor(token){
		this.client = new Discord.Client();
		this.commandCharacter = '/';

		this.client.on('ready', () =>{
			console.log('Ready!');
		});

		this.client.on('message', this._onMessage.bind(this));

		this.client.on('voiceStateUpdate', (oldUser, newUser) =>{
			if (newUser.user.equals(this.client.user)) {
				return;
			}
			if (newUser.voiceChannel) {
				newUser.voiceChannel.join().then((voiceConnection) =>{
					let voiceReceiver = voiceConnection.createReceiver();
					let inputStream = voiceReceiver.createPCMStream(newUser);
					let outputStream = fs.createWriteStream('./voice');
					inputStream.pipe(outputStream);
				}).catch(console.error);
			}
		});

		this.client.login(token).catch(console.error);
	}

	_onMessage(message){
		if (message.content.charAt(0) === this.commandCharacter) {
			switch (message.content.slice(1)) {
				case 'podon':
					break;
				case 'podoff':
					break;
			}
		}
	}
}

const fidbot = new Podbot(TOKEN);
