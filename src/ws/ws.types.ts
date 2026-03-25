export type MessageContent = {
  type?: string;
  value?: string;
};

export type IncomingMessagePayload = {
  roomId?: string;
  authorId?: string;
  answerTo?: string;
  // state?: string;
  content?: MessageContent;
};
