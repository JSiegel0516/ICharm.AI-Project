import useSWR from "swr";
import { transformDatasets, Dataset } from "@/utils/transform-datasets";

interface DatasetsResponse {
  datasets: any[];
}

// Fetcher function for SWR
const fetcher = async (url: string): Promise<Dataset[]> => {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Failed to fetch datasets");
  }

  const data: DatasetsResponse = await res.json();

  // Transform database records to UI format
  return transformDatasets(data.datasets);
};

/**
 * Custom hook to fetch and cache climate datasets
 * Uses SWR for automatic caching, revalidation, and state management
 *
 * @returns {object} - { datasets, isLoading, isError, mutate }
 */
export function useDatasets() {
  const { data, error, mutate, isLoading } = useSWR<Dataset[]>(
    "/api/datasets",
    fetcher,
    {
      revalidateOnFocus: false, // Don't refetch when window regains focus (datasets rarely change)
      revalidateOnReconnect: false, // Don't refetch on reconnect
      dedupingInterval: 60000, // Dedupe requests within 60 seconds
    },
  );

  return {
    datasets: data || [],
    isLoading,
    isError: error,
    mutate, // Expose mutate for manual revalidation if needed
  };
}
