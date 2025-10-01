import { motion } from 'motion/react';
import { useState } from 'react';
import { SettingsIcon } from '@/components/UI/settings';
import { FileTextIcon } from '@/components/UI/file-text';
import { DownloadIcon } from '@/components/UI/download';
import { SettingsGearIcon } from '@/components/UI/settings-gear';

// Side Menu Component
export function SettingsSideMenu() {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleMenu = () => {
    setIsExpanded(!isExpanded);
  };

  const handleFileTextClick = () => {
    console.log('FileText clicked');
    // Add your file/document action here
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
        <div className="group flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90">
          <div className="transition-all group-hover:brightness-150">
            <FileTextIcon size={16} onClick={handleFileTextClick} />
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
        <div className="group flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90">
          <div className="transition-all group-hover:brightness-150">
            <DownloadIcon size={16} onClick={handleFileTextClick} />
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
        <div className="group flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-800/90 transition-all hover:bg-slate-700/90">
          <div className="transition-all group-hover:brightness-150">
            <SettingsGearIcon size={16} onClick={handleFileTextClick} />
          </div>
        </div>
      </motion.div>

      {/* Settings Button */}
      <div className="group flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-slate-900/90 transition-all hover:bg-slate-700/90">
        <div className="transition-all group-hover:brightness-150">
          <SettingsIcon size={16} onClick={toggleMenu} />
        </div>
      </div>
    </div>
  );
}
