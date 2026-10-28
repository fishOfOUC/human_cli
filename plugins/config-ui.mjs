import { fail } from '../core/errors.mjs';

const uuid = /^[a-f0-9-]{36}$/;
export function configUiDescriptor(value, providerUrl) {
  if (value?.type === 'none') return { type: 'none' };
  if (value === undefined || value?.type === 'schema') return { type: 'schema' };
  fail(value?.type === 'web' && typeof value.path === 'string' && value.path.startsWith('/') && !value.path.startsWith('//') && !value.path.includes('\\'), 'E_UI_MANIFEST', 'configUi 需要 type: web 和同源的绝对路径。');
  const provider = new URL(providerUrl), url = new URL(value.path, provider);
  fail(url.origin === provider.origin && !url.search && !url.hash && url.pathname !== '/', 'E_UI_MANIFEST', '配置页 path 必须是提供者同源路径，不含查询参数或片段。');
  return { type: 'web', path: url.pathname };
}
export function configUiUrl(value, descriptor, providerUrl, credential) {
  const url = new URL(value), provider = new URL(providerUrl);
  fail(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.origin === provider.origin && (url.pathname === descriptor.path || url.pathname.startsWith(descriptor.path.replace(/\/$/, '') + '/')), 'E_UI_URL', '配置页必须位于提供者同源的 configUi.path 下。');
  const parameters = [...url.searchParams.values(), ...new URLSearchParams(url.hash.slice(1)).values()];
  fail(!credential || !parameters.includes(credential), 'E_UI_CREDENTIAL', '配置页面不能复用 SPI 长期令牌作为会话凭据。');
  return url.href;
}
export function configUiStatus(value, sessionId) {
  fail(value?.sessionId === sessionId && ['editing', 'submitted', 'saved', 'closed'].includes(value.state), 'E_UI_PROTOCOL', '配置会话返回了无效状态。');
  if (value.state === 'submitted') {
    fail(uuid.test(value.submission?.id) && value.submission.config && typeof value.submission.config === 'object' && !Array.isArray(value.submission.config) && Buffer.byteLength(JSON.stringify(value.submission.config)) <= 256 * 1024, 'E_UI_PROTOCOL', '配置提交需要有效 ID 和不超过 256 KB 的对象。');
  }
  return value;
}
