import { motion } from 'motion/react';
import { useState } from 'react';
import { SettingsIcon } from '@/components/UI/settings';
import { FileTextIcon } from '@/components/UI/file-text';
import { DownloadIcon } from '@/components/UI/download';
import { SettingsGearIcon } from '@/components/UI/settings-gear';
import { CalendarDaysIcon } from '@/components/UI/calendar-days';
import { Maximize2Icon } from '@/components/UI/maximize-2';

// Side Menu Component
export function SettingsSideMenu() {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleMenu = () => {
    setIsExpanded(!isExpanded);
  };

  const handleFileTextClick = () => {
    console.log('Documents clicked');
    // Add your file/document action here
  };

  const handleCalendarClick = () => {
    console.log('Calendar clicked');
    // Add your calendar action here
  };

  const handleDownloadClick = () => {
    console.log('Download clicked');
    // Add your download action here
  };

  const handleFullscreenClick = () => {
    console.log('Fullscreen clicked');
    // Add your fullscreen action here
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  const handlePreferencesClick = () => {
    console.log('Preferences clicked');
    // Add your preferences action here
  };

  return (
    <div className="pointer-events-auto fixed left-4 top-1/2 z-[9999] flex -translate-y-1/2 flex-col gap-2">
      {/* FileText Button - Only visible when expanded */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{
          opacity: isExpanded ? 1 : 0,
          y: isExpanded ? 0 : 10,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={isExpanded ? 'block' : 'hidden'}
      >
        <div
          className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90"
          onClick={handleFileTextClick}
        >
          <div className="transition-all group-hover:brightness-150">
            <FileTextIcon size={18} />
          </div>
          <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
            Select Dataset
          </div>
        </div>
      </motion.div>

      {/* CalendarDaysIcon Button - Only visible when expanded */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{
          opacity: isExpanded ? 1 : 0,
          y: isExpanded ? 0 : 10,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={isExpanded ? 'block' : 'hidden'}
      >
        <div
          className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90"
          onClick={handleCalendarClick}
        >
          <div className="transition-all group-hover:brightness-150">
            <CalendarDaysIcon size={18} />
          </div>
          <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
            Set Date
          </div>
        </div>
      </motion.div>

      {/* Download Button - Only visible when expanded */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{
          opacity: isExpanded ? 1 : 0,
          y: isExpanded ? 0 : 10,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={isExpanded ? 'block' : 'hidden'}
      >
        <div
          className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90"
          onClick={handleDownloadClick}
        >
          <div className="transition-all group-hover:brightness-150">
            <DownloadIcon size={18} />
          </div>
          <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
            Download Dataset
          </div>
        </div>
      </motion.div>

      {/* Settings Gear Button - Only visible when expanded */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{
          opacity: isExpanded ? 1 : 0,
          y: isExpanded ? 0 : 10,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={isExpanded ? 'block' : 'hidden'}
      >
        <div
          className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90"
          onClick={handlePreferencesClick}
        >
          <div className="transition-all group-hover:brightness-150">
            <SettingsGearIcon size={18} />
          </div>
          <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
            Globe Settings
          </div>
        </div>
      </motion.div>

      {/* Fullscreen Button - Only visible when expanded */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{
          opacity: isExpanded ? 1 : 0,
          y: isExpanded ? 0 : 10,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={isExpanded ? 'block' : 'hidden'}
      >
        <div
          className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90"
          onClick={handleFullscreenClick}
        >
          <div className="transition-all group-hover:brightness-150">
            <Maximize2Icon size={18} />
          </div>
          <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
            Fullscreen
          </div>
        </div>
      </motion.div>

      {/* Settings Button */}
      <div className="group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-900/90 transition-all hover:bg-slate-700/90">
        <div className="transition-all group-hover:brightness-150">
          <SettingsIcon size={18} onClick={toggleMenu} />
        </div>
        <div className="pointer-events-none absolute left-12 whitespace-nowrap rounded-lg bg-slate-900/95 px-3 py-1.5 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
          Show or hide settings
        </div>
      </div>
    </div>
  );
}
