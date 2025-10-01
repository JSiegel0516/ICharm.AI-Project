'use client';

import React from 'react';
import { X } from 'lucide-react';
import { AboutModalProps } from '@/types';
import { aboutContent } from '@/utils/aboutContent';
import '@/styles/components/scroll.css';

const AboutModal: React.FC<AboutModalProps> = ({ onClose, onShowTutorial }) => {
  const { title, sections, links } = aboutContent;

  return (
    <>
      <div className="modal-overlay">
        <div className="custom-scrollbar mx-4 max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-900/95 to-purple-900/95 backdrop-blur-sm">
          {/* Header */}
          <div className="sticky top-0 rounded-t-2xl border-b border-blue-500/20 bg-gradient-to-r from-blue-800/90 to-purple-800/90 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-white">{title}</h1>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-300 transition-colors hover:bg-blue-600/30 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6 p-8 text-blue-100">
            {/* New to 4DVD Section */}
            <div className="mb-8 text-center">
              <h2 className="mb-4 text-2xl font-semibold text-white underline">
                {sections.newUser.title}
              </h2>
              <div className="inline-block rounded-lg border border-blue-600/30 bg-blue-800/30 p-4">
                <button
                  onClick={() => {
                    onClose();
                    onShowTutorial();
                  }}
                  className="font-medium text-blue-200 transition-colors hover:text-white"
                >
                  {sections.newUser.buttonText}
                </button>
              </div>
            </div>

            {/* Main Content */}
            <div className="space-y-6 leading-relaxed">
              {sections.introduction.map((paragraph, index) => (
                <p key={index} className="text-blue-200">
                  {paragraph.includes('www.4dvd.org') ? (
                    <>
                      {paragraph.split('www.4dvd.org')[0]}
                      <a
                        href={links.website}
                        className="text-blue-300 underline hover:text-blue-200"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        www.4dvd.org
                      </a>
                      {paragraph.split('www.4dvd.org')[1]}
                    </>
                  ) : paragraph.includes(
                      'https://github.com/dafrenchyman/4dvd'
                    ) ? (
                    <>
                      {
                        paragraph.split(
                          'https://github.com/dafrenchyman/4dvd'
                        )[0]
                      }
                      <a
                        href={links.github}
                        className="text-blue-300 underline hover:text-blue-200"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        https://github.com/dafrenchyman/4dvd
                      </a>
                      {paragraph
                        .split('https://github.com/dafrenchyman/4dvd')[1]
                        .replace('tto@sdsu.edu', '')
                        .replace('kwelch@sdsu.edu', '')
                        .replace(
                          '; copy Kyle Welch, Licensing Manager, at .',
                          '; copy Kyle Welch, Licensing Manager, at '
                        )}
                      <a
                        href={`mailto:${links.emails.tto}`}
                        className="text-blue-300 underline hover:text-blue-200"
                      >
                        {links.emails.tto}
                      </a>
                      ; copy Kyle Welch, Licensing Manager, at
                      <a
                        href={`mailto:${links.emails.licensing}`}
                        className="text-blue-300 underline hover:text-blue-200"
                      >
                        {links.emails.licensing}
                      </a>
                      .
                    </>
                  ) : (
                    paragraph
                  )}
                </p>
              ))}
            </div>

            {/* Contact Information */}
            <div className="my-6 rounded-lg border border-blue-600/30 bg-blue-800/30 p-4">
              <p className="mb-2 font-medium text-blue-200">
                {sections.contact.organization}
              </p>
              {sections.contact.address.map((line, index) => (
                <p key={index} className="text-blue-200">
                  {line}
                </p>
              ))}
            </div>

            {/* Citation */}
            <div className="rounded-lg border border-blue-500/20 bg-slate-800/50 p-4">
              <p className="mb-2 font-medium text-blue-200">
                {sections.citation.title}
              </p>
              <p className="italic text-blue-200">{sections.citation.text}</p>
            </div>

            {/* Data Sources */}
            <div>
              <h3 className="mb-4 text-xl font-semibold text-white">
                {sections.dataSources.title}
              </h3>
              <div className="space-y-4">
                {sections.dataSources.sources.map((source, index) => (
                  <div
                    key={index}
                    className={`${source.bgColor} rounded-lg border p-4 ${source.borderColor}`}
                  >
                    <p className="mb-2 text-blue-200">
                      <strong>{source.title}</strong> - Information available
                      at:
                      <a
                        href={source.url}
                        className="ml-1 text-blue-300 underline hover:text-blue-200"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.url}
                      </a>
                    </p>
                    <p className="text-sm text-blue-300">{source.citation}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Disclaimer */}
            <div className="rounded-lg border border-gray-600/30 bg-gray-800/50 p-4 text-sm">
              <p className="mb-2 font-medium text-blue-300">
                {sections.disclaimer.title}
              </p>
              {sections.disclaimer.paragraphs.map((paragraph, index) => (
                <p key={index} className="mt-2 text-blue-200">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AboutModal;
