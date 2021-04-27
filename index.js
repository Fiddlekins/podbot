'use strict';

const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const minimist = require('minimist');
const log = require('./js/log.js');
const outputFormats = require('./js/outputFormats.js');
const { makeRelativePathsAbsolute } = require('./js/utils.js');
const Podbot = require('./js/Podbot.js');

const args = minimist(process.argv.slice(2), {
  boolean: ['env-config']
});

const configPath = path.join(__dirname, 'config.json');

async function promptConfigCreation() {
  const questions = [];
  questions.push({
    type: 'input',
    name: 'token',
    message: 'Input bot token:'
  });
  questions.push({
    type: 'input',
    name: 'podcastPath',
    message: 'Input path to directory podbot will save podcasts to:',
    default: `.${path.sep}podcasts`
  });
  questions.push({
    type: 'input',
    name: 'controllerRoles',
    message: 'Input comma separated names of roles that podbot will listen to:',
    default: 'podhandler'
  });
  questions.push({
    type: 'input',
    name: 'controllerUsers',
    message: 'Input comma separated user IDs of users that podbot will listen to:',
    default: ''
  });
  questions.push({
    type: 'input',
    name: 'commandPrefix',
    message: 'Input string podbot will recognise as the command prefix:',
    default: '/'
  });
  questions.push({
    type: 'input',
    name: 'timeout',
    message: 'Specify how long podbot wait before attempting to restart after crashing in ms. (Be wary of rate limits):',
    default: 10000,
    validate: (input, answers) => {
      const parsedInput = parseInt(input, 10);
      return !isNaN(parsedInput) && parsedInput > 0;
    }
  });
  questions.push({
    type: 'confirm',
    name: 'sanitizeLogs',
    message: 'Should logs have folder paths sanitized:',
    default: false
  });
  questions.push({
    type: 'list',
    name: 'outputFormat',
    message: 'Select format to output audio during post processing:',
    choices: Object.values(outputFormats),
    default: outputFormats.WAV
  });
  questions.push({
    type: 'list',
    name: 'presenceType',
    message: 'Set the way the activity message behaves:',
    choices: [
      {
        name: "public (The voice channel names will be listed in the activity message, across all servers the bot is in)",
        short: "public",
        value: "public"
      },
      {
        name: "private (A count of the number of actively recorded podcasts will be displayed)",
        short: "private",
        value: "private"
      },
      {
        name: "custom (Pick a custom activity to display)",
        short: "custom",
        value: "custom"
      }
    ]
  });
  const answers = await inquirer.prompt(questions);

  const config = {
    podbot: {
      token: answers['token'].toString(),
      podcastPath: answers['podcastPath'].toString(),
      controllers: {
        roles: answers['controllerRoles'].toString().split(',').filter(role => role.length > 0),
        users: answers['controllerUsers'].toString().split(',').filter(role => role.length > 0)
      },
      commandPrefix: answers['commandPrefix'].toString(),
      presence: {
        type: answers['presenceType'].toString()
      },
      postProcess: {
        format: answers['outputFormat'].toString()
      }
    },
    timeout: parseInt(answers['timeout'], 10),
    sanitizeLogs: !!answers['sanitizeLogs']
  };

  if (answers['presenceType'] === 'custom') {
    const answers2 = await inquirer.prompt([
      {
        type: 'input',
        name: 'presenceCustomNone',
        message: 'Custom activity when podbot is not recording any podcasts:',
        default: 'you'
      },
      {
        type: 'input',
        name: 'presenceCustomSingle',
        message: 'Custom activity when podbot is recording one podcast:',
        default: 'the neighbour'
      },
      {
        type: 'input',
        name: 'presenceCustomMultiple',
        message: 'Custom activity when podbot is recording multiple podcasts:',
        default: 'many things'
      }
    ]);
    config.podbot.presence.activity = {
      none: answers2['presenceCustomNone'],
      single: answers2['presenceCustomSingle'],
      multiple: answers2['presenceCustomMultiple']
    }
  }

  await fs.writeJson(configPath, config, { spaces: '\t' });

  return config;
}

function run(config) {
  let podbot = new Podbot(config.podbot);
  let timeout = null;

  const uncrash = () => {
    if (timeout === null) {
      log.warn('Destroying podbot');
      podbot.destroy().then(() => {
        timeout = setTimeout(() => {
          log.warn('Recreating podbot');
          timeout = null;
          podbot = new Podbot(config.podbot);
        }, config.timeout);
      })
    }
  };

  process.on('unhandledRejection', (err) => {
    log.error(`Uncaught Promise Rejection: \n${err.stack || err}`);
    uncrash();
  });

  process.on('uncaughtException', (err) => {
    log.error(`Uncaught Exception: \n${err.stack || err}`);
    uncrash();
  });
}

async function init() {
  let config;
  try {
    if (args["env-config"]) {
      config = {
        podbot: {
          token: process.env.POD_TOKEN.trim(),
          podcastPath: process.env.POD_PODCAST_PATH || `.${path.sep}podcasts`,
          controllers: {
            roles: (process.env.POD_ROLES || 'podhandler').split(','),
            users: (process.env.POD_USERS || '').split(',')
          },
          commandPrefix: process.env.POD_PREFIX || '/',
          presence: {
            type: process.env.POD_PRESENCE_TYPE || 'public',
            activity: {
              none: process.env.POD_PRESENCE_ACTIVITY_NONE,
              single: process.env.POD_PRESENCE_ACTIVITY_SINGLE,
              multiple: process.env.POD_PRESENCE_ACTIVITY_MULTIPLE
            }
          },
          postProcess: {
            format: process.env.POD_OUTPUT_FORMAT || outputFormats.WAV
          }
        },
        timeout: parseInt(process.env.POD_TIMEOUT) || 10000,
        sanitizeLogs: process.env.POD_SANITIZE_LOGS === 'true'
      }
    } else {
      config = await fs.readJson(configPath);
    }
  } catch (err) {
    // Don't care about err, it just means there isn't a valid config file available
    config = await promptConfigCreation();
  }
  makeRelativePathsAbsolute(config);
  log.sanitize = config.sanitizeLogs;
  run(config);
}

var http = require('http');
var port =  process.env.PORT || 8080;

http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end('{"status":"OK"}');
}).listen(port, '0.0.0.0');

init();

