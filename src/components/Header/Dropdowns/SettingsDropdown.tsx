'use client';

import React, { useState } from 'react';
import {
  Search,
  Palette,
  Globe,
  Eye,
  Thermometer,
  Clock,
  Sun,
  Moon,
} from 'lucide-react';

interface SettingsDropdownProps {
  onSelectSetting: (setting: any) => void;
  isVisible: boolean;
}

const SettingsDropdown: React.FC<SettingsDropdownProps> = ({
  onSelectSetting,
  isVisible,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Settings options for the climate visualization app
  const settingsOptions = [
    {
      id: '1',
      name: 'Temperature Units',
      value: '°C / °F',
      description: 'Switch between Celsius and Fahrenheit',
      icon: Thermometer,
      category: 'Display',
    },
    {
      id: '2',
      name: 'Color Scheme',
      value: 'Default',
      description: 'Change visualization color palette',
      icon: Palette,
      category: 'Display',
    },
    {
      id: '3',
      name: 'Globe Rotation',
      value: 'Auto',
      description: 'Enable or disable automatic globe rotation',
      icon: Globe,
      category: 'Interaction',
    },
    {
      id: '4',
      name: 'Show Colorbar',
      value: 'Enabled',
      description: 'Toggle color scale visibility',
      icon: Eye,
      category: 'Display',
    },
    {
      id: '5',
      name: 'Time Resolution',
      value: 'Monthly',
      description: 'Set temporal data resolution',
      icon: Clock,
      category: 'Data',
    },
    {
      id: '6',
      name: 'Theme Mode',
      value: 'Dark',
      description: 'Switch between light and dark themes',
      icon: Moon,
      category: 'Display',
    },
    {
      id: '7',
      name: 'Grid Lines',
      value: 'Hidden',
      description: 'Show or hide coordinate grid',
      icon: Globe,
      category: 'Display',
    },
    {
      id: '8',
      name: 'Animation Speed',
      value: 'Normal',
      description: 'Adjust globe rotation and transition speed',
      icon: Clock,
      category: 'Interaction',
    },
    {
      id: '9',
      name: 'Data Labels',
      value: 'Enabled',
      description: 'Show data point labels on hover',
      icon: Eye,
      category: 'Display',
    },
    {
      id: '10',
      name: 'Auto-refresh',
      value: '5 min',
      description: 'Set data refresh interval',
      icon: Clock,
      category: 'Data',
    },
    {
      id: '11',
      name: 'Lighting',
      value: 'Natural',
      description: 'Adjust globe lighting effects',
      icon: Sun,
      category: 'Display',
    },
    {
      id: '12',
      name: 'Zoom Sensitivity',
      value: 'Normal',
      description: 'Adjust mouse wheel zoom sensitivity',
      icon: Globe,
      category: 'Interaction',
    },
  ];

  const filteredSettings = settingsOptions.filter(
    (setting) =>
      setting.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      setting.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      setting.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSettingSelect = (setting: any) => {
    onSelectSetting(setting);
    setSearchQuery(''); // Clear search after selection
  };

  // Group settings by category
  const groupedSettings = filteredSettings.reduce(
    (groups, setting) => {
      const category = setting.category;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(setting);
      return groups;
    },
    {} as Record<string, typeof filteredSettings>
  );

  if (!isVisible) return null;

  return (
    <div className="animate-fade-in absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-slate-600/50 bg-slate-800/95 shadow-2xl backdrop-blur-sm">
      {/* Rainbow border effect */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-green-400 via-blue-400 via-pink-400 via-purple-400 to-red-400 p-px">
        <div className="h-full w-full rounded-2xl bg-slate-800">
          {/* Search Bar */}
          <div className="border-b border-slate-600/50 p-4">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 transform text-gray-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/60 py-2 pl-10 pr-4 text-white placeholder-gray-400 outline-none transition-colors focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Settings List */}
          <div className="custom-scrollbar max-h-80 overflow-y-auto">
            {Object.keys(groupedSettings).length > 0 ? (
              <div className="p-2">
                {Object.entries(groupedSettings).map(([category, settings]) => (
                  <div key={category}>
                    {/* Category Header */}
                    <div className="mt-2 px-3 py-2 first:mt-0">
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        {category}
                      </h5>
                    </div>

                    {/* Settings in Category */}
                    {settings.map((setting) => {
                      const IconComponent = setting.icon;
                      return (
                        <button
                          key={setting.id}
                          onClick={() => handleSettingSelect(setting)}
                          className="group w-full rounded-xl p-3 text-left transition-all duration-200 hover:bg-slate-700/60"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex-shrink-0">
                              <IconComponent
                                size={16}
                                className="text-gray-400 transition-colors group-hover:text-blue-300"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between">
                                <h4 className="truncate font-medium text-white transition-colors group-hover:text-blue-300">
                                  {setting.name}
                                </h4>
                                <span className="ml-3 flex-shrink-0 font-mono text-xs text-gray-500 transition-colors group-hover:text-blue-400">
                                  {setting.value}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-gray-400 transition-colors group-hover:text-gray-300">
                                {setting.description}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm text-gray-400">No settings found</p>
                <p className="mt-1 text-xs text-gray-500">
                  Try a different search term
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #475569;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #64748b;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
};

export default SettingsDropdown;
