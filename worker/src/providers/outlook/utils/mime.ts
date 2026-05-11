import { http } from "@worker/clients/http";
import { MS_GRAPH_API } from "@worker/constants";

/** 获取邮件的原始 MIME 内容 */
export const fetchRawMime = async (
  token: string,
  messageId: string,
): Promise<ArrayBuffer> => {
  return http
    .get(`${MS_GRAPH_API}/me/messages/${messageId}/$value`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .arrayBuffer();
};
