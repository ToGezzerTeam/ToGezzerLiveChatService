export type MessageContent = {
  type?: string;
  value?: string;
};

export type MessagePayload = {
  uuid: string;
  roomId: string;
  authorId: string;
  answerTo?: string;
  state: string;
  content: MessageContent;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
  deletedBy?: string;
};

export interface UserMediaState {
  socketId: string;
  userId: string;
  roomId: string;
  isMicMuted: boolean;
  isSongMuted: boolean;
  producerTransportId?: string;
  consumerTransportId?: string;
  producers?: Map<'audio' | 'video', string>; // kind -> producerId
  consumers?: Map<string, string>; // producerId -> consumerId
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