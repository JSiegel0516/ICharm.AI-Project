import { PressureLevel } from "@/types";

// Predefined pressure levels based on standard atmospheric levels
export const pressureLevels: PressureLevel[] = [
  { id: "surface", value: 1000, label: "Surface", unit: "hPa" },
  { id: "925", value: 925, label: "925 hPa", unit: "hPa" },
  { id: "850", value: 850, label: "850 hPa", unit: "hPa" },
  { id: "700", value: 700, label: "700 hPa", unit: "hPa" },
  { id: "500", value: 500, label: "500 hPa", unit: "hPa" },
  { id: "300", value: 300, label: "300 hPa", unit: "hPa" },
  { id: "200", value: 200, label: "200 hPa", unit: "hPa" },
  { id: "100", value: 100, label: "100 hPa", unit: "hPa" },
  { id: "50", value: 50, label: "50 hPa", unit: "hPa" },
  { id: "10", value: 10, label: "10 hPa", unit: "hPa" },
];

// Altitude descriptions for different pressure levels
export const altitudeDescriptions: { [key: string]: string } = {
  surface: "~Sea Level",
  "925": "~2,500 ft",
  "850": "~5,000 ft",
  "700": "~10,000 ft",
  "500": "~18,000 ft",
  "300": "~30,000 ft",
  "200": "~39,000 ft",
  "100": "~53,000 ft",
  "50": "~67,000 ft",
  "10": "~89,000 ft",
};

export const chatResponses = [
  "I can help you analyze temperature patterns across different regions. What specific area interests you?",
  "This dataset shows monthly temperature averages. Would you like to explore seasonal variations?",
  "The color gradient represents temperature ranges. What questions do you have about the data?",
  "I can explain climate trends, help you navigate the interface, or provide insights about specific regions.",
  "Let me help you understand the data visualization. Which aspect would you like to explore?",
  "Would you like me to explain how to interpret the color patterns on the globe?",
  "I can guide you through the different datasets available. What type of climate data interests you most?",
];
