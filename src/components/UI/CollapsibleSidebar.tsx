'use client';

import React, { useState } from 'react';
import {
  Settings,
  Menu,
  X,
  Database,
  Calendar,
  Info,
  Paintbrush,
  HelpCircle,
  Paintbrush2,
} from 'lucide-react';
import DatasetPanel from '../Panels/DatasetPanel';
import HistoryPanel from '../Panels/HistoryPanel';
import AboutPanel from '../Panels/AboutPanel';
import '@/styles/components/scroll.css';

interface CollapsibleSidebarProps {
  onShowSettings: () => void;
  activePanel?: 'datasets' | 'history' | 'about' | null;
  onPanelChange?: (panel: 'datasets' | 'history' | 'about' | null) => void;
}

type SidebarPanel = 'datasets' | 'history' | 'about' | 'new' | null;

const CollapsibleSidebar: React.FC<CollapsibleSidebarProps> = ({
  onShowSettings,
  activePanel = null,
  onPanelChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentPanel, setCurrentPanel] = useState<SidebarPanel>(activePanel);

  // Handle panel changes from parent component
  React.useEffect(() => {
    setCurrentPanel(activePanel);
  }, [activePanel]);

  const handlePanelChange = (panel: SidebarPanel) => {
    setCurrentPanel(panel);
    if (onPanelChange) {
      onPanelChange(panel as 'datasets' | 'history' | 'about' | null);
    }
  };

  const closeSidebar = () => {
    setIsExpanded(false);
    setCurrentPanel(null);
    if (onPanelChange) {
      onPanelChange(null);
    }
  };

  const iconButtons = [
    {
      id: 'datasets' as const,
      icon: Database,
      tooltip: 'Datasets',
    },
    {
      id: 'history' as const,
      icon: Calendar,
      tooltip: 'Date & Time',
    },
    {
      id: 'new' as const,
      icon: Paintbrush,
      tooltip: 'Globe Settings',
    },
    {
      id: 'about' as const,
      icon: HelpCircle,
      tooltip: 'Information',
    },
  ];

  const renderPanelContent = () => {
    switch (currentPanel) {
      case 'datasets':
        return <DatasetPanel />;
      case 'history':
        return <HistoryPanel />;
      case 'about':
        return <AboutPanel />;
      default:
        return (
          <div className="px-6 py-4">
            {/* Settings Option */}
            <button
              onClick={() => {
                onShowSettings();
                closeSidebar();
              }}
              className="group flex w-full items-center gap-3 rounded-xl p-3 text-white transition-all duration-200 hover:bg-blue-600/20"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600 transition-all duration-200 group-hover:from-blue-500 group-hover:to-purple-500">
                <Settings size={16} />
              </div>
              <span className="text-sm font-medium">Settings</span>
            </button>
          </div>
        );
    }
  };

  return (
    <>
      {/* Main Sidebar */}
      <div
        className={`fixed left-0 top-0 z-40 h-full w-80 transform rounded-r-2xl border-r border-blue-500/20 bg-gradient-to-br from-blue-900/95 to-purple-900/95 shadow-2xl backdrop-blur-sm transition-transform duration-300 ease-out ${
          isExpanded ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header with Icons */}
        <div className="ml-3 mr-3 mt-16 flex items-center justify-between border-b border-blue-500/20 p-4">
          {/* Icon Bar */}
          <div className="flex items-center space-x-4">
            {iconButtons.map(({ id, icon: Icon, tooltip }) => (
              <div key={id} className="group relative">
                <button
                  onClick={() => handlePanelChange(id)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 hover:scale-110 ${
                    currentPanel === id
                      ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg'
                      : 'border border-blue-600/30 bg-blue-800/30 text-blue-200 hover:border-blue-500/50 hover:bg-blue-700/50 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                </button>

                {/* Tooltip */}
                <div className="pointer-events-none absolute left-1/2 top-12 z-50 -translate-x-1/2 transform whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {tooltip}
                </div>
              </div>
            ))}
          </div>

          {/* Close Button */}
          <button
            onClick={closeSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-500/30 bg-blue-700/50 text-white transition-colors hover:bg-blue-600/60"
          >
            <X size={16} />
          </button>
        </div>

        {/* Panel Content */}
        <div className="custom-scrollbar h-full overflow-y-auto pb-20">
          {renderPanelContent()}
        </div>
      </div>

      {/* Invisible overlay for top portion */}
      <div
        className={`pointer-events-none fixed left-0 top-0 z-30 h-2/5 w-80 transform transition-transform duration-300 ease-out ${
          isExpanded ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: 'transparent',
        }}
      />

      {/* Toggle Button - Only visible when sidebar is collapsed */}
      <div
        className={`fixed left-6 top-1/2 z-50 -translate-y-1/2 transform transition-all duration-300 ease-out ${
          isExpanded
            ? 'pointer-events-none scale-75 opacity-0'
            : 'scale-100 opacity-100'
        }`}
      >
        <button
          onClick={() => {
            setIsExpanded(true);
            // Set default panel to datasets if no panel is currently active
            if (!currentPanel) {
              setCurrentPanel('datasets');
              if (onPanelChange) {
                onPanelChange('datasets');
              }
            }
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg transition-all duration-200 hover:scale-110 hover:from-blue-700 hover:to-purple-700"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Backdrop for sidebar */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-30 bg-black/20"
          onClick={closeSidebar}
        />
      )}
    </>
  );
};

export default CollapsibleSidebar;
