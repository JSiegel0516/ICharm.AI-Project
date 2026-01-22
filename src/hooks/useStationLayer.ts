import { useEffect, useState } from "react";
import type { Dataset } from "@/types";

export type StationMarker = {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  elevation?: number;
};

export type StationLayerData = {
  stations: StationMarker[];
  count: number;
};

export type UseStationLayerResult = {
  data?: StationLayerData;
  isLoading: boolean;
  error: string | null;
};

export const useStationLayer = (
  dataset?: Dataset | null,
  selectedDate?: Date | null,
): UseStationLayerResult => {
  const [data, setData] = useState<StationLayerData | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dataset) {
      setData(undefined);
      setError(null);
      return;
    }

    // Check if this is a station dataset
    const isStationDataset =
      (dataset.backend?.datasetType ?? dataset.dataType ?? "")
        .toString()
        .toLowerCase() === "station";

    if (!isStationDataset) {
      setData(undefined);
      setError(null);
      return;
    }

    const fetchStations = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Build query params: filter by date if provided
        let url = "/api/stations/list";
        if (selectedDate) {
          const year = selectedDate.getFullYear();
          const month = selectedDate.getMonth() + 1;
          url += `?year=${year}&month=${month}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch stations: ${response.statusText}`);
        }

        const result = await response.json();

        const stations: StationMarker[] = result.stations.map(
          (station: any) => ({
            id: station.station_id,
            latitude: station.latitude,
            longitude: station.longitude,
            name: station.name,
            elevation: station.elevation,
          })
        );

        setData({
          stations,
          count: result.total_available ?? stations.length,
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("[useStationLayer] Error:", errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStations();
  }, [dataset, selectedDate]);

  return { data, isLoading, error };
};
