import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'dark' | 'light';
const KEY = 'sc-theme';

const apply = (t: Theme) => {
  document.documentElement.classList.toggle('light', t === 'light');
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'light' ? '#F5F4F2' : '#0B0B0F');
};

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    apply(theme);
    try { localStorage.setItem(KEY, theme); } catch {}
  }, [theme]);
  const btn = (t: Theme, Icon: typeof Sun, label: string) => (
    <button type="button" onClick={() => setTheme(t)} aria-label={label} aria-pressed={theme === t}
      className={`w-8 h-8 rounded-full grid place-items-center transition-all ${theme === t ? 'btn-brand text-white' : 'text-gray-500 hover:text-white'}`}>
      <Icon className="w-4 h-4" />
    </button>
  );
  return (
    <div role="group" aria-label="Theme" className="flex p-1 rounded-full bg-gray-800 border border-gray-700">
      {btn('light', Sun, 'Light mode')}
      {btn('dark', Moon, 'Dark mode')}
    </div>
  );
};
