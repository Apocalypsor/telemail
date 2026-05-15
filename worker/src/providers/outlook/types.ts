export interface GraphMessage {
  id: string;
  subject?: string;
  internetMessageId?: string;
  internetMessageHeaders?: GraphInternetMessageHeader[];
  parentFolderId?: string;
  flag?: { flagStatus: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
}

export interface GraphInternetMessageHeader {
  name?: string;
  value?: string;
}

export interface GraphMessageList {
  value?: GraphMessage[];
  "@odata.nextLink"?: string;
}

export interface GraphFolder {
  id: string;
}

export interface GraphAttachment {
  "@odata.type"?: string;
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
}

export interface GraphAttachmentList {
  value?: GraphAttachment[];
  "@odata.nextLink"?: string;
}
