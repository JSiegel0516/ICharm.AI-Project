import React from "react";

interface GlobeLoadingProps {
  message?: string;
  subtitle?: string;
}

const GlobeLoading: React.FC<GlobeLoadingProps> = ({
  message = "Loading globe…",
  subtitle,
}) => (
  <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm text-white">
    <div className="mb-5 h-10 w-10 animate-spin rounded-full border-2 border-white border-t-transparent" />
    <h2 className="text-lg font-semibold tracking-wide">{message}</h2>
    {subtitle ? (
      <p className="mt-2 text-xs text-slate-300">{subtitle}</p>
    ) : null}
  </div>
);

export default GlobeLoading;
