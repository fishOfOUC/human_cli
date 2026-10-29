import {
  createIcons, NotebookPen, Plus, ChevronRight, StickyNote, Pin, Minus, X,
  Grip, RotateCcw, Info, ExternalLink, Copy, ScanLine, Terminal, RotateCw,
  LoaderCircle, CircleAlert, Check, CornerDownLeft, ImagePlus, Bot,
  FileWarning, Sun, Moon, Download, PinOff, ArrowLeft, Puzzle, FileText, Settings, Send,
} from 'lucide';

const icons = {
  NotebookPen, Plus, ChevronRight, StickyNote, Pin, Minus, X, Grip,
  RotateCcw, Info, ExternalLink, Copy, ScanLine, Terminal, RotateCw,
  LoaderCircle, CircleAlert, Check, CornerDownLeft, ImagePlus, Bot,
  FileWarning, Sun, Moon, Download, PinOff, ArrowLeft, Puzzle, FileText, Settings, Send,
};

export const $ = (selector, root = document) => root.querySelector(selector);
export const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
export const icon = (name, cls = '') => {
  const key = typeof name === 'string' ? name.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join('') : '';
  return `<i data-lucide="${icons[key] ? esc(name) : 'puzzle'}" class="${esc(cls)}" aria-hidden="true"></i>`;
};
export const refreshIcons = () => createIcons({ icons, attrs: { 'aria-hidden': 'true' } });
export const states = { idle: '待运行', running: '运行中', success: '已完成', error: '出错' };
export const stateBadge = (state) => `<span class="state ${state}"><span class="state-dot"></span>${states[state]}</span>`;
