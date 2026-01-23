"use client";

import React, { useState, useRef, useEffect } from "react";
import { Gauge, ChevronDown, Check } from "lucide-react";
import { PressureLevel, PressureLevelsSelectorProps } from "@/types";
import { pressureLevels, altitudeDescriptions } from "@/utils/constants";

const PressureLevelsSelector: React.FC<PressureLevelsSelectorProps> = ({
  selectedLevel,
  onLevelChange,
  className = "",
  levels,
  disabled = false,
  label = "Pressure Levels",
  helperText,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const availableLevels = levels && levels.length > 0 ? levels : pressureLevels;
  const activeLevel = selectedLevel ?? availableLevels[0] ?? null;
  const buttonDisabled = disabled || !activeLevel;

  // Filter levels based on search term
  const filteredLevels = availableLevels.filter(
    (level) =>
      level.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      level.value.toString().includes(searchTerm),
  );

  // Handle level selection
  const handleLevelSelect = (level: PressureLevel) => {
    setIsOpen(false);
    setSearchTerm("");
    onLevelChange?.(level);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      setSearchTerm("");
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Button */}
      <button
        ref={buttonRef}
        onClick={() => {
          if (!buttonDisabled) {
            setIsOpen((prev) => !prev);
          }
        }}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all duration-200 focus:outline-none ${
          buttonDisabled
            ? "cursor-not-allowed border-gray-600/30 bg-neutral-800 text-gray-600"
            : isOpen
              ? "border-white/30 bg-neutral-700 text-white"
              : "border-gray-500/30 bg-neutral-800 text-gray-400 hover:scale-105 hover:border-white/20 hover:bg-neutral-700 hover:text-white"
        }`}
        title="Select Pressure Level"
        type="button"
        disabled={buttonDisabled}
      >
        <Gauge size={14} />
        <span className="min-w-[70px] text-left">
          {activeLevel ? activeLevel.label : "No levels"}
        </span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {!buttonDisabled && helperText && (
        <p className="mt-2 text-xs text-gray-400">{helperText}</p>
      )}

      {/* Dropdown */}
      {isOpen && !buttonDisabled && (
        <div
          ref={dropdownRef}
          className="absolute right-0 bottom-full z-50 mb-2 w-72 rounded-xl border border-white/20 bg-neutral-800/95 p-4 shadow-2xl backdrop-blur-md"
          style={{
            transform: "translateY(-8px)",
          }}
          onKeyDown={handleKeyDown}
        >
          {/* Header */}
          <div className="mb-3">
            <h3 className="mb-2 text-lg font-semibold text-white">{label}</h3>

            {/* Search Input */}
            <input
              ref={searchRef}
              type="text"
              placeholder="Search levels..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50 focus:border-white/40 focus:ring-2 focus:ring-white/20 focus:outline-none"
            />
          </div>

          {/* Levels List */}
          <div className="custom-scrollbar max-h-64 space-y-1 overflow-y-auto">
            {filteredLevels.length > 0 ? (
              filteredLevels.map((level) => {
                const isSelected = level.id === activeLevel?.id;
                const description =
                  altitudeDescriptions[level.id] ||
                  (level.unit ? `${level.value} ${level.unit}` : "");

                return (
                  <button
                    key={level.id}
                    onClick={() => handleLevelSelect(level)}
                    className={`flex w-full items-center justify-between rounded-lg p-3 text-left transition-all duration-200 hover:scale-[1.02] focus:outline-none ${
                      isSelected
                        ? "bg-white/20 text-white ring-2 ring-white/30"
                        : "text-gray-300 hover:bg-white/10 hover:text-white"
                    }`}
                    type="button"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{level.label}</span>
                        {isSelected && (
                          <Check size={16} className="text-green-400" />
                        )}
                      </div>
                      {description && (
                        <span className="text-xs text-gray-400">
                          {description}
                        </span>
                      )}
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      {level.value} {level.unit}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-gray-400">
                No levels found matching "{searchTerm}"
              </div>
            )}
          </div>

          {/* Footer Info */}
          {activeLevel && (
            <div className="mt-4 border-t border-white/10 pt-3 text-xs text-gray-400">
              <div className="mb-1">
                <strong className="text-gray-300">Current:</strong>{" "}
                {activeLevel.label}
              </div>
              <div>
                <strong className="text-gray-300">Value:</strong>{" "}
                {activeLevel.value} {activeLevel.unit}
              </div>
            </div>
          )}

          {/* Rainbow bar at bottom */}
          <div className="mt-4 h-1 w-full rounded-full bg-linear-to-r from-red-500 via-blue-500 via-green-500 via-indigo-500 via-yellow-500 to-purple-500"></div>
          {/* Custom Scrollbar Styles */}
          <style jsx>{`
            .custom-scrollbar::-webkit-scrollbar {
              width: 6px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: #475569;
              border-radius: 3px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: #64748b;
              border-radius: 3px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: #94a3b8;
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default PressureLevelsSelector;
