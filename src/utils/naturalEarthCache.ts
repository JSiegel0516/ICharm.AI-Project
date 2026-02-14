import type {
  NEDataType,
  NELineData,
  NEResolution,
} from "./naturalEarthLoader";
import { NaturalEarthLoader } from "./naturalEarthLoader";

const cache = new Map<string, NELineData | null>();

export const getCachedNaturalEarthData = async (
  type: NEDataType,
  resolution: NEResolution,
): Promise<NELineData | null> => {
  const key = `${type}:${resolution}`;
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }

  const data = await NaturalEarthLoader.load(type, resolution);
  cache.set(key, data);
  return data;
};
