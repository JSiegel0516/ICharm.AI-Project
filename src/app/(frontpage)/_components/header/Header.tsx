"use client";

import React from "react";
import NavigationIcons from "@/app/(frontpage)/_components/header/NavigationIcons";
import MobileNav from "@/app/(frontpage)/_components/header/mobile-nav";
import Link from "next/link";
import { useAppState } from "@/context/dataset-context";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChartSplineIcon } from "@/components/ui/chart-spline";

const Header: React.FC = () => {
  const { currentDataset } = useAppState();

  const datasetTrigger = (
    <div
      title="Click for dataset details"
      id="dataset-title"
      className="flex cursor-pointer flex-col items-center rounded-md text-center text-base font-semibold transition-colors hover:bg-white/10 lg:text-3xl"
    >
      <span>{currentDataset?.name}</span>
      <span className="text-sm font-normal lg:text-2xl">
        {currentDataset?.statistic}
      </span>
    </div>
  );

  const datasetDialog = (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <DialogTitle className="text-2xl font-semibold">
            {currentDataset?.name}
          </DialogTitle>
          <Badge variant="secondary" className="capitalize">
            {currentDataset?.dataType}
          </Badge>
        </div>
        {currentDataset?.statistic && (
          <p className="text-muted-foreground text-sm">
            {currentDataset.statistic}
          </p>
        )}
      </DialogHeader>

      <Separator />

      <div className="space-y-4">
        <p className="text-sm leading-relaxed">
          {currentDataset?.description || "No description available"}
        </p>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-muted-foreground font-medium">Source</p>
            <p>{currentDataset?.sourceName ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground font-medium">Units</p>
            <p>{currentDataset?.units}</p>
          </div>
          <div>
            <p className="text-muted-foreground font-medium">
              Temporal Resolution
            </p>
            <p className="capitalize">{currentDataset?.temporalResolution}</p>
          </div>
          <div>
            <p className="text-muted-foreground font-medium">
              Spatial Resolution
            </p>
            <p>{currentDataset?.spatialResolution ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground font-medium">Date Range</p>
            <p>
              {currentDataset?.startDate && currentDataset?.endDate
                ? `${new Date(currentDataset.startDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} — ${new Date(currentDataset.endDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`
                : "—"}
            </p>
          </div>
          {currentDataset?.levels && (
            <div>
              <p className="text-muted-foreground font-medium">Levels</p>
              <p>
                {currentDataset.levels}
                {currentDataset.levelUnits
                  ? ` ${currentDataset.levelUnits}`
                  : ""}
              </p>
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );

  return (
    <div className="fixed inset-x-0 top-0 z-50 mx-4 mt-4 lg:mx-10 lg:mt-6">
      {/* Mobile layout */}
      <div className="flex flex-col items-start gap-1 sm:hidden">
        <div className="mb-2 flex w-full items-center justify-between">
          <MobileNav />
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/images/icharmlogo.png"
              alt="IC Logo"
              className="h-6 w-6 rounded-lg"
            />
            <h1 className="bg-linear-to-r from-red-400 via-green-400 to-blue-400 bg-clip-text text-base font-semibold text-transparent">
              iCHARM
            </h1>
          </Link>
          <Link
            href="/dashboard/timeseries"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center"
          >
            <Button
              variant="outline"
              size="icon"
              aria-label="Data Analysis Dashboard"
              id="time-series-button"
            >
              <ChartSplineIcon />
            </Button>
          </Link>
        </div>
        <Dialog>
          <DialogTrigger asChild>{datasetTrigger}</DialogTrigger>
          {datasetDialog}
        </Dialog>
      </div>

      {/* Tablet layout */}
      <div className="hidden items-start justify-between md:flex lg:hidden">
        <div className="flex flex-1 flex-row gap-4">
          <MobileNav />
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/images/icharmlogo.png"
              alt="IC Logo"
              className="h-6 w-6 rounded-lg"
            />
            <h1 className="bg-linear-to-r from-red-400 via-green-400 to-blue-400 bg-clip-text text-base font-semibold text-transparent">
              iCHARM
            </h1>
          </Link>
        </div>

        <Dialog>
          <DialogTrigger asChild>{datasetTrigger}</DialogTrigger>
          {datasetDialog}
        </Dialog>

        <div className="flex flex-1 justify-end">
          <Link
            href="/dashboard/timeseries"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center"
          >
            <Button
              variant="outline"
              size="icon"
              aria-label="Data Analysis Dashboard"
              id="time-series-button"
            >
              <ChartSplineIcon />
            </Button>
          </Link>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden items-start justify-between lg:flex">
        <Link href="/" className="flex items-center gap-4">
          <img
            src="/images/icharmlogo.png"
            alt="IC Logo"
            className="h-10 w-10 rounded-lg"
          />
          <h1 className="bg-linear-to-r from-red-400 via-green-400 to-blue-400 bg-clip-text text-xl font-semibold text-transparent">
            iCHARM
          </h1>
        </Link>

        <Dialog>
          <DialogTrigger asChild>{datasetTrigger}</DialogTrigger>
          {datasetDialog}
        </Dialog>

        <NavigationIcons />
      </div>
    </div>
  );
};

export default Header;
