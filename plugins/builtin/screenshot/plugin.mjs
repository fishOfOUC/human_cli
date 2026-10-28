export async function run(ctx) {
  const image = await ctx.captureScreen({ display: ctx.config.display, delayMs: ctx.config.delayMs });
  return { text: '屏幕已截取。', attachments: [{ name: '屏幕截图.png', mime: 'image/png', bytes: image }] };
}
