export async function run(ctx) {
  const clipboard = await ctx.clipboard.readText();
  if (!clipboard.trim()) throw Object.assign(new Error('剪贴板中没有文字，请先复制内容。'), { code: 'E_CLIPBOARD_EMPTY' });
  const text = `${ctx.config.prefix}\n请求：${ctx.request.title}\n\n${clipboard}`;
  return { text, attachments: [{ name: '现场记录.txt', mime: 'text/plain', bytes: new TextEncoder().encode(text) }] };
}
