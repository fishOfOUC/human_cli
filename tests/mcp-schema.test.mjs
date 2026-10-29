import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import Ajv from 'ajv';
import { createSchema, updateSchema } from '../core/schemas.mjs';
import { createMcpInputContract } from '../adapters/mcp-schema.mjs';

const shape = { ...createSchema.shape, background: z.boolean().default(false), format: z.enum(['json', 'legacy']).default('json') };
const contract = createMcpInputContract(shape);
const ajv = new Ajv({ strict: false });
const accepts = ajv.compile(contract.inputSchema);
const nullableInput = () => Object.fromEntries(Object.keys(shape).map((key) => [key, key === 'title' ? '检查兼容' : null]));

function assertStrict(schema) {
  const allowed = new Set(['type', 'description', 'enum', 'anyOf', 'properties', 'required', 'additionalProperties', 'items']);
  for (const key of Object.keys(schema)) assert.ok(allowed.has(key), `Unexpected schema keyword ${key}`);
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, Object.keys(schema.properties));
    Object.values(schema.properties).forEach(assertStrict);
  }
  if (schema.items) assertStrict(schema.items);
  if (schema.anyOf) schema.anyOf.forEach(assertStrict);
}

test('model-facing schema is closed, fully required/nullable and free of validation-only keywords', () => {
  assertStrict(contract.inputSchema);
  assert.ok(accepts(nullableInput()), JSON.stringify(accepts.errors));
  const plain = createMcpInputContract({}).inputSchema;
  assert.deepEqual(plain, { type: 'object', properties: {}, required: [], additionalProperties: false });
});

test('omitted and strict null optional inputs retain identical defaults and plugin selection semantics', () => {
  const old = contract.validation.parse({ title: '检查兼容' });
  assert.deepEqual(contract.validation.parse(nullableInput()), old);
  assert.equal(old.background, false); assert.equal(old.format, 'json'); assert.equal(old.agent, 'AI Agent');
  assert.equal(old.plugins, undefined);
  assert.deepEqual(contract.validation.parse({ ...nullableInput(), plugins: [] }).plugins, []);
});

test('optional client blank-string placeholders use defaults without inventing an idempotency key', () => {
  for (const empty of ['', '  \t']) {
    const parsed = contract.validation.parse({ title: '客户端空串', agent: empty, idempotencyKey: empty, format: empty, plugins: [{ id: 'capture', plugin: 'human.screenshot', side: empty, config: empty }] });
    assert.equal(parsed.agent, 'AI Agent'); assert.equal(parsed.idempotencyKey, undefined); assert.equal(parsed.format, 'json');
    assert.equal(parsed.plugins[0].side, undefined); assert.deepEqual(parsed.plugins[0].config, {});
  }
  const explicit = contract.validation.parse({ title: 'x', agent: '自定义 Agent', idempotencyKey: ' shared-key ', plugins: [{ id: 'p', plugin: 'example.custom', config: '{"agent":"","idempotencyKey":"","format":"","nested":{"value":""}}' }] });
  assert.equal(explicit.agent, '自定义 Agent'); assert.equal(explicit.idempotencyKey, ' shared-key ');
  assert.deepEqual(explicit.plugins[0].config, { agent: '', idempotencyKey: '', format: '', nested: { value: '' } });
  assert.equal(contract.validation.safeParse({ title: '', agent: '', idempotencyKey: '' }).success, false);
  assert.equal(contract.validation.safeParse({ title: 'x', plugins: [{ id: '', plugin: 'human.screenshot', side: '', config: '' }] }).success, false);
});

test('arbitrary plugin configuration accepts JSON text and legacy objects without deleting nested null values', () => {
  const config = { nullable: null, array: [null, { default: null }], nested: { format: 'custom', arbitraryKey: 42 }, enabled: false };
  for (const value of [config, JSON.stringify(config)]) {
    const parsed = contract.validation.parse({ ...nullableInput(), plugins: [{ id: 'custom', plugin: 'example.custom', side: null, config: value }] });
    assert.deepEqual(parsed.plugins[0].config, config); assert.equal(parsed.plugins[0].side, undefined);
  }
  assert.deepEqual(contract.validation.parse({ ...nullableInput(), plugins: [{ id: 'custom', plugin: 'example.custom', side: null, config: null }] }).plugins[0].config, {});
});

test('plugin JSON rejects non-objects and malformed data with a precise validation path', () => {
  for (const value of ['[]', 'null', '123', 'false', '"text"', '{bad', '{} trailing']) {
    const result = contract.validation.safeParse({ title: 'x', plugins: [{ id: 'custom', plugin: 'example.custom', config: value }] });
    assert.equal(result.success, false, value);
    assert.deepEqual(result.error.issues[0].path, ['plugins', 0, 'config']);
  }
});

test('original UUID, ranges, title, plugin identifiers and array limits still reject invalid input', () => {
  const idContract = createMcpInputContract({ requestId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) });
  for (const value of [{ requestId: 'invalid' }, { requestId: null }, { requestId: '28b45b5c-aefc-48fa-b38d-facaa611ff50', limit: 0 }, { requestId: '28b45b5c-aefc-48fa-b38d-facaa611ff50', limit: 201 }]) assert.equal(idContract.validation.safeParse(value).success, false);
  assert.equal(contract.validation.safeParse({ title: '  ' }).success, false);
  assert.equal(contract.validation.safeParse({ title: 'x'.repeat(501) }).success, false);
  assert.equal(contract.validation.safeParse({ title: 'x', steps: Array(31).fill('step') }).success, false);
  assert.equal(contract.validation.safeParse({ title: 'x', plugins: [{ id: '../invalid', plugin: 'p' }] }).success, false);
});

test('update null means leave unchanged while empty strings/arrays remain explicit updates', () => {
  const update = createMcpInputContract({ requestId: z.string().uuid(), version: z.number().int().positive(), patch: updateSchema });
  assertStrict(update.inputSchema);
  const parsed = update.validation.parse({ requestId: '28b45b5c-aefc-48fa-b38d-facaa611ff50', version: 1, patch: { title: null, description: '', steps: [], context: null, expectation: null, project: null } });
  assert.deepEqual(parsed.patch, { description: '', steps: [] });
  assert.deepEqual(updateSchema.parse({ title: '只改标题' }), { title: '只改标题' });
  assert.equal(update.validation.safeParse({ requestId: parsed.requestId, version: null, patch: {} }).success, false);
});
