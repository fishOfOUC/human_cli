// Local acceptance fixtures only: never installed by the product or packaged.
import Ajv from 'ajv';
import { setTimeout as delay } from 'node:timers/promises';
import { startWebConfigProvider, webManifest } from './web-config-provider.mjs';

export const acceptanceManifests = [
  { ...webManifest, id: 'acceptance.web', name: '网页配置', icon: 'notebook-pen', description: '右键打开插件自己的网页，修改文字、颜色和大小并保存；左键直接执行，结果显示当前配置。' },
  {
    apiVersion: 1, id: 'acceptance.simple', version: '1', name: '简单配置', side: 'right', icon: 'terminal',
    description: '右键展开工具设置，修改表单并保存；左键直接执行。', configUi: { type: 'schema' },
    configSchema: { type: 'object', additionalProperties: false, properties: {
      message: { type: 'string', title: '输出文字', minLength: 1, maxLength: 120, default: '简单配置已经生效。' },
      repeat: { type: 'integer', title: '重复次数（1–3）', minimum: 1, maximum: 3, default: 1 },
      format: { type: 'string', title: '输出格式', enum: ['原文', '加方括号'], default: '原文' },
      showCounter: { type: 'boolean', title: '显示运行次数', default: true },
    }, required: ['message', 'repeat', 'format', 'showCounter'] },
  },
  {
    apiVersion: 1, id: 'acceptance.none', version: '1', name: '无需配置', side: 'right', icon: 'check',
    description: '左键立即执行并计数；右键查看结果，无需填写任何配置。', configUi: { type: 'none' },
    configSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
];

export async function startAcceptanceProvider() {
  const ajv = new Ajv({ useDefaults: true, allErrors: true }), counters = new Map();
  const validators = new Map(acceptanceManifests.map((m) => [m.id, ajv.compile(m.configSchema)]));
  return startWebConfigProvider({ manifest: acceptanceManifests[0], plugins: acceptanceManifests,
    async execute(id, { config }, { signal }) {
      const validate = validators.get(id), value = structuredClone(config);
      if (!validate || !validate(value)) throw Object.assign(new Error('测试插件配置无效。'), { code: 'E_TEST_CONFIG' });
      await delay(450, undefined, { signal });
      const count = (counters.get(id) || 0) + 1; counters.set(id, count);
      if (id === 'acceptance.web') return { text: `网页配置 · 第 ${count} 次\n文字：${value.label}\n颜色：${value.color}\n预览大小：${value.scale} 倍` };
      if (id === 'acceptance.simple') {
        const line = value.format === '加方括号' ? `[${value.message}]` : value.message;
        return { text: (value.showCounter ? `简单配置 · 第 ${count} 次\n` : '') + Array(value.repeat).fill(line).join('\n') };
      }
      return { text: `无需配置 · 第 ${count} 次\n按钮已成功执行，无需打开配置页面。` };
    },
  });
}
