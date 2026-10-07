import React from 'react';
import {
  HierarchySectionItem,
  HierarchySubsectionItem,
  HierarchyClauseItem,
  ThemeMode,
  FontSize,
} from '../types/akn';
import { HierarchyIndex } from '../services/hierarchyBuilder';
import {
  Search,
  BookOpen,
  Menu,
  Moon,
  Sun,
  Palette,
  Type,
  SidebarClose,
  SidebarOpen,
} from 'lucide-react';

import { NavigationPicker } from './NavigationPicker';

interface HeaderProps {
  hierarchyIndex: HierarchyIndex | null;
  activeSection: HierarchySectionItem | null;
  activeSubsection: HierarchySubsectionItem | null;
  activeClause: HierarchyClauseItem | null;
  onSelectProvision: (eid: string) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  fontSize: FontSize;
  onFontSizeChange: (fontSize: FontSize) => void;
  serifFont: boolean;
  onToggleSerif: () => void;
  isTocOpen: boolean;
  onToggleToc: () => void;
  onOpenSearch: () => void;
  isSideViewOpen: boolean;
  onToggleSideView: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  hierarchyIndex,
  activeSection,
  activeSubsection,
  activeClause,
  onSelectProvision,
  theme,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  serifFont,
  onToggleSerif,
  isTocOpen,
  onToggleToc,
  onOpenSearch,
  isSideViewOpen,
  onToggleSideView,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs">
      <div className="max-w-7xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Act Logo & TOC Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleToc}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isTocOpen ? 'Hide Table of Contents' : 'Show Table of Contents'}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center text-white shadow-xs">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="hidden md:block">
              <div className="text-xs font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">
                CGST ACT 2017
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-none">
                AKN Legal Reader
              </div>
            </div>
          </div>
        </div>

        {/* Center: 3-Tier Synchronized Dropdown Picker */}
        <NavigationPicker
          hierarchyIndex={hierarchyIndex}
          activeSection={activeSection}
          activeSubsection={activeSubsection}
          activeClause={activeClause}
          onSelectProvision={onSelectProvision}
        />

        {/* Right Tools: Search, Typography, Theme, Side View */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Quick Search Button */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors text-xs font-medium"
            title="Global search provisions (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden lg:inline-block px-1 py-0.2 bg-white dark:bg-slate-900 rounded border border-slate-300 dark:border-slate-700 font-mono text-[10px]">
              Ctrl K
            </kbd>
          </button>

          {/* Font Size Toggle */}
          <div className="hidden sm:flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
            {(['sm', 'base', 'lg', 'xl'] as FontSize[]).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => onFontSizeChange(sz)}
                className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                  fontSize === sz
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title={`Font size ${sz}`}
              >
                {sz.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Serif / Sans Toggle */}
          <button
            type="button"
            onClick={onToggleSerif}
            className={`p-1.5 rounded-lg border transition-colors ${
              serifFont
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
            title={serifFont ? 'Switch to Sans-serif font' : 'Switch to Statute Serif font'}
          >
            <Type className="w-4 h-4" />
          </button>

          {/* Theme Switcher */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => onThemeChange('parchment')}
              className={`p-1 rounded ${
                theme === 'parchment'
                  ? 'bg-amber-200/90 text-amber-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Parchment Theme"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('slate')}
              className={`p-1 rounded ${
                theme === 'slate'
                  ? 'bg-blue-100 text-blue-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Slate Light Theme"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('dark')}
              className={`p-1 rounded ${
                theme === 'dark'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Obsidian Dark Theme"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Side View Toggle */}
          <button
            type="button"
            onClick={onToggleSideView}
            className={`p-1.5 rounded-lg border transition-colors ${
              isSideViewOpen
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={isSideViewOpen ? 'Close Side View' : 'Open Side View Peek'}
          >
            {isSideViewOpen ? <SidebarClose className="w-4 h-4" /> : <SidebarOpen className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
