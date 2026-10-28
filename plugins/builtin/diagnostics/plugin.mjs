export async function run(ctx) {
  const info = await ctx.systemInfo(), text = JSON.stringify(info, null, 2);
  return { text, attachments: [{ name: '环境信息.txt', mime: 'text/plain', bytes: new TextEncoder().encode(text) }] };
}
