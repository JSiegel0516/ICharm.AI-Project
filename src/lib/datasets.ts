import type { ColorScale, Dataset, DatasetBackendDetails } from '@/types';

export interface BackendDatasetRecord {
  sourceName?: string;
  datasetName: string;
  layerParameter?: string;
  statistic?: string;
  datasetType?: string;
  levels?: string | null;
  levelValues?: string | null;
  levelUnits?: string | null;
  Stored?: string | null;
  stored?: string | null;
  inputFile?: string | null;
  keyVariable?: string | null;
  units?: string | null;
  spatialResolution?: string | null;
  engine?: string | null;
  kerchunkPath?: string | null;
  origLocation?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

type DataCategory = Dataset['dataType'] | 'default';

export const DEFAULT_COLOR_SCALES: Record<DataCategory, ColorScale> = {
  temperature: {
    min: -30,
    max: 35,
    colors: ['#2563eb', '#06b6d4', '#10b981', '#fbbf24', '#f59e0b', '#ef4444'],
    labels: ['-30', '-20', '-10', '0', '10', '20', '30'],
  },
  precipitation: {
    min: 0,
    max: 500,
    colors: ['#f8fafc', '#e2e8f0', '#94a3b8', '#475569', '#1e293b', '#0f172a'],
    labels: ['0', '100', '200', '300', '400', '500'],
  },
  wind: {
    min: 0,
    max: 60,
    colors: ['#f8fafc', '#c7d2fe', '#818cf8', '#4338ca', '#312e81'],
    labels: ['0', '15', '30', '45', '60'],
  },
  pressure: {
    min: 900,
    max: 1050,
    colors: ['#f1f5f9', '#94a3b8', '#64748b', '#334155', '#1e293b'],
    labels: ['900', '940', '980', '1020', '1050'],
  },
  humidity: {
    min: 0,
    max: 100,
    colors: ['#f1f5f9', '#bae6fd', '#38bdf8', '#0284c7', '#0f172a'],
    labels: ['0', '25', '50', '75', '100'],
  },
  default: {
    min: 0,
    max: 1,
    colors: ['#f1f5f9', '#94a3b8', '#475569', '#1e293b'],
    labels: ['Low', '', '', '', 'High'],
  },
};

export function cloneColorScale(scale: ColorScale): ColorScale {
  return {
    min: scale.min,
    max: scale.max,
    colors: [...scale.colors],
    labels: [...scale.labels],
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferDataType(record: BackendDatasetRecord): Dataset['dataType'] {
  const target = [
    record.datasetName,
    record.layerParameter,
    record.datasetType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (target.includes('precip')) {
    return 'precipitation';
  }
  if (target.includes('wind')) {
    return 'wind';
  }
  if (target.includes('pressure') || target.includes('geopotential')) {
    return 'pressure';
  }
  if (target.includes('vegetation') || target.includes('ndvi')) {
    return 'humidity';
  }
  return 'temperature';
}

function inferTemporalResolution(
  statistic?: string
): Dataset['temporalResolution'] {
  const value = (statistic || '').toLowerCase();
  if (value.includes('hour')) {
    return 'hourly';
  }
  if (value.includes('daily')) {
    return 'daily';
  }
  if (value.includes('year')) {
    return 'yearly';
  }
  return 'monthly';
}

function normalizeUnits(units?: string | null, dataType?: string): string {
  if (units && units.toLowerCase() !== 'none') {
    return units;
  }

  if (!dataType) {
    return 'units';
  }

  switch (dataType) {
    case 'temperature':
      return 'degC';
    case 'precipitation':
      return 'mm/day';
    case 'wind':
      return 'm/s';
    case 'pressure':
      return 'hPa';
    case 'humidity':
      return '%';
    default:
      return 'units';
  }
}

function parseLevelValues(value?: string | null): number[] {
  if (!value || value.toLowerCase() === 'none') {
    return [];
  }

  return value
    .split(',')
    .map((entry) => parseFloat(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
}

function toIsoDate(input?: string | null): string | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const parts = trimmed.split(/[\/\-]/).map((segment) => segment.trim());
  if (parts.length === 3) {
    const [year, month, day] = parts.map((segment) => segment.padStart(2, '0'));
    const isoDate = `${year}-${month}-${day}`;
    const validation = new Date(isoDate);
    if (!Number.isNaN(validation.getTime())) {
      return isoDate;
    }
  }

  return trimmed;
}

function buildBackendDetails(
  record: BackendDatasetRecord
): DatasetBackendDetails {
  const storedValue = (record.Stored ?? record.stored ?? '').toLowerCase();

  return {
    sourceName: record.sourceName ?? null,
    datasetName: record.datasetName,
    layerParameter: record.layerParameter ?? null,
    statistic: record.statistic ?? null,
    datasetType: record.datasetType ?? null,
    levels: record.levels ?? null,
    levelValues: parseLevelValues(record.levelValues),
    levelUnits: record.levelUnits ?? null,
    stored: storedValue === 'local' || storedValue === 'cloud' ? storedValue : null,
    inputFile: record.inputFile ?? null,
    keyVariable: record.keyVariable ?? null,
    units: record.units ?? null,
    spatialResolution: record.spatialResolution ?? null,
    engine:
      record.engine && record.engine.toLowerCase() !== 'none'
        ? record.engine
        : null,
    kerchunkPath:
      record.kerchunkPath && record.kerchunkPath.toLowerCase() !== 'none'
        ? record.kerchunkPath
        : null,
    origLocation: record.origLocation ?? null,
    startDate: toIsoDate(record.startDate),
    endDate: toIsoDate(record.endDate),
  };
}

export function normalizeDataset(record: BackendDatasetRecord): Dataset {
  const dataType = inferDataType(record);
  const colorKey: DataCategory = dataType in DEFAULT_COLOR_SCALES ? dataType : 'default';
  const baseColorScale = DEFAULT_COLOR_SCALES[colorKey];

  return {
    id: slugify(record.datasetName),
    name: record.datasetName,
    description: [record.layerParameter, record.statistic]
      .filter(Boolean)
      .join(' • '),
    units: normalizeUnits(record.units, dataType),
    dataType,
    temporalResolution: inferTemporalResolution(record.statistic),
    colorScale: cloneColorScale(baseColorScale),
    backend: buildBackendDetails(record),
  };
}

export function normalizeDatasets(
  records: BackendDatasetRecord[]
): Dataset[] {
  return records.map(normalizeDataset);
}
