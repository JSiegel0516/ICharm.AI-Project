'use client';

import React from 'react';
import { X, Globe, Palette, BarChart3 } from 'lucide-react';
import { SettingsModalProps } from '@/types';

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const settingsSections = [
    {
      icon: Globe,
      title: 'Globe Settings',
      description: 'Adjust 3D globe appearance and rotation speed',
      color: 'bg-blue-500',
    },
    {
      icon: Palette,
      title: 'Color Schemes',
      description: 'Choose visualization color palettes and themes',
      color: 'bg-green-500',
    },
    {
      icon: BarChart3,
      title: 'Data Display',
      description: 'Configure data visualization and overlay options',
      color: 'bg-orange-500',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-6">
          <h2 className="text-2xl font-semibold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="space-y-4">
            {settingsSections.map((section, index) => (
              <div
                key={index}
                className="flex cursor-pointer items-center gap-4 rounded-xl border border-gray-200 p-4 transition-colors hover:bg-gray-50"
              >
                <div
                  className={`h-12 w-12 ${section.color} flex items-center justify-center rounded-full text-white`}
                >
                  <section.icon size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    {section.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    {section.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
