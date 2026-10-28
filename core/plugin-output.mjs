import { fail } from './errors.mjs';

export function validateReplyText(value) {
  fail(value === undefined || (typeof value === 'string' && value.length <= 2000), 'E_PLUGIN_REPLY_TEXT', '插件 replyText 必须是不超过 2000 字符的文字。');
  return value;
}
