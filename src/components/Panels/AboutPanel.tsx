'use client';

import React from 'react';

const AboutPanel: React.FC = () => {
  return (
    <div className="px-6 py-4">
      <h2 className="mb-6 text-xl font-semibold text-white">Information</h2>

      {/* Download Original Data Link */}
      <div className="mb-6">
        <a
          href="#"
          className="font-medium text-blue-300 transition-colors hover:text-blue-200"
        >
          Download Original Data
        </a>
      </div>

      {/* Dataset Information */}
      <div className="space-y-4 text-sm">
        <div>
          <span className="font-medium text-white">Full Name: </span>
          <span className="text-blue-100">
            NOAA|NOAA-CIRES Twentieth Century Reanalysis (V2c)|Pressure
            Level|Non-Gaussian|Air Temperature|Monthly Mean (1000-10mb)
          </span>
        </div>

        <div>
          <span className="font-medium text-white">Date Range: </span>
          <span className="text-blue-100">1851-01 to 2014-12</span>
        </div>

        <div>
          <span className="font-medium text-white">Units: </span>
          <span className="text-blue-100">°C</span>
        </div>
      </div>

      {/* 4DVD Links Section */}
      <div className="mt-8">
        <h3 className="mb-4 text-xl font-semibold text-white">4DVD Links</h3>
        <div className="space-y-3">
          <a
            href="#"
            className="block text-blue-300 transition-colors hover:text-blue-200"
          >
            San Diego State University
          </a>
          <a
            href="#"
            className="block text-blue-300 transition-colors hover:text-blue-200"
          >
            SDSU Climate Science
          </a>
        </div>
      </div>
    </div>
  );
};

export default AboutPanel;
