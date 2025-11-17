"use client";

import React, { useState } from "react";
import { AlertCircle, Loader2, MapPin, Search, X } from "lucide-react";

export type LocationSearchResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  type?: string | null;
  importance?: number | null;
};

interface ChatSearchDropdownProps {
  query: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onClose: () => void;
  results: LocationSearchResult[];
  isLoading?: boolean;
  error?: string | null;
  onSelectResult?: (result: LocationSearchResult) => void;
}

const ChatSearchDropdown: React.FC<ChatSearchDropdownProps> = ({
  query,
  onChange,
  onSubmit,
  onClose,
  results,
  isLoading = false,
  error,
  onSelectResult,
}) => {
  const [touched, setTouched] = useState(false);

  const handleSubmit = () => {
    setTouched(true);
    if (query.trim().length >= 2) {
      onSubmit(query.trim());
    }
  };

  return (
    <div className="pointer-events-auto w-72 rounded-xl border border-gray-700/40 bg-neutral-900/95 p-4 text-gray-100 shadow-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Location Search</p>
          <p className="text-xs text-gray-400">
            Find a city, state, or country
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-gray-400 transition hover:bg-neutral-800"
          aria-label="Close search panel"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-3 space-y-2">
        <label className="text-xs tracking-wide text-gray-500 uppercase">
          Search
        </label>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-700/60 bg-neutral-800/70 px-3 py-2 text-gray-100 focus-within:border-gray-500">
            <Search size={14} className="text-gray-400" />
            <input
              value={query}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Enter a city, state, or country"
              className="flex-1 bg-transparent text-sm placeholder:text-gray-500 focus:outline-none"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={query.trim().length < 2 || isLoading}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Go
          </button>
        </div>

        <div className="rounded-lg border border-gray-700/50 bg-neutral-900/60 p-3">
          {error ? (
            <div className="flex items-center gap-2 text-sm text-red-300">
              <AlertCircle size={16} />
              <p>{error}</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin text-blue-200" />
              Searching…
            </div>
          ) : results.length > 0 ? (
            <ul className="custom-scrollbar max-h-56 space-y-2 overflow-y-auto pr-1">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => onSelectResult?.(result)}
                    className="flex w-full items-start gap-2 rounded-lg border border-transparent bg-neutral-800/70 px-3 py-2 text-left text-sm text-gray-100 transition hover:border-blue-500/50 hover:bg-neutral-800"
                  >
                    <MapPin size={16} className="mt-0.5 text-blue-300" />
                    <div>
                      <p className="leading-snug font-medium">{result.label}</p>
                      <p className="text-xs text-gray-400">
                        {result.latitude.toFixed(2)}°,{" "}
                        {result.longitude.toFixed(2)}°
                        {result.type ? ` • ${result.type}` : ""}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : touched && query.trim().length >= 2 ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <MapPin size={16} className="text-blue-300" />
              <p>No locations matched that search.</p>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              Results will appear here after you search.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatSearchDropdown;
