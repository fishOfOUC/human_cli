import { z } from 'zod';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isOpenObject = (schema) => schema.type === 'object' && !schema.properties && schema.additionalProperties !== false;
const rootBlankDefaults = new Set(['agent', 'idempotencyKey', 'format']);
function isBlankPlaceholder(path, name, value) {
  if (typeof value !== 'string' || value.trim() !== '') return false;
  return path.length === 0 && rootBlankDefaults.has(name)
    || path.length === 2 && path[0] === 'plugins' && Number.isInteger(path[1]) && ['side', 'config'].includes(name);
}

function describeConstraints(schema) {
  const hints = [schema.description];
  if (schema.format) hints.push(`格式：${schema.format}`);
  if (schema.pattern) hints.push(`需匹配正则：${schema.pattern}`);
  for (const [keyword, label] of [['minLength', '最少字符数'], ['maxLength', '最多字符数'], ['minItems', '最少项数'], ['maxItems', '最多项数'], ['minimum', '最小值（含）'], ['maximum', '最大值（含）'], ['exclusiveMinimum', '必须大于'], ['exclusiveMaximum', '必须小于']]) {
    if (schema[keyword] !== undefined) hints.push(`${label}：${schema[keyword]}`);
  }
  return hints.filter(Boolean).join('；');
}

// Model-facing schemas and server validation have different jobs. Do not remove
// business constraints from the original Zod schemas to accommodate a client.
function modelSchema(schema, path = []) {
  if (isOpenObject(schema)) return {
    type: 'string',
    description: 'JSON 对象字符串，例如 {"message":"内容","options":{"enabled":true}}。保留任意插件字段和内部 null 值；旧客户端也可直接传对象。',
  };
  const output = {};
  const description = describeConstraints(schema);
  if (description) output.description = description;
  if (schema.type) output.type = schema.type;
  if (schema.enum) output.enum = schema.enum;
  if (schema.anyOf) output.anyOf = schema.anyOf.map((item) => modelSchema(item, path));
  if (schema.type === 'array') output.items = modelSchema(schema.items, [...path, 0]);
  if (schema.type === 'object') {
    const required = new Set(schema.required || []);
    output.properties = Object.fromEntries(Object.entries(schema.properties || {}).map(([name, property]) => {
      let projected = modelSchema(property, [...path, name]);
      if (!required.has(name)) {
        const fallback = Object.hasOwn(property, 'default') ? `；默认 ${JSON.stringify(property.default)}` : '';
        const { description, ...inner } = projected;
        const blank = isBlankPlaceholder(path, name, '') ? '空字符串或仅空白也按省略处理。' : '';
        projected = { anyOf: [inner, { type: 'null' }], description: `${description || ''}${description ? ' ' : ''}可省略或传 null${fallback}。${blank}` };
      }
      return [name, projected];
    }));
    output.required = Object.keys(output.properties);
    output.additionalProperties = false;
  }
  return output;
}

function normalizeInput(value, schema, path = []) {
  if (isOpenObject(schema)) {
    if (typeof value !== 'string') return value; // Preserve legacy object input.
    let parsed;
    try { parsed = JSON.parse(value); }
    catch { throw Object.assign(new Error('插件配置必须是有效的 JSON 对象字符串。'), { path }); }
    if (!isObject(parsed)) throw Object.assign(new Error('插件配置必须是 JSON 对象，不能是数组、null 或标量。'), { path });
    return parsed; // Do not normalize nulls inside arbitrary plugin values.
  }
  if (schema.type === 'array' && Array.isArray(value)) return value.map((item, index) => normalizeInput(item, schema.items, [...path, index]));
  if (schema.type !== 'object' || !isObject(value)) return value;
  const output = { ...value }, required = new Set(schema.required || []);
  for (const [name, property] of Object.entries(schema.properties || {})) {
    if (!Object.hasOwn(value, name)) continue;
    // Some clients/models fill optional strings with "". Only designated
    // placeholders mean omission; titles, UUIDs, patches and plugin values do not.
    if (!required.has(name) && (value[name] === null || isBlankPlaceholder(path, name, value[name]))) delete output[name];
    else output[name] = normalizeInput(value[name], property, [...path, name]);
  }
  return output;
}

export function createMcpInputContract(shape) {
  const validation = z.object(shape);
  const original = z.toJSONSchema(validation, { io: 'input' });
  return {
    inputSchema: modelSchema(original),
    validation: z.preprocess((value, context) => {
      try { return normalizeInput(value === undefined ? {} : value, original); }
      catch (error) { context.addIssue({ code: 'custom', message: error.message, path: error.path || [] }); return z.NEVER; }
    }, validation),
  };
}
