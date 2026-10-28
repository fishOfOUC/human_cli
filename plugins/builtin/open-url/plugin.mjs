export async function run(ctx) { await ctx.openUrl(ctx.config.url); return { text: `已打开：${ctx.config.url}` }; }
