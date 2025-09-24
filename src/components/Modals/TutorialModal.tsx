'use client';

import React from 'react';
import { X, Play } from 'lucide-react';
import { TutorialModalProps } from '@/types';

const TutorialModal: React.FC<TutorialModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-6">
          <h2 className="text-2xl font-semibold text-gray-900">Tutorial</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <h1 className="mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
            Welcome to ICharm!
          </h1>

          <div className="space-y-4 leading-relaxed text-gray-700">
            <p className="text-lg">
              Discover the power of climate data visualization with our
              intuitive platform.
            </p>

            <p>
              Explore global weather patterns, interact with our AI assistant,
              and gain insights into climate trends through our interactive 3D
              globe visualization.
            </p>

            <p>
              Use the navigation icons to access datasets, settings, and more.
              The AI chatbot is always ready to help you understand the data and
              navigate the interface.
            </p>
          </div>

          <div className="mt-8 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 p-6">
            <h3 className="mb-4 text-xl font-semibold text-gray-900">
              Getting Started
            </h3>
            <div className="grid gap-4 text-sm text-gray-700 md:grid-cols-2">
              <div className="text-left">
                <h4 className="mb-2 font-medium">Navigation</h4>
                <ul className="space-y-1">
                  <li>• Click dataset icon to switch data</li>
                  <li>• Use settings for customization</li>
                  <li>• Access help through about section</li>
                </ul>
              </div>
              <div className="text-left">
                <h4 className="mb-2 font-medium">Interaction</h4>
                <ul className="space-y-1">
                  <li>• Chat with AI assistant</li>
                  <li>• Explore the rotating globe</li>
                  <li>• Use color bar for data reference</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-center gap-4">
            <button className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200">
              <Play size={16} />
              Watch Demo (Coming Soon)
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-2 font-semibold text-white transition-all duration-200 hover:from-blue-700 hover:to-purple-700"
            >
              Start Exploring
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialModal;
