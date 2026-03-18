import ky from 'ky';

/** 全局 HTTP 客户端，默认不重试，需要重试的调用方自行覆盖 retry */
export const http = ky.create({ retry: 0 });
