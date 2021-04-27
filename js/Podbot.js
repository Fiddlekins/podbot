'use strict';

const fs = require('fs-extra');
const path = require('path');
const Discord = require('discord.js');
const log = require('./log.js');
const postProcess = require('./postProcess.js').processDirectory;

class Podbot {
  constructor(config) {
    this._config = config;
    this._client = new Discord.Client();
    this._podcasts = new Map();
    this._audioFiles = [];

    this._client.on('ready', this._onReady.bind(this));
    this._client.on('message', this._onMessage.bind(this));
    this._client.on('voiceStateUpdate', this._onVoiceStateUpdate.bind(this));
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
    for (const [channelID, podcast] of this._podcasts) {
      podcast.voiceConnection.disconnect();
      podcast.members.forEach((member) => {
        this._stopRecording(member, podcast);
      });
      this._podcasts.delete(channelID);
    }
    await this._client.destroy();
    this._client = null;
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
    this._updatePresence();
  }

  _onMessage(message) {
    if (message.content.startsWith(this._config.commandPrefix)) {
      switch (message.content.slice(this._config.commandPrefix.length)) {
        case 'help':
          this._help(message).catch(log.error.bind(log));
          break;
        case 'podon':
          this._podon(message).catch(log.error.bind(log));
          break;
        case 'stop':
          this._stop(message).catch(log.error.bind(log));
          break;
        case 'record':
          this._record(message).catch(log.error.bind(log));
          break;
        case 'podoff':
          this._podoff(message).catch(log.error.bind(log));
          break;
        case 'state':
          this._state(message).catch(log.error.bind(log));
          break;
        case 'play':
          this._play(message).catch(log.error.bind(log));
          break;
      }
    }
  }

  _onVoiceStateUpdate(oldState, newState) {
    // stop recording a user that leaves an active voice channel
    if (oldState && oldState.channelID && oldState.channelID !== newState.channelID && this._podcasts.has(oldState.channelID)) {
      this._stopRecording(oldState.member, this._podcasts.get(oldState.channelID));
    }
    // start recording a user that joins an active voice channel
    const podcast = this._podcasts.get(newState.channelID);
    if (this._podcasts.has(newState.channelID) && !podcast.members.get(newState.member_id)) {
      this._startRecording(newState.member, this._podcasts.get(newState.channelID));
    }
  }

  async _help(message) {
    message.reply("/podon: start recording\n/stop: stop recording\n/record: record again\n/state: recording state\n/play: play recordings\n/podoff: leave");
  }

  async _record(message) {
    const member = message.member;
    if (!member) {
      return;
    }
    if (!this._hasPermission(member)) {
      return;
    }
    if (!member.voice.channel) {
      await message.reply(`you're not in a voice channel`);
      return;
    }
    const { channelID } = member.voice;
    const podcast = this._podcasts.get(channelID);
    if (!podcast) {
      await message.reply(`you're not in a voice channel`);
      return;
    }
    await message.reply(`playing ...`);
    this._updatePresence();
    member.voice.channel.members.forEach((member) => {
      this._startRecording(member, podcast);
    });
  }

  async _podon(message) {
    const member = message.member;
    if (!member) {
      return;
    }
    if (!this._hasPermission(member)) {
      return;
    }
    if (!member.voice.channel) {
      await message.reply(`you're not in a voice channel`);
      return;
    }
    const { channelID } = member.voice;
    const outputPath = path.join(this._config.podcastPath, `${channelID}-${Date.now()}`);
    const [voiceConnection] = await Promise.all([
      member.voice.channel.join(),
      fs.ensureDir(outputPath)
    ])
    message.reply(`Recording ${channelID} ...`)
    voiceConnection.play("./beep.mp3")
    const podcast = {
      name: member.voice.channel.name,
      outputPath,
      voiceConnection,
      members: new Map()
    };
    this._podcasts.set(channelID, podcast);
    this._updatePresence();
    member.voice.channel.members.forEach((member) => {
      this._startRecording(member, podcast);
    });

  }

  async _play(message) {
    const member = message.member;
    if (!member) {
      return;
    }
    if (!this._hasPermission(member)) {
      return;
    }
    if (!member.voice.channel) {
      await message.reply(`you're not in a voice channel`);
      return;
    }
    if (this._audioFiles.size == 0) {
      await message.reply(`No recordings to play.`);
      return;
    }

    const { channelID } = member.voice;
    const podcast = this._podcasts.get(channelID);
    await message.reply(`playing ...`);
    this._audioFiles.forEach((file) => {
      podcast.voiceConnection.play(file);
    });
  }

  async _state(message) {
    const member = message.member;
    if (!member) {
      return;
    }
    if (!this._hasPermission(member)) {
      return;
    }
    if (!member.voice.channel) {
      await message.reply(`you're not in a voice channel`);
      return;
    }
    const { channelID } = member.voice;
    const podcast = this._podcasts.get(channelID);
    const stream = podcast.members.get(member.id).writeStream
    message.channel.send(
            [
                stream.path,
                `Active : ${!stream.closed} | Writable : ${stream.writable}`,
                `Bytes written : ${stream.bytesWritten.toLocaleString()}`,
                `--`
            ].join("\n")
    )
  }

  async _stop(message) {
    const member = message.member;
    if (!member) {
      return;
    }
    if (!this._hasPermission(member)) {
      return;
    }
    if (!member.voice.channel) {
      await message.reply(`you're not in a voice channel`);
      return;
    }
    const { channelID } = member.voice;
    const podcast = this._podcasts.get(channelID);
    podcast.members.forEach((member) => {
      this._stopRecording(member, podcast);
    });
    message.reply(`Recording stop ...`)
    // postProcess
    this._audioFiles = await postProcess(podcast.outputPath, this._config.postProcess.format);
    this._updatePresence();
  }


  async _podoff(message) {
    const member = message.member;
    if (!member) {
      return;
    }
    if (!this._hasPermission(member)) {
      return;
    }
    if (!member.voice.channel) {
      await message.reply(`you're not in a voice channel`);
      return;
    }
    const { channelID } = member.voice;
    const podcast = this._podcasts.get(channelID);
    podcast.voiceConnection.disconnect();
    podcast.members.forEach((member) => {
      this._stopRecording(member, podcast);
    });
    this._podcasts.delete(channelID);
    this._updatePresence();
    // postProcess
    this._audioFiles = await postProcess(podcast.outputPath, this._config.postProcess.format);
  }

  _startRecording(member, podcast) {
    const voiceStream = podcast.voiceConnection.receiver.createStream(member, {
      mode: 'pcm',
      end: 'manual'
    });
    const outputPath = path.join(podcast.outputPath, `${member.id}-${Date.now()}.raw_pcm`);
    const writeStream = fs.createWriteStream(outputPath);
    voiceStream.pipe(writeStream);
    podcast.members.set(member.id, {
      voiceStream,
      writeStream
    });
    voiceStream.on('close', () => {
      podcast.members.delete(member.id);
      writeStream.end(err => {
        if (err) {
          log.error(err);
        }
      });
    });
  }

  _stopRecording(member, podcast) {
    const memberData = podcast.members.get(member.id);
    if (memberData) {
      const { voiceStream, writeStream } = memberData;
      voiceStream.destroy();
      writeStream.end();
    }
    podcast.members.delete(member.id);
  }

  _hasPermission(member) {
    if (this._config.controllers.users.includes(member.id)) {
      return true;
    }

    if (member.hasPermission('ADMINISTRATOR')) {
      return true;
    }

    for (const roleName of this._config.controllers.roles) {
      if (member.roles.cache.find(role => role.name === roleName)) {
        return true;
      }
    }
    return false;
  }

  _updatePresence() {
    const presence = {
      activity: {}
    };
    switch (this._podcasts.size) {
      case 0:
        presence.activity.type = 'WATCHING';
        switch (this._config.presence.type) {
          case 'public':
            presence.activity.name = 'you';
            break;
          case 'private':
            presence.activity.name = 'you';
            break;
          case 'custom':
            presence.activity.name = this._config.presence.activity.none;
            break;
        }
        break;
      case 1:
        presence.activity.type = 'LISTENING';
        switch (this._config.presence.type) {
          case 'public':
            presence.activity.name = `"${this._podcasts.values().next().value.name}"`;
            break;
          case 'private':
            presence.activity.name = `1 podcast`;
            break;
          case 'custom':
            presence.activity.name = this._config.presence.activity.single;
            break;
        }
        break;
      default:
        presence.activity.type = 'LISTENING';
        switch (this._config.presence.type) {
          case 'public':
            const podcastNames = [];
            for (const podcast of this._podcasts.values()) {
              podcastNames.push(`"${podcast.name}"`);
            }
            presence.activity.name = podcastNames.join(', ');
            break;
          case 'private':
            presence.activity.name = `${this._podcasts.size} podcasts`;
            break;
          case 'custom':
            presence.activity.name = this._config.presence.activity.multiple;
            break;
        }

    }
    this._client.user.setPresence(presence);
  }
}

module.exports = Podbot;
