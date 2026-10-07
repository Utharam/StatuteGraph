import { useState, useEffect } from 'react';
import { ThemeMode, FontSize, ReaderSettings } from '../types/akn';

const SETTINGS_STORAGE_KEY = 'akn_reader_settings_v1';

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'parchment',
  fontSize: 'base',
  serifFont: true,
  isSideViewPinned: false,
  isSideViewOpen: false,
  isTocOpen: true,
  sideViewTab: 'provision',
};

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // Fallback on parse error
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage errors
    }

    // Apply theme classes to html root
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

  const setTheme = (theme: ThemeMode) => {
    setSettings(prev => ({ ...prev, theme }));
  };

  const setFontSize = (fontSize: FontSize) => {
    setSettings(prev => ({ ...prev, fontSize }));
  };

  const toggleSerif = () => {
    setSettings(prev => ({ ...prev, serifFont: !prev.serifFont }));
  };

  const toggleSideViewPinned = () => {
    setSettings(prev => ({ ...prev, isSideViewPinned: !prev.isSideViewPinned }));
  };

  const setSideViewOpen = (open: boolean) => {
    setSettings(prev => ({ ...prev, isSideViewOpen: open }));
  };

  const toggleTocOpen = () => {
    setSettings(prev => ({ ...prev, isTocOpen: !prev.isTocOpen }));
  };

  const setSideViewTab = (tab: 'provision' | 'nest') => {
    setSettings(prev => ({ ...prev, sideViewTab: tab }));
  };

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
