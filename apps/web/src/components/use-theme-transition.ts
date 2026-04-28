"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

type ActiveTheme = "dark" | "light";
type ThemeMode = ActiveTheme | "system";

type ViewTransitionLike = {
  finished: Promise<void>;
};

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => Promise<void> | void) => ViewTransitionLike;
};

function applyThemeToDocument(theme: ActiveTheme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

function getSystemTheme(systemTheme?: string): ActiveTheme {
  if (systemTheme === "dark" || systemTheme === "light") {
    return systemTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useThemeTransition() {
  const { resolvedTheme, setTheme, systemTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const themeMode: ThemeMode = theme === "dark" || theme === "light" ? theme : "system";
  const activeTheme: ActiveTheme = mounted && resolvedTheme === "dark" ? "dark" : "light";
  const activeSystemTheme: ActiveTheme = mounted ? getSystemTheme(systemTheme) : "light";
  const nextMode: ThemeMode =
    themeMode === "system" ? (activeTheme === "dark" ? "light" : "dark") : "system";
  const nextAppliedTheme: ActiveTheme = nextMode === "system" ? activeSystemTheme : nextMode;
  const toggleLabel =
    nextMode === "system"
      ? `Use system theme (${activeSystemTheme})`
      : `Switch to ${nextAppliedTheme} theme`;

  const toggleTheme = () => {
    if (!mounted || isTransitioning) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTheme(nextMode);
      return;
    }

    const documentWithTransition = document as DocumentWithViewTransition;

    if (!documentWithTransition.startViewTransition) {
      setTheme(nextMode);
      return;
    }

    const runTransition = async () => {
      setIsTransitioning(true);
      document.documentElement.dataset.themeTransition = "active";

      try {
        const transition = documentWithTransition.startViewTransition(() => {
          applyThemeToDocument(nextAppliedTheme);

          flushSync(() => {
            setTheme(nextMode);
          });
        });

        await transition.finished;
      } finally {
        delete document.documentElement.dataset.themeTransition;
        setIsTransitioning(false);
      }
    };

    void runTransition();
  };

  return {
    activeTheme,
    mounted,
    themeMode,
    toggleLabel,
    toggleTheme,
  };
}
