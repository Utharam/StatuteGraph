import { useState, useEffect, useCallback } from 'react';
import { ThemeMode, FontSize, ReaderSettings, SideViewTab } from '../types/akn';

const SETTINGS_STORAGE_KEY = 'akn_reader_settings_v2';

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'parchment',
  fontSize: 'base',
  serifFont: true,
  isSideViewPinned: false,
  isSideViewOpen: false,
  isTocOpen: true,
  sideViewTab: 'provision',
};

const THEMES: ThemeMode[] = ['parchment', 'slate', 'dark'];
const FONT_SIZES: FontSize[] = ['sm', 'base', 'lg', 'xl'];
const TABS: SideViewTab[] = ['provision', 'backlinks', 'nest'];

/**
 * Validates anything read back from localStorage.
 *
 * A hand-edited or stale settings blob used to flow straight into Tailwind class
 * lookups, so a bad value such as `fontSize: "jumbo"` produced the literal
 * class name "undefined".
 */
function loadSettings(): ReaderSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(stored) as Partial<ReaderSettings>;
    return {
      theme: THEMES.includes(parsed.theme as ThemeMode) ? parsed.theme! : DEFAULT_SETTINGS.theme,
      fontSize: FONT_SIZES.includes(parsed.fontSize as FontSize)
        ? parsed.fontSize!
        : DEFAULT_SETTINGS.fontSize,
      serifFont: typeof parsed.serifFont === 'boolean' ? parsed.serifFont : DEFAULT_SETTINGS.serifFont,
      isSideViewPinned:
        typeof parsed.isSideViewPinned === 'boolean' ? parsed.isSideViewPinned : DEFAULT_SETTINGS.isSideViewPinned,
      isSideViewOpen:
        typeof parsed.isSideViewOpen === 'boolean' ? parsed.isSideViewOpen : DEFAULT_SETTINGS.isSideViewOpen,
      isTocOpen: typeof parsed.isTocOpen === 'boolean' ? parsed.isTocOpen : DEFAULT_SETTINGS.isTocOpen,
      sideViewTab: TABS.includes(parsed.sideViewTab as SideViewTab)
        ? parsed.sideViewTab!
        : DEFAULT_SETTINGS.sideViewTab,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be unavailable in private mode; settings just won't persist.
    }

    const root = document.documentElement;
    root.classList.remove('theme-parchment', 'theme-slate', 'theme-dark', 'dark');

    if (settings.theme === 'dark') {
      root.classList.add('theme-dark', 'dark');
    } else if (settings.theme === 'slate') {
      root.classList.add('theme-slate');
    } else {
      root.classList.add('theme-parchment');
    }
  }, [settings]);

  // Stable identities. Every setter is passed into memoised components, so a
// fresh function identity on each render would defeat the memo and force a full
// re-render of the reading canvas on every scroll event.
const setTheme = useCallback((theme: ThemeMode) => {
    setSettings((prev) => ({ ...prev, theme }));
  }, []);

  const setFontSize = useCallback((fontSize: FontSize) => {
    setSettings((prev) => ({ ...prev, fontSize }));
  }, []);

  const toggleSerif = useCallback(() => {
    setSettings((prev) => ({ ...prev, serifFont: !prev.serifFont }));
  }, []);

  const toggleSideViewPinned = useCallback(() => {
    setSettings((prev) => ({ ...prev, isSideViewPinned: !prev.isSideViewPinned }));
  }, []);

  const setSideViewOpen = useCallback((open: boolean) => {
    setSettings((prev) => ({ ...prev, isSideViewOpen: open }));
  }, []);

  const toggleTocOpen = useCallback(() => {
    setSettings((prev) => ({ ...prev, isTocOpen: !prev.isTocOpen }));
  }, []);

  const setSideViewTab = useCallback((tab: SideViewTab) => {
    setSettings((prev) => ({ ...prev, sideViewTab: tab }));
  }, []);

  return {
    settings,
    setTheme,
    setFontSize,
    toggleSerif,
    toggleSideViewPinned,
    setSideViewOpen,
    toggleTocOpen,
    setSideViewTab,
  };
}
