export type MessageContent = {
  type?: string;
  value?: string;
};

export type MessagePayload = {
  uuid: string;
  roomId: string;
  authorId: string;
  authorName: string;
  answerTo?: string;
  state: string;
  content: MessageContent;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
  deletedBy?: string;
};

export type UserPayload = {
  uuid: string;
  username: string;
  serverUuid: string;
};

export type ChannelType = 'TEXT' | 'VOICE';

export type StatusEvent = 'CREATED' | 'RENAME' | 'DELETED';

export interface RoomEventPayload {
  statusEvent: StatusEvent;
  id: number;
  uuid: string;
  name: string;
  channelType: ChannelType;
  serverUuid: string;
}
export interface UserMediaState {
  socketId: string;
  userId: string;
  roomId: string;
  serverId: string;
  username: string;
  isMicMuted: boolean;
  isSongMuted: boolean;
  producerTransportId?: string;
  consumerTransportId?: string;
  producers?: Map<'audio' | 'video', string>; // kind -> producerId
  consumers?: Map<string, string>; // producerId -> consumerId
}

export interface VocalRoomUser {
  userId: string;
  username: string;
}

export interface VocalUsersUpdateEvent {
  roomId: string;
  users: VocalRoomUser[];
}

export interface WebRtcTransportInfo {
  id: string;
  iceParameters: any;
  iceCandidates: any;
  dtlsParameters: any;
  sctpParameters?: any;
}

export interface ProducerInfo {
  id: string;
  kind: 'audio' | 'video';
  rtpParameters: any;
}

export interface ConsumerInfo {
  id: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: any;
  type: string;
}