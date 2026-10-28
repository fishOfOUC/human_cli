export const themes = [
  { id: 'paper', name: '纸黄', color: '#fff4c9' },
  { id: 'sage', name: '雾绿', color: '#eaf1df' },
  { id: 'light', name: '浅色', color: '#fafbf7' },
  { id: 'dark', name: '深色', color: '#292d28' },
];
export function applyTheme(id) { document.documentElement.dataset.theme = themes.some((t) => t.id === id) ? id : 'paper'; }
