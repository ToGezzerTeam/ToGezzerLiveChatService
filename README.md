## Description

The live chat service for the ToGezzer app.

## Project setup

```bash
$ npm install
```

Create a `.env` file and use the `.env.example` as an example.

## WebSocket authentication

This service expects a JWT on WebSocket messages. Provide it either:
- in the Socket.IO auth payload: `auth: { token: "<jwt>" }`
- or in the `Authorization: Bearer <jwt>` header

The JWT secret and optional issuer/audience are configured via:
- `JWT_SECRET`
- `JWT_ISSUER`
- `JWT_AUDIENCE`

Example Socket.IO client:

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
	token: '<jwt>',
  },
});

socket.emit('message', { text: 'Hello' });
socket.on('response', (data) => {
  console.log('response', data);
});
```

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
