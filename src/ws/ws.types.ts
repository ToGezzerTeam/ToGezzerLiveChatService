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
