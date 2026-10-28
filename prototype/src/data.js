export const scenarios = [
  {
    id: 'appearance', name: '界面验收', category: '界面验证', project: 'Studio / 设置页重构',
    title: '帮我看看，\n深色界面是否正常。',
    description: '外观设置页已经改好了。有些细节，还是想请你亲眼看一下。',
    steps: ['打开「设置 → 外观」', '切换深色，检查文字和按钮', '看看有无错位，附图告诉我'],
    context: '我已完成主题样式调整，正在等待人工验收。收到你的回复后，我会继续处理发现的问题。',
    expectation: '告诉我显示是否正常；如果有问题，请指出具体位置。',
  },
  {
    id: 'captcha', name: '人机验证', category: '需要本人操作', project: '资料整理 / 访问验证',
    title: '帮我完成一次\n人机验证。',
    description: '网页出现了访问验证。请在原页面手动完成，再把接力棒交给我。',
    steps: ['切到需要验证的浏览器页面', '亲自完成页面上的人机验证', '页面打开后，标记完成即可'],
    context: '资料检索已暂停在访问验证页。验证通过后，我会从刚才的位置继续。',
    expectation: '验证成功可直接标记完成；如果仍无法访问，可以附图说明。',
  },
  {
    id: 'collection', name: '数据采集', category: '操作与采集', project: '桌面应用 / 异常排查',
    title: '复现一次问题，\n帮我留下现场。',
    description: '请在应用里重现刚才的异常，右侧工具可以帮你整理截图和诊断信息。',
    steps: ['进入应用里出现问题的页面', '按刚才的操作顺序复现异常', '附上截图、日志和操作顺序'],
    context: '静态检查未能复现异常，需要你提供操作现场。我会结合截图和日志继续定位。',
    expectation: '请描述操作顺序、实际表现与预期结果。',
  },
];

export const diagnosticError = 'E_CONNECTION_REFUSED\n无法连接本地采集服务 127.0.0.1:9222\n请确认采集服务已启动，然后重试。';

export function initialTools() {
  return [
    { id: 'preview', side: 'left', name: '目标页面', description: '外观设置 · 演示预览', icon: 'external-link', state: 'idle', action: 'preview' },
    { id: 'copy-path', side: 'left', name: '页面路径', description: '设置 / 外观', icon: 'copy', state: 'idle', action: 'copy' },
    { id: 'capture', side: 'right', name: '截取画面', description: '生成示例截图并附入回复。', icon: 'scan-line', state: 'idle', action: 'capture' },
    { id: 'logs', side: 'right', name: '采集诊断', description: '本地采集服务 · 演示连接状态', icon: 'terminal', state: 'error', action: 'logs', error: diagnosticError },
  ];
}

export function createTask(index = 0) {
  return {
    ...scenarios[index], instance: crypto.randomUUID(), number: index + 1,
    checks: [], reply: '', images: [], errors: [], tools: initialTools(), result: null,
    activePane: 'note', previousPane: 'note', previewTheme: 'light', accent: true,
    toolDraft: { name: '', description: '', side: 'left', outcome: 'success' },
  };
}
