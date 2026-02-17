"use client";

import React from "react";
import NavigationIcons from "@/app/(frontpage)/_components/header/NavigationIcons";
import Link from "next/link";
import { useAppState } from "@/context/HeaderContext";
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

const Header: React.FC = () => {
  const { currentDataset } = useAppState();

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 mt-2 flex items-center justify-between px-4 py-2 lg:px-10 lg:py-8">
        {/* Logo - Left */}
        <Link href="/" className="flex items-center gap-3 lg:gap-4">
          <img
            src="/images/icharmlogo.png"
            alt="IC Logo"
            className="h-6 w-6 rounded-lg lg:h-10 lg:w-10"
          />
          <h1 className="bg-linear-to-r from-red-400 via-green-400 to-blue-400 bg-clip-text text-base font-semibold text-transparent lg:text-xl">
            iCHARM
          </h1>
        </Link>

        {/* Title - Center */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              title="Click for dataset details"
              id="dataset-title"
              className="flex flex-col items-center text-base font-semibold lg:text-3xl"
            >
              <span>{currentDataset?.name}</span>
              <span className="font-normal lg:text-2xl">
                {currentDataset?.statistic}
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-156">
            <DialogHeader>
              <DialogTitle className="mb-2 text-2xl font-semibold">
                {currentDataset?.name}
              </DialogTitle>
              <DialogDescription className="text-lg">
                <span className="text-xl">
                  {currentDataset?.description || "No description available"}
                </span>
                <br />
                <br />
                <span>
                  Date Range:{" "}
                  {currentDataset?.startDate && currentDataset?.endDate
                    ? `${new Date(currentDataset.startDate).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "numeric",
                          day: "numeric",
                        },
                      )} - ${new Date(
                        currentDataset.endDate,
                      ).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "numeric",
                        day: "numeric",
                      })}`
                    : "Date information not available"}
                </span>
                <br />
                <span>Units: {currentDataset?.units} </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Navigation - Right */}
        <NavigationIcons />
      </div>
    </>
  );
};

export default Header;
