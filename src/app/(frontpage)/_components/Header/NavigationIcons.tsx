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
            <Tooltip>
              <TooltipTrigger>
                <ChartSplineIcon />
              </TooltipTrigger>
              <TooltipContent>
                <p>Time Series Analysis</p>
              </TooltipContent>
            </Tooltip>
          </Button>
        </Link>
      </ButtonGroup>
      <ButtonGroup>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Info"
              id="about-me-button"
            >
              <Tooltip>
                <TooltipTrigger>
                  <Info />
                </TooltipTrigger>
                <TooltipContent>
                  <p>About</p>
                </TooltipContent>
              </Tooltip>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-center">About iCharm</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              Interactive Climate and Atmospheric Research Model
            </div>
            <DialogFooter>footer here</DialogFooter>
          </DialogContent>
        </Dialog>
      </ButtonGroup>
      <ButtonGroup>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Settings"
              id="site-settings-button"
            >
              <Tooltip>
                <TooltipTrigger>
                  <SettingsGearIcon />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Settings</p>
                </TooltipContent>
              </Tooltip>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
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
