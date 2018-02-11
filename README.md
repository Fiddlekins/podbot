# podbot
A Discord bot designed to record voice chat audio, aimed at recording a specific podcast.

Click [here](https://discordapp.com/oauth2/authorize?client_id=270724051234717698&scope=bot&permissions=133237760) to add my instance of it.

It's worth noting that you'll need to host the bot yourself if you want access to the recording it makes - if you just use my instance you rely on me giving you the audio it generates.

### GIB PODCAST NAO
~~Someone has actually adapted this project and wrapped it up in a user-friendly package.  
Go take a look at [podframe](https://podframe.com/) if you want to be able to just add a bot
and start recording.~~

~~(This is made by some chap by the name of _leanon over on this [reddit thread](https://www.reddit.com/r/discordapp/comments/6733u8/i_made_a_discord_bot_which_lets_you_record_a/?st=j1yqjsv8&sh=d25c1299))~~

Podframe is ded, you'll need to run your own podbot.

### The current commands are:
- `/podon` - The bot joins the voice channel the command user is in and starts recording
- `/podoff` - The bot stops recording and leaves the voice channel
  
The bot will generate audio fragments saved to `podbot\podcasts\<channelId-timestamp>.opus_string`. 

These can be decoded and reassembled by running `npm run process` and picking the desired podcast session from the list.

If you've got the podcast recording folder in a non-standard location you can process it by running `npm run process <path to podcast directory>`.

This will generate a file for each recorded user with their discord ID as the filename.
These files can then be imported into your favourite audio software (such as audacity) side by side and everything should line up on the timeline nicely.

The output is signed 16-bit little endian PCM at 48KHz with 2 channels.
Use the following options when importing into Audacity:

![Audacity import options](./images/audacityImportOptions.png)

Once you've imported all the different user tracks you can then export in your audio format of choice.

## You want your own?
Then clone this repo and do the thing with the discord and the applications.

You will need to place a text file called 'token' in the root of the bot containing just the login token for your bot.

You will also need to place a text file called 'controllers' in the same place containing whitespace separated user IDs in order for anyone to be able to control the bot.
