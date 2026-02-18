type GeoJsonData = {
  type: string;
  features?: any[];
};

const geoJsonCache = new Map<string, GeoJsonData>();
const geoJsonPending = new Map<string, Promise<GeoJsonData | null>>();

export const fetchGeoJson = async (
  url: string,
): Promise<GeoJsonData | null> => {
  if (geoJsonCache.has(url)) return geoJsonCache.get(url) ?? null;
  if (geoJsonPending.has(url)) return geoJsonPending.get(url) ?? null;

  const pending = fetch(url)
    .then((response) => {
      if (!response.ok) return null;
      return response.json() as Promise<GeoJsonData>;
    })
    .then((data) => {
      if (data) geoJsonCache.set(url, data);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      geoJsonPending.delete(url);
    });

  geoJsonPending.set(url, pending);
  return pending;
};

export const preloadGeoJson = (url: string) => {
  if (geoJsonCache.has(url) || geoJsonPending.has(url)) return;
  fetchGeoJson(url).catch(() => undefined);
};
