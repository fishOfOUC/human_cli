export const themes = [
  { id: 'paper', name: '纸黄', color: '#fff5d2' },
  { id: 'sage', name: '雾绿', color: '#eaf1df' },
  { id: 'light', name: '浅色', color: '#ffffff' },
  { id: 'dark', name: '深色', color: '#242424' },
];
export function applyTheme(id) { document.documentElement.dataset.theme = themes.some((t) => t.id === id) ? id : 'light'; }
