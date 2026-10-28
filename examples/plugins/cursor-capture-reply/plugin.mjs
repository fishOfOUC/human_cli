export async function run(ctx) {
  const message = ctx.config.message.trim();
  if (!message) throw new Error('请输入附言内容。');
  const bytes = await ctx.captureScreen({ display: 'cursor', delayMs: ctx.config.delayMs });
  return {
    text: message,
    replyText: message,
    attachments: [{ name: '鼠标所在屏幕.png', mime: 'image/png', bytes }],
  };
}
