export interface GraphMessage {
  id: string;
  subject?: string;
  parentFolderId?: string;
  flag?: { flagStatus: string };
  from?: { emailAddress?: { name?: string; address?: string } };
}

export interface GraphMessageList {
  value?: GraphMessage[];
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
