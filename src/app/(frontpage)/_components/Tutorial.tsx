'use client';

import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

interface TutorialProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Tutorial: React.FC<TutorialProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;

    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayOpacity: 0.5,
      smoothScroll: true,
      onDestroyStarted: () => {
        driverObj.destroy();
        onClose();
      },
      onPopoverClose: () => {
        driverObj.destroy();
        onClose();
      },
      steps: [
        {
          element: '#dataset',
          popover: {
            title: 'Dataset Selection',
            description:
              'Click here to select and load different datasets for visualization.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '#calendar',
          popover: {
            title: 'Date Selection',
            description:
              'Set specific dates for your data visualization using the calendar.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '#download',
          popover: {
            title: 'Download Data',
            description:
              'Export your current dataset or visualization in various formats.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '#preferences',
          popover: {
            title: 'Globe Settings',
            description:
              'Customize the globe appearance, layers, and visualization settings.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: '#fullscreen',
          popover: {
            title: 'Fullscreen Mode',
            description:
              'Toggle fullscreen mode for an immersive viewing experience.',
            side: 'right',
            align: 'start',
          },
        },
        {
          popover: {
            title: 'Tutorial Complete!',
            description:
              'You now know all the main controls. The help button is always available if you need a refresher!',
          },
        },
      ],
    });

    // Start the tour
    driverObj.drive();

    // Clean up function
    return () => {
      if (driverObj.isActive()) {
        driverObj.destroy();
      }
    };
  }, [isOpen, onClose]);

  return null;
};
