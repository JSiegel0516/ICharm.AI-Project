'use client';

import React from 'react';
import { Settings } from 'lucide-react';
import { ControlPanelProps } from '@/types';


const ControlPanel: React.FC<ControlPanelProps> = ({ onShowSettings }) => {
  return (
    <div className="fixed left-6 top-1/2 z-40 flex -translate-y-1/2 transform flex-col gap-4">
      <button
        onClick={onShowSettings}
        className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-black/80 text-white backdrop-blur-sm transition-all duration-200 hover:scale-110 hover:bg-black/90"
      >
        <Settings size={20} />
        <span className="tooltip absolute left-14 top-1/2 -translate-y-1/2 transform whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          Settings
        </span>
      </button>
    </div>
  );
};

export default ControlPanel;
