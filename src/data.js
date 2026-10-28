export const scenarios = [
  {
    id: 'appearance', name: '界面验收', category: '界面验证', project: 'Studio / 设置页重构',
    title: '帮我确认一下，\n新界面的显示效果。',
    description: '外观设置页已经改好了。有些细节，还是想请你亲眼看一下。',
    steps: ['打开预览，进入「设置 → 外观」页面', '切换到深色主题，看看文字和按钮是否清晰', '确认没有遮挡或错位，附一张截图就更好了'],
    context: '我已完成主题样式调整，正在等待人工验收。收到你的回复后，我会继续处理发现的问题。',
    expectation: '告诉我显示是否正常；如果有问题，请指出具体位置。',
  },
  {
    id: 'captcha', name: '人机验证', category: '需要本人操作', project: '资料整理 / 访问验证',
    title: '这里需要你，\n完成一次人机验证。',
    description: '网页出现了访问验证。请在原页面手动完成，再把接力棒交给我。',
    steps: ['切换到需要验证的浏览器标签页', '亲自完成页面上的人机验证', '确认页面已正常打开，点击「仅完成」即可'],
    context: '资料检索已暂停在访问验证页。验证通过后，我会从刚才的位置继续。',
    expectation: '验证成功可直接标记完成；如果仍无法访问，可以附图说明。',
  },
  {
    id: 'collection', name: '数据采集', category: '操作与采集', project: '桌面应用 / 异常排查',
    title: '复现一次问题，\n帮我留下现场。',
    description: '请在应用里重现刚才的异常，右侧工具可以帮你整理截图和诊断信息。',
    steps: ['打开应用，进入出现问题的页面', '按刚才的操作顺序复现异常', '附上截图与错误信息，告诉我在哪里出现'],
    context: '静态检查未能复现异常，需要你提供操作现场。我会结合截图和日志继续定位。',
    expectation: '请描述操作顺序、实际表现与预期结果。',
  },
];

export const diagnosticError = 'E_CONNECTION_REFUSED\n无法连接本地采集服务 127.0.0.1:9222\n请确认采集服务已启动，然后重试。';

export function initialTools() {
  return [
    { id: 'preview', side: 'left', name: '打开目标页面', description: '外观设置 · 演示预览', icon: 'external-link', state: 'idle', action: 'preview' },
    { id: 'copy-path', side: 'left', name: '复制页面路径', description: '设置 / 外观', icon: 'copy', state: 'idle', action: 'copy' },
    { id: 'capture', side: 'right', name: '截取画面', description: '生成示例截图并附入回复', icon: 'scan-line', state: 'idle', action: 'capture' },
    { id: 'logs', side: 'right', name: '采集诊断', description: '本地采集服务', icon: 'terminal', state: 'error', action: 'logs', error: diagnosticError },
  ];
}

export function createTask(index = 0) {
  return { ...scenarios[index], instance: crypto.randomUUID(), number: index + 1, checks: [], reply: '', images: [], errors: [], tools: initialTools(), result: null, contextOpen: false };
}
