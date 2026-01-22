"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Station {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
}

interface StationSearchProps {
  stations: Station[];
  onStationSelect: (station: Station) => void;
}

export const StationSearch: React.FC<StationSearchProps> = ({
  stations,
  onStationSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [filteredStations, setFilteredStations] = useState<Station[]>([]);

  useEffect(() => {
    if (!searchValue) {
      setFilteredStations([]);
      return;
    }

    const query = searchValue.toLowerCase();
    
    // Check if it's a coordinate search (contains comma or numbers with optional N/S/E/W)
    const isCoordinateSearch = /[-\d.]+[,\s]+[-\d.]+/.test(query);
    
    if (isCoordinateSearch) {
      // Parse coordinates (supports formats like "40.7, -74.0" or "40.7 N, 74.0 W")
      const coords = query.match(/[-\d.]+/g);
      if (coords && coords.length >= 2) {
        const searchLat = parseFloat(coords[0]);
        const searchLon = parseFloat(coords[1]);
        
        if (!isNaN(searchLat) && !isNaN(searchLon)) {
          // Find stations within ~5 degrees
          const nearby = stations
            .filter((station) => {
              const latDiff = Math.abs(station.latitude - searchLat);
              const lonDiff = Math.abs(station.longitude - searchLon);
              return latDiff <= 5 && lonDiff <= 5;
            })
            .sort((a, b) => {
              const distA = Math.sqrt(
                Math.pow(a.latitude - searchLat, 2) +
                  Math.pow(a.longitude - searchLon, 2)
              );
              const distB = Math.sqrt(
                Math.pow(b.latitude - searchLat, 2) +
                  Math.pow(b.longitude - searchLon, 2)
              );
              return distA - distB;
            })
            .slice(0, 10);
          setFilteredStations(nearby);
          return;
        }
      }
    }

    // Name-based search
    const matches = stations
      .filter((station) => station.name.toLowerCase().includes(query))
      .slice(0, 20);
    
    setFilteredStations(matches);
  }, [searchValue, stations]);

  const handleSelect = (station: Station) => {
    onStationSelect(station);
    setSearchValue("");
    setOpen(false);
  };

  return (
    <div className="absolute top-24 left-4 z-10">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-[300px] justify-start text-left font-normal bg-white/95 backdrop-blur-sm border-gray-300 hover:bg-white"
          >
            <Search className="mr-2 h-4 w-4 opacity-50" />
            <span className="text-gray-500">Search stations...</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              placeholder="Station name or coordinates..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-9"
            />
          </div>
          <ScrollArea className="h-[300px]">
            {searchValue && filteredStations.length === 0 && (
              <div className="p-4 text-sm text-center text-gray-500">
                No stations found.
              </div>
            )}
            {filteredStations.length > 0 && (
              <div className="p-1">
                {filteredStations.map((station) => (
                  <button
                    key={station.id}
                    onClick={() => handleSelect(station)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded-sm cursor-pointer transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{station.name}</span>
                      <span className="text-xs text-gray-500">
                        {station.latitude.toFixed(4)}°, {station.longitude.toFixed(4)}°
                        {station.elevation && ` • ${station.elevation}m`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
};
