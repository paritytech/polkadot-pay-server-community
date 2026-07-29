// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';

/** 32px square control in the shell rail footer, per Dashboard.dc.html. */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      title="Toggle theme"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-grid h-8 w-8 cursor-pointer place-items-center rounded-small text-secondary transition-colors hover:bg-action-secondary-hover hover:text-primary"
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
    </button>
  );
}
