# Heroku

## Container
```
heroku config:set POD_TOKEN=joesmith -a bot-recorder
heroku config:set POD_USERS=admin -a bot-recorder

heroku stack:set container -a bot-recorder
```

## Scaling
```
heroku ps:scale web=0 -a bot-recorder
```
## Debug
```
heroku run bash -a bot-recorder
```
