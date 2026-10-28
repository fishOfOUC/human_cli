import { z } from 'zod';
export const bindingSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  plugin: z.string().regex(/^[a-z][a-z0-9.-]{0,127}$/),
  side: z.enum(['left', 'right']).optional(), config: z.record(z.string(), z.unknown()).default({}),
});
export const createSchema = z.object({
  title: z.string().trim().min(1).max(500), description: z.string().max(20000).default(''),
  steps: z.array(z.string().max(2000)).max(30).default([]),
  context: z.string().max(30000).default(''), expectation: z.string().max(5000).default(''),
  agent: z.string().min(1).max(100).default('AI Agent'), project: z.string().max(300).default(''),
  plugins: z.array(bindingSchema).max(20).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export const updateSchema = z.object({
  title: createSchema.shape.title.optional(), description: createSchema.shape.description.optional(),
  steps: createSchema.shape.steps.optional(), context: createSchema.shape.context.optional(),
  expectation: createSchema.shape.expectation.optional(), project: createSchema.shape.project.optional(),
});
export const themes = ['paper', 'sage', 'light', 'dark'];
