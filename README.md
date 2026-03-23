## Description

The live chat service for the ToGezzer app.

## Project setup

```bash
$ npm install
```

Create a `.env` file and use the `.env.example` as an example.

## Compile and run the project

First, start a RabbitMQ instance with docker (must match the values in your .env) :
```bash
$ docker run -d --hostname my-rabbit --name some-rabbit -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

Then run the app :
```bash
# development 
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```
