"use client";

import * as React from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CalendarPlusIcon,
  ClockIcon,
  ListFilterPlusIcon,
  MailCheckIcon,
  MoreHorizontalIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import Link from "next/link";
import { ChartSplineIcon } from "@/components/ui/chart-spline";
import { SettingsGearIcon } from "@/components/ui/settings-gear";
import { Info } from "lucide-react";

export default function NavigationIcons() {
  const [label, setLabel] = React.useState("personal");

  return (
    <ButtonGroup>
      <ButtonGroup className="hidden sm:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/dashboard/timeseries"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center"
            >
              <Button
                variant="outline"
                size="icon"
                aria-label="Time Series Analysis"
                id="time-series-button"
              >
                <ChartSplineIcon />
              </Button>
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <p>Time Series Analysis</p>
          </TooltipContent>
        </Tooltip>
      </ButtonGroup>
      <ButtonGroup>
        <Dialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Info"
                  id="about-me-button"
                >
                  <Info />
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>About</p>
            </TooltipContent>
          </Tooltip>
          <DialogContent className="sm:max-w-[825px]">
            <DialogHeader>
              <DialogTitle className="text-center">About iCharm</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              Interactive Climate and Atmospheric Research Model
            </div>
            <DialogDescription>
              Everyone talks about global warming or climate change, but few
              have seen the climate data, because accessing climate data can be
              a technically challenging task. This 4-Dimensional Visual Delivery
              of Big Climate Data (4DVD) enables anyone to access climate data
              immediately as long as the person can navigate a website. 4DVD is
              a unique software developed at the Climate Informatics Lab, San
              Diego State University, for the instant delivery of big climate
              data to classrooms and households around the world in a convenient
              and visual way. It works like an Amazon audio book shopping
              experience. In fact, at one time 4DVD partnered with Amazon and
              used Amazon Web Services (AWS), which is a cloud service from
              Amazon, to store and deliver the climate data. 4DVD makes the
              climate data acquisition in the same way as one shops on Amazon
              for digital products, such as digital books or movies.{" "}
            </DialogDescription>
            <DialogFooter>
              <div className="text-sm text-gray-400">© 2025 iCharm</div>
              <div className="text-sm text-gray-400">Version 1.0.0</div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ButtonGroup>
      <ButtonGroup>
        <Dialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Settings"
                  id="site-settings-button"
                >
                  <SettingsGearIcon />
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>
          <DialogContent className="sm:max-w-[925px]">
            <DialogHeader>
              <DialogTitle className="text-center">Settings</DialogTitle>
              <DialogDescription>
                Make changes to your profile here. Click save when you&apos;re
                done.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">asd</div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Save</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ButtonGroup>
    </ButtonGroup>
  );
}
