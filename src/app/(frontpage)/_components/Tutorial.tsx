"use client";

import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

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
      overlayColor: "black",
      smoothScroll: true,
      onDestroyStarted: () => {
        driverObj.destroy();
        onClose();
      },
      showButtons: ["next", "previous", "close"],
      steps: [
        {
          popover: {
            title: "Welcome to iCHARM!",
            description:
              "Begin the tutorial to learn the features and controls of the iCharm interface.",
          },
        },
        {
          element: "#dataset-title",
          popover: {
            title: "Current Dataset",
            description:
              "This shows the name of the currently loaded dataset. Different datasets display different climate or geographical data on the globe. Clicking the title will display more information about the dataset.",
            side: "bottom",
            align: "center",
          },
        },
        {
          element: "#time-series-button",
          popover: {
            title: "Time Series",
            description:
              "Click on this to open the time series page, where users can compare and analyze datasets.",
            side: "bottom",
            align: "center",
          },
        },
        {
          element: "#about-me-button",
          popover: {
            title: "About",
            description: "Description of iCHARM",
            side: "bottom",
            align: "center",
          },
        },
        {
          element: "#site-settings-button",
          popover: {
            title: "Site Settings",
            description: "Adjust the page settings for iCHARM",
            side: "bottom",
            align: "center",
          },
        },
        {
          element: "#globe",
          popover: {
            title: "Globe",
            description:
              "Zoom in and out using mouse scroll or right click + drag.<br>Rotate the globe using left click and drag.<br>To get region-specific data, left click on the globe.<br>Rotate 180 degrees by right clicking.",
            side: "left",
            align: "center",
          },
        },
        {
          element: "#dataset",
          popover: {
            title: "Dataset Selection",
            description:
              "Click here to select and load different datasets for visualization.",
            side: "right",
            align: "start",
          },
        },
        {
          element: "#calendar",
          popover: {
            title: "Date Selection",
            description:
              "Set specific dates for your data visualization using the calendar.",
            side: "right",
            align: "start",
          },
        },
        {
          element: "#download",
          popover: {
            title: "Download Data",
            description: "Export the current dataset in various formats.",
            side: "right",
            align: "start",
          },
        },
        {
          element: "#preferences",
          popover: {
            title: "Globe Settings",
            description:
              "Customize the globe appearance, layers, and visualization settings.",
            side: "right",
            align: "start",
          },
        },
        {
          element: "#fullscreen",
          popover: {
            title: "Fullscreen Mode",
            description:
              "Toggle fullscreen mode for an immersive viewing experience.",
            side: "right",
            align: "start",
          },
        },
        {
          element: "#temperature",
          popover: {
            title: "Temperature Bar",
            description:
              "The temperature bar is collapsable, draggable, adjusts between C/F and color ranges, and can be reset to its original position.",
            side: "right",
            align: "center",
          },
        },
        {
          element: "#timebar",
          popover: {
            title: "Date Selection",
            description:
              "Click or slide along the bar or select the shown date to adjust the time of the dataset.",
            side: "top",
            align: "center",
          },
        },
        {
          element: "#pressure",
          popover: {
            title: "Pressure Selection",
            description:
              "Click on the button to select the pressure level. This will only appear for datasets with multiple pressure levels.",
            side: "top",
            align: "center",
          },
        },
        {
          element: "#chatbot",
          popover: {
            title: "Chat Bot",
            description:
              "Ask questions about the data or interface using the chat bot.",
            side: "top",
            align: "center",
          },
        },
        {
          popover: {
            title: "Tutorial Complete!",
            description:
              "You now know all the main controls. The help button is always available if you need a refresher!",
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
