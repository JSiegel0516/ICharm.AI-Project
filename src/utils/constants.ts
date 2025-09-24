import { Dataset } from '@/types';

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

export const chatResponses = [
  'I can help you analyze temperature patterns across different regions. What specific area interests you?',
  'This dataset shows monthly temperature averages. Would you like to explore seasonal variations?',
  'The color gradient represents temperature ranges. What questions do you have about the data?',
  'I can explain climate trends, help you navigate the interface, or provide insights about specific regions.',
  'Let me help you understand the data visualization. Which aspect would you like to explore?',
  'Would you like me to explain how to interpret the color patterns on the globe?',
  'I can guide you through the different datasets available. What type of climate data interests you most?',
];
