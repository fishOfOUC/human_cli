export function makeSampleImage() {
  // Draw the demo's own sample settings screen. This is not an OS screenshot.
  const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 620;
  const c = canvas.getContext('2d'); c.fillStyle = '#222522'; c.fillRect(0, 0, 1000, 620);
  c.fillStyle = '#2c302b'; c.fillRect(0, 0, 1000, 62); c.fillRect(0, 62, 220, 558);
  c.font = '22px "Microsoft YaHei", sans-serif'; c.fillStyle = '#c0cab9'; c.fillText('Studio / 设置 / 外观', 27, 40);
  c.fillStyle = '#e5ece0'; c.font = '34px "Microsoft YaHei", sans-serif'; c.fillText('外观', 275, 139);
  c.font = '19px "Microsoft YaHei", sans-serif'; c.fillStyle = '#adb8a6'; c.fillText('让工作空间，更合你的习惯。', 275, 182);
  ['通用设置', '外观', '通知', '快捷键'].forEach((name, i) => { if (i === 1) { c.fillStyle = '#3b4436'; c.fillRect(16, 140, 188, 47); } c.fillStyle = i === 1 ? '#e5ece0' : '#adb8a6'; c.fillText(name, 35, 121 + i * 49); });
  c.fillStyle = '#e5ece0'; c.fillText('主题', 275, 248);
  c.strokeStyle = '#56654d'; c.lineWidth = 2; c.strokeRect(275, 274, 260, 112); c.strokeStyle = '#819a6b'; c.strokeRect(555, 274, 260, 112);
  c.fillText('浅色', 305, 340); c.fillText('深色（已选）', 585, 340);
  c.fillText('跟随系统强调色', 275, 449); c.fillStyle = '#617b51'; c.beginPath(); c.roundRect(760, 425, 55, 30, 15); c.fill(); c.fillStyle = '#e5ece0'; c.beginPath(); c.arc(798, 440, 10, 0, Math.PI * 2); c.fill();
  c.font = '16px "Microsoft YaHei", sans-serif'; c.fillStyle = '#95a38b'; c.fillText('Relay 演示截图 · 非真实屏幕采集', 275, 561);
  return { id: crypto.randomUUID(), name: '外观设置-示例.png', url: canvas.toDataURL('image/png') };
}
