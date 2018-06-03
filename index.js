'use strict';

const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const log = require('./js/log.js');
const outputFormats = require('./js/outputFormats.js');
const { makeRelativePathsAbsolute } = require('./js/utils.js');
const Podbot = require('./js/Podbot.js');
const argv = require('yargs').argv;

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
		name: 'game',
		message: 'The game podbot should display as playing:',
		default: ''
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
			game: answers['game'].toString()
		},
		postProcess: {
			format: answers['outputFormat'].toString()
		},
		timeout: parseInt(answers['timeout'], 10),
		sanitizeLogs: !!answers['sanitizeLogs']
	};

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
		if (argv["env-config"]) {
			config = {
				podbot: {
					token: process.env.POD_TOKEN.trim(),
					podcastPath: process.env.POD_PODCAST_PATH,
					controllers: {
						roles: process.env.POD_ROLES.split(','),
						users: process.env.POD_USERS.split(',')
					},
					commandPrefix: process.env.POD_PREFIX,
					game: process.env.POD_GAME
				},
				postProcess: {
					format: process.env.POD_OUTPUT_FORMAT
				},
				timeout: parseInt(process.env.POD_TIMEOUT),
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

init();
