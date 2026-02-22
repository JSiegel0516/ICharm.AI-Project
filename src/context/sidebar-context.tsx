"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

type SidebarPanel = "calendar" | "datasets" | "globeSettings" | null;

interface SidebarActions {
  onShowTutorial: () => void;
  onDownload: () => void;
  onShowVisualizationModal: () => void;
  onShowSidebarPanel: (panel: "datasets" | "history" | "about" | null) => void;
}

interface SidebarContextValue {
  /** Which panel flyout is currently visible (null = none / show buttons) */
  activePanel: SidebarPanel;
  openPanel: (panel: SidebarPanel) => void;
  closePanel: () => void;

  /** Registered action callbacks — set once by the page that owns them */
  actions: SidebarActions;
  registerActions: (actions: SidebarActions) => void;

  /** Download-in-progress flag */
  isDownloading: boolean;
  setIsDownloading: (v: boolean) => void;
}

const noop = () => {};

const defaultActions: SidebarActions = {
  onShowTutorial: noop,
  onDownload: noop,
  onShowVisualizationModal: noop,
  onShowSidebarPanel: noop,
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [activePanel, setActivePanel] = useState<SidebarPanel>(null);
  const [actions, setActions] = useState<SidebarActions>(defaultActions);
  const [isDownloading, setIsDownloading] = useState(false);

  const openPanel = useCallback((panel: SidebarPanel) => {
    setActivePanel(panel);
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  const registerActions = useCallback((newActions: SidebarActions) => {
    setActions(newActions);
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        activePanel,
        openPanel,
        closePanel,
        actions,
        registerActions,
        isDownloading,
        setIsDownloading,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
