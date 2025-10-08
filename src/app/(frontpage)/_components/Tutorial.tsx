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
      preventScroll: true, // Prevent auto-scrolling
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
          popover: {
            title: 'Welcome to iCharm!',
            description: 'Begin the tutorial to learn the controls.',
          },
        },
        {
          element: '#dataset-title',
          popover: {
            title: 'Current Dataset',
            description:
              'This shows the name of the currently loaded dataset. Different datasets display different climate or geographical data on the globe. Click on the title to learn more about the dataset.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '#time-series-button',
          popover: {
            title: 'Time Series',
            description:
              'Click on this to open the time series page, where users can compare and analyze datasets.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '#about-me-button',
          popover: {
            title: 'About Me',
            description: 'Description of iCharm',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '#site-settings-button',
          popover: {
            title: 'Site Settings',
            description: 'Adjust the page settings for iCharm',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '#globe',
          popover: {
            title: 'Globe',
            description:
              'Zoom in and out using mouse scroll. Click and drag to rotate the globe. Select an area on the globe to get region-specific data.',
            side: 'left',
            align: 'center',
          },
        },
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
          element: '#temperature',
          popover: {
            title: 'Temperature Bar',
            description:
              'The temperature box is collapsable, draggable, adjusts between C/F, and can be reset to its original position.',
            side: 'right',
            align: 'center',
          },
        },
        {
          element: '#timebar',
          popover: {
            title: 'Date Selection',
            description:
              'Slide along the bar or click on the shown date to adjust the time of the dataset.',
            side: 'top',
            align: 'center',
          },
        },
        {
          element: '#pressure',
          popover: {
            title: 'Pressure Selection',
            description: 'Click on the button to select the pressure.',
            side: 'top',
            align: 'center',
          },
        },
        {
          element: '#chatbot',
          popover: {
            title: 'Chat Bot',
            description: 'Prompt the chatbot to ask questions about the data.',
            side: 'top',
            align: 'center',
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

    driverObj.drive();

    return () => {
      if (driverObj.isActive()) {
        driverObj.destroy();
      }
    };
  }, [isOpen, onClose]);

  return null;
};
