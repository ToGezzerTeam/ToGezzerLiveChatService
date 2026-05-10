import { io } from 'socket.io-client';

type JoinPayload = {
  roomId: string;
  userId: string;
};

type TogglePayload = {
  isMuted: boolean;
};

const serverUrl =
  process.env.VOICE_CHAT_URL ?? 'http://localhost:3000/voice-chat';
const roomId = process.env.ROOM_ID ?? 'room-1';
const userId = process.env.USER_ID ?? 'user-1';

const socket = io(serverUrl, {
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('connected', socket.id);

  const joinPayload: JoinPayload = { roomId, userId };
  socket.emit('joinVoiceRoom', joinPayload);

  setTimeout(() => {
    const payload: TogglePayload = { isMuted: true };
    socket.emit('toggleMic', payload);
  }, 500);

  setTimeout(() => {
    const payload: TogglePayload = { isMuted: true };
    socket.emit('toggleSong', payload);
  }, 1000);

  setTimeout(() => {
    socket.emit('leaveVoiceRoom');
  }, 1500);

  setTimeout(() => {
    socket.disconnect();
  }, 2000);
});

socket.on('joinedVoiceRoom', (payload) => {
  console.log('joinedVoiceRoom', payload);
});

socket.on('userJoined', (payload) => {
  console.log('userJoined', payload);
});

socket.on('userMediaStateChanged', (payload) => {
  console.log('userMediaStateChanged', payload);
});

socket.on('userLeft', (payload) => {
  console.log('userLeft', payload);
});

socket.on('error', (payload) => {
  console.error('error', payload);
});

socket.on('disconnect', (reason) => {
  console.log('disconnect', reason);
});
