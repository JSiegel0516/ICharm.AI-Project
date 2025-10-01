'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X, Monitor, Globe, Eye, Zap, RotateCcw } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: any) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [settings, setSettings] = useState({
    // Appearance
    theme: 'dark',
    fontSize: 'medium',
    colorContrast: 'default',
    reduceAnimations: false,

    // Accessibility
    language: 'en',
    keyboardNavigation: true,
    screenReader: false,
    focusIndicators: true,

    // Data Preferences
    autoRefresh: true,
    showDataPoints: true,
    highPrecision: false,

    // Performance
    animationQuality: 'high',
    cacheDuration: '6 hours',
  });

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  const resetToDefaults = () => {
    setSettings({
      theme: 'dark',
      fontSize: 'medium',
      colorContrast: 'default',
      reduceAnimations: false,
      language: 'en',
      keyboardNavigation: true,
      screenReader: false,
      focusIndicators: true,
      autoRefresh: true,
      showDataPoints: true,
      highPrecision: false,
      animationQuality: 'high',
      cacheDuration: '6 hours',
    });
  };

  const updateSetting = (key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const fontSizeOptions = [
    { value: 'small', label: 'Small', size: 'text-sm' },
    { value: 'medium', label: 'Medium', size: 'text-base' },
    { value: 'large', label: 'Large', size: 'text-lg' },
    { value: 'xlarge', label: 'Extra Large', size: 'text-xl' },
  ];

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'zh', label: '中文' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'ar', label: 'العربية' },
  ];

  const contrastOptions = [
    {
      value: 'default',
      label: 'Default',
      preview: 'bg-gradient-to-r from-blue-500 to-purple-600',
    },
    {
      value: 'high',
      label: 'High Contrast',
      preview: 'bg-gradient-to-r from-yellow-400 to-red-600',
    },
    {
      value: 'mono',
      label: 'Monochrome',
      preview: 'bg-gradient-to-r from-gray-700 to-gray-900',
    },
    {
      value: 'inverted',
      label: 'Inverted',
      preview: 'bg-gradient-to-r from-white to-gray-300',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-gray-700/50 bg-gray-900/95 shadow-2xl backdrop-blur-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-700/50 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/20 p-2">
                  <Settings size={24} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Site Settings
                  </h2>
                  <p className="text-sm text-gray-400">
                    Configure your iCharm experience
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-2 text-gray-400 transition-colors duration-200 hover:bg-gray-700/50 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="max-h-[60vh] overflow-y-auto p-6">
              <div className="space-y-8">
                {/* Accessibility Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-blue-400" />
                    <h3 className="text-lg font-medium text-white">
                      Accessibility
                    </h3>
                  </div>

                  {/* Language */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4">
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-gray-400" />
                        <div>
                          <span className="text-white">Language</span>
                          <div className="text-sm text-gray-400">
                            Interface language
                          </div>
                        </div>
                      </div>
                      <select
                        value={settings.language}
                        onChange={(e) =>
                          updateSetting('language', e.target.value)
                        }
                        className="rounded-lg bg-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {languageOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Font Size */}
                    <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4">
                      <div className="flex items-center gap-3">
                        <Monitor className="h-4 w-4 text-gray-400" />
                        <div>
                          <span className="text-white">Font Size</span>
                          <div className="text-sm text-gray-400">
                            Adjust text size
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {fontSizeOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() =>
                              updateSetting('fontSize', option.value)
                            }
                            className={`rounded-lg p-2 transition-colors duration-200 ${
                              settings.fontSize === option.value
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                            }`}
                          >
                            <span className={option.size}>A</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color Contrast */}
                    <div className="rounded-lg bg-gray-800/30 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Eye className="h-4 w-4 text-gray-400" />
                          <div>
                            <span className="text-white">Color Contrast</span>
                            <div className="text-sm text-gray-400">
                              Enhance color visibility
                            </div>
                          </div>
                        </div>
                        <select
                          value={settings.colorContrast}
                          onChange={(e) =>
                            updateSetting('colorContrast', e.target.value)
                          }
                          className="rounded-lg bg-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {contrastOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Color Contrast Preview */}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {contrastOptions.map((option) => (
                          <div
                            key={option.value}
                            onClick={() =>
                              updateSetting('colorContrast', option.value)
                            }
                            className={`cursor-pointer rounded-lg border-2 p-3 text-center text-xs transition-all duration-200 ${
                              settings.colorContrast === option.value
                                ? 'border-blue-500 bg-blue-500/10'
                                : 'border-transparent hover:border-gray-500'
                            }`}
                          >
                            <div
                              className={`mb-2 h-12 rounded ${option.preview}`}
                            ></div>
                            <span
                              className={
                                option.value === 'inverted'
                                  ? 'text-black'
                                  : 'text-white'
                              }
                            >
                              {option.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Additional Accessibility Options */}
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                        <input
                          type="checkbox"
                          checked={settings.reduceAnimations}
                          onChange={(e) =>
                            updateSetting('reduceAnimations', e.target.checked)
                          }
                          className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-white">Reduce animations</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                        <input
                          type="checkbox"
                          checked={settings.keyboardNavigation}
                          onChange={(e) =>
                            updateSetting(
                              'keyboardNavigation',
                              e.target.checked
                            )
                          }
                          className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-white">Keyboard navigation</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                        <input
                          type="checkbox"
                          checked={settings.screenReader}
                          onChange={(e) =>
                            updateSetting('screenReader', e.target.checked)
                          }
                          className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-white">
                          Screen reader support
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                        <input
                          type="checkbox"
                          checked={settings.focusIndicators}
                          onChange={(e) =>
                            updateSetting('focusIndicators', e.target.checked)
                          }
                          className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-white">Focus indicators</span>
                      </label>
                    </div>
                  </div>
                </section>

                {/* Appearance Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-5 w-5 text-blue-400" />
                    <h3 className="text-lg font-medium text-white">
                      Appearance
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <button
                      onClick={() => updateSetting('theme', 'light')}
                      className={`rounded-lg border-2 p-4 text-left transition-colors duration-200 ${
                        settings.theme === 'light'
                          ? 'border-blue-500 bg-blue-500/20'
                          : 'border-gray-600 bg-gray-800/50 hover:border-blue-500'
                      }`}
                    >
                      <div className="font-medium text-white">Light Mode</div>
                      <div className="mt-1 text-sm text-gray-400">
                        Bright theme
                      </div>
                    </button>
                    <button
                      onClick={() => updateSetting('theme', 'dark')}
                      className={`rounded-lg border-2 p-4 text-left transition-colors duration-200 ${
                        settings.theme === 'dark'
                          ? 'border-blue-500 bg-blue-500/20'
                          : 'border-gray-600 bg-gray-800/50 hover:border-blue-500'
                      }`}
                    >
                      <div className="font-medium text-white">Dark Mode</div>
                      <div className="mt-1 text-sm text-blue-400">
                        Currently active
                      </div>
                    </button>
                  </div>
                </section>

                {/* Data Preferences Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-blue-400" />
                    <h3 className="text-lg font-medium text-white">
                      Data Preferences
                    </h3>
                  </div>

                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                      <input
                        type="checkbox"
                        checked={settings.autoRefresh}
                        onChange={(e) =>
                          updateSetting('autoRefresh', e.target.checked)
                        }
                        className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-white">Auto-refresh data</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                      <input
                        type="checkbox"
                        checked={settings.showDataPoints}
                        onChange={(e) =>
                          updateSetting('showDataPoints', e.target.checked)
                        }
                        className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-white">
                        Show data points on hover
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-800/30 p-4 transition-colors duration-200 hover:bg-gray-700/40">
                      <input
                        type="checkbox"
                        checked={settings.highPrecision}
                        onChange={(e) =>
                          updateSetting('highPrecision', e.target.checked)
                        }
                        className="rounded bg-gray-700 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-white">High precision mode</span>
                    </label>
                  </div>
                </section>

                {/* Performance Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-blue-400" />
                    <h3 className="text-lg font-medium text-white">
                      Performance
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4">
                      <span className="text-white">Animation Quality</span>
                      <select
                        value={settings.animationQuality}
                        onChange={(e) =>
                          updateSetting('animationQuality', e.target.value)
                        }
                        className="rounded-lg bg-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-gray-800/30 p-4">
                      <span className="text-white">Cache Duration</span>
                      <select
                        value={settings.cacheDuration}
                        onChange={(e) =>
                          updateSetting('cacheDuration', e.target.value)
                        }
                        className="rounded-lg bg-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="1 hour">1 hour</option>
                        <option value="6 hours">6 hours</option>
                        <option value="24 hours">24 hours</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Reset Section */}
                <section className="border-t border-gray-700/50 pt-6">
                  <div className="flex items-center justify-between rounded-lg border border-red-600/20 bg-red-600/10 p-4">
                    <div className="flex items-center gap-3">
                      <RotateCcw className="h-4 w-4 text-red-400" />
                      <div>
                        <span className="text-white">Reset to Defaults</span>
                        <div className="text-sm text-red-400">
                          Restore all settings to factory defaults
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={resetToDefaults}
                      className="rounded-lg bg-red-600/20 px-4 py-2 text-red-400 transition-colors hover:bg-red-600/30 hover:text-red-300"
                    >
                      Reset All
                    </button>
                  </div>
                </section>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-700/50 bg-gray-900/50 p-6">
              <button
                onClick={onClose}
                className="rounded-lg px-6 py-2 text-gray-400 transition-colors duration-200 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors duration-200 hover:bg-blue-700"
              >
                Save Settings
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
