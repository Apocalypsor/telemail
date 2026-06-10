import type { MessageStructureObject } from "imapflow";

const structureFilename = (node: MessageStructureObject): string | null => {
  return (
    node.dispositionParameters?.filename ??
    node.parameters?.name ??
    node.description ??
    null
  );
};

const isInlineStructure = (node: MessageStructureObject): boolean => {
  const disposition = node.disposition?.toLowerCase();
  return (
    disposition?.startsWith("inline") === true ||
    (!!node.id && node.type.toLowerCase().startsWith("image/"))
  );
};

export const collectVisibleAttachmentParts = (
  node: MessageStructureObject,
  result: MessageStructureObject[] = [],
): MessageStructureObject[] => {
  if (!node) return result;

  const filename = structureFilename(node);
  if (node.part && filename && !isInlineStructure(node)) {
    result.push(node);
  }

  if (node.childNodes) {
    for (const child of node.childNodes) {
      collectVisibleAttachmentParts(child, result);
    }
  }
  return result;
};

export const attachmentStructureFilename = (
  node: MessageStructureObject,
): string | null => {
  return structureFilename(node);
};
