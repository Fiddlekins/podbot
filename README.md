# podbot
A Discord bot designed to record voice chat audio, aimed at recording a specific podcast.

Click [here](https://discordapp.com/oauth2/authorize?client_id=270724051234717698&scope=bot&permissions=133237760) to add my instance of it.

### The current commands are:
- `/podon` - The bot starts recording
- `/podoff` - The bot stops recording
  
The bot will generate audio fragments saved to `podbot\podcasts\<channelId-timestamp>`. These will need to be reassembled using the processFragments.js file in the following fashion:

`node processFragments.js <name of the folder containing the podcast session you want processed>`

This will generate a file for each recorded user with their id as the filename. These files can then be imported into your favourite audio software (such as audacity) side by side and everything should line up on the timeline nicely.

It's worth noting that you'll need to host the bot yourself if you want access to the recording it makes - if you just use my instance you rely on me giving you the audio it generates.

## You want your own?
Then clone this repo and do the thing with the discord and the applications.

You will need to place a text file called 'token' in the root of the bot containing just the login token for your bot.

You will also need to place a text file called 'controllers' in the same place containing whitespace separated user IDs in order for anyone to be able to control the bot.
