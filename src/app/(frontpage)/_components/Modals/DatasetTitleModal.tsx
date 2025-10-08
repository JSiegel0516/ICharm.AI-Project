'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DatasetModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetName: string;
  datasetDescription?: string;
}

const DatasetTitleModal: React.FC<DatasetModalProps> = ({
  isOpen,
  onClose,
  datasetName,
  datasetDescription = 'This dataset contains geographic and environmental data visualized on the 3D globe.',
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative max-w-md rounded-2xl bg-slate-800 p-6 text-white shadow-2xl"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-xl font-semibold">{datasetName}</h2>
            <p className="mb-4 text-sm text-gray-300">{datasetDescription}</p>

            <button
              onClick={onClose}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-700"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DatasetTitleModal;
