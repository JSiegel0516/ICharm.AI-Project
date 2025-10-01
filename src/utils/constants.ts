import { Dataset, PressureLevel } from '@/types';

export const mockDatasets: Dataset[] = [
  {
    id: 'air-temp-monthly',
    name: 'Air Temperature | Monthly Mean',
    description: 'Global air temperature data with monthly averages',
    units: '°C',
    dataType: 'temperature',
    temporalResolution: 'monthly',
    colorScale: {
      min: -30,
      max: 30,
      colors: [
        '#2563eb',
        '#06b6d4',
        '#10b981',
        '#fbbf24',
        '#f59e0b',
        '#ef4444',
      ],
      labels: ['-30', '-20', '-10', '0', '10', '20', '30'],
    },
  },
  {
    id: 'precipitation-monthly',
    name: 'Precipitation | Monthly Total',
    description: 'Global precipitation data with monthly totals',
    units: 'mm',
    dataType: 'precipitation',
    temporalResolution: 'monthly',
    colorScale: {
      min: 0,
      max: 500,
      colors: [
        '#f8fafc',
        '#e2e8f0',
        '#94a3b8',
        '#475569',
        '#1e293b',
        '#0f172a',
      ],
      labels: ['0', '100', '200', '300', '400', '500'],
    },
  },
  {
    id: 'sea-surface-temp',
    name: 'Sea Surface Temperature',
    description: 'Ocean surface temperature measurements',
    units: '°C',
    dataType: 'temperature',
    temporalResolution: 'daily',
    colorScale: {
      min: -2,
      max: 35,
      colors: [
        '#1e3a8a',
        '#3b82f6',
        '#06b6d4',
        '#10b981',
        '#fbbf24',
        '#ef4444',
        '#7c2d12',
      ],
      labels: ['-2', '5', '12', '19', '26', '33', '35'],
    },
  },
];
// Predefined pressure levels based on standard atmospheric levels
export const pressureLevels: PressureLevel[] = [
  { id: 'surface', value: 1000, label: 'Surface', unit: 'hPa' },
  { id: '925', value: 925, label: '925 hPa', unit: 'hPa' },
  { id: '850', value: 850, label: '850 hPa', unit: 'hPa' },
  { id: '700', value: 700, label: '700 hPa', unit: 'hPa' },
  { id: '500', value: 500, label: '500 hPa', unit: 'hPa' },
  { id: '300', value: 300, label: '300 hPa', unit: 'hPa' },
  { id: '200', value: 200, label: '200 hPa', unit: 'hPa' },
  { id: '100', value: 100, label: '100 hPa', unit: 'hPa' },
  { id: '50', value: 50, label: '50 hPa', unit: 'hPa' },
  { id: '10', value: 10, label: '10 hPa', unit: 'hPa' },
];

// Altitude descriptions for different pressure levels
export const altitudeDescriptions: { [key: string]: string } = {
  'surface': '~Sea Level',
  '925': '~2,500 ft',
  '850': '~5,000 ft',
  '700': '~10,000 ft',
  '500': '~18,000 ft',
  '300': '~30,000 ft',
  '200': '~39,000 ft',
  '100': '~53,000 ft',
  '50': '~67,000 ft',
  '10': '~89,000 ft',
};


export const chatResponses = [
  'I can help you analyze temperature patterns across different regions. What specific area interests you?',
  'This dataset shows monthly temperature averages. Would you like to explore seasonal variations?',
  'The color gradient represents temperature ranges. What questions do you have about the data?',
  'I can explain climate trends, help you navigate the interface, or provide insights about specific regions.',
  'Let me help you understand the data visualization. Which aspect would you like to explore?',
  'Would you like me to explain how to interpret the color patterns on the globe?',
  'I can guide you through the different datasets available. What type of climate data interests you most?',
];
