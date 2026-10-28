export async function run(ctx) { await ctx.clipboard.writeText(ctx.config.text); return { text: ctx.config.text }; }
