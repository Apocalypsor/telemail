import type { MessageStructureObject } from "imapflow";

function structureFilename(node: MessageStructureObject): string | null {
  return (
    node.dispositionParameters?.filename ??
    node.parameters?.name ??
    node.description ??
    null
  );
}

function isInlineStructure(node: MessageStructureObject): boolean {
  const disposition = node.disposition?.toLowerCase();
  return (
    disposition?.startsWith("inline") === true ||
    (!!node.id && node.type.toLowerCase().startsWith("image/"))
  );
}

export function collectVisibleAttachmentParts(
  node: MessageStructureObject,
  result: MessageStructureObject[] = [],
): MessageStructureObject[] {
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
}

export function attachmentStructureFilename(
  node: MessageStructureObject,
): string | null {
  return structureFilename(node);
}
