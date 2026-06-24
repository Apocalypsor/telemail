export class EmailMessageNotFoundError extends Error {
  readonly folder: string;
  readonly messageId: string;

  constructor(messageId: string, folder: string) {
    super(`Message-Id not found in ${folder}: ${messageId}`);
    this.name = "EmailMessageNotFoundError";
    this.folder = folder;
    this.messageId = messageId;
  }
}
