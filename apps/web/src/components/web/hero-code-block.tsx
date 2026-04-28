"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Loader2, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type View = "code" | "terminal";

type Segment = { text: string; color?: string };
type PushStep = { segments: Segment[]; type: string; delay?: number };

const bar = "text-white/15";
const normal = "text-white/85";
const green = "text-emerald-400";
const purple = "text-violet-400";

const pushSteps: PushStep[] = [
  {
    segments: [
      { text: "❯ ", color: normal },
      { text: "npx paykitjs push", color: normal },
    ],
    type: "line",
  },
  { segments: [], type: "pause" },
  { segments: [{ text: "│", color: bar }], type: "line" },
  {
    segments: [
      { text: "●", color: purple },
      { text: " Connected", color: normal },
    ],
    type: "line",
  },
  {
    segments: [
      { text: "│", color: bar },
      { text: "  Database · postgresql://localhost:5432/paykit", color: normal },
    ],
    type: "line",
  },
  {
    segments: [
      { text: "│", color: bar },
      { text: "  Stripe   · PayKit (sandbox)", color: normal },
    ],
    type: "line",
  },
  { segments: [{ text: "│", color: bar }], type: "line" },
  {
    segments: [
      { text: "◆", color: green },
      { text: " Schema is up to date", color: normal },
    ],
    type: "line",
  },
  { segments: [{ text: "│", color: bar }], type: "line" },
  {
    segments: [
      { text: "◇", color: green },
      { text: " Plan changes", color: normal },
    ],
    type: "line",
  },
  {
    segments: [
      { text: "│", color: bar },
      { text: "  + free ($0)    ", color: green },
      { text: "new", color: normal },
    ],
    type: "line",
  },
  {
    segments: [
      { text: "│", color: bar },
      { text: "  + pro ($19/mo) ", color: green },
      { text: "new", color: normal },
    ],
    type: "line",
  },
  { segments: [{ text: "│", color: bar }], type: "line" },
  {
    segments: [
      { text: "◆", color: green },
      { text: " Plans synced", color: normal },
    ],
    type: "line",
  },
  { segments: [{ text: "│", color: bar }], type: "line" },
  {
    segments: [
      { text: "●", color: green },
      { text: " Done · 2 plans synced", color: normal },
    ],
    type: "line",
  },
];

export function HeroCodeBlock({
  plansCodeBlock,
  configCodeBlock,
}: {
  plansCodeBlock: ReactNode;
  configCodeBlock: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<"plans" | "config">("plans");
  const [view, setView] = useState<View>("code");
  const [terminalLines, setTerminalLines] = useState<typeof pushSteps>([]);
  const [pushing, setPushing] = useState(false);

  const runPush = useCallback(async () => {
    if (pushing) return;
    setPushing(true);
    setView("terminal");
    setTerminalLines([]);

    for (const step of pushSteps) {
      const delay = step.type === "pause" ? 800 : (step.delay ?? 150);

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (step.type !== "pause") {
            setTerminalLines((prev) => [...prev, step]);
          }
          resolve();
        }, delay);
      });
    }

    setPushing(false);
  }, [pushing]);

  const backToCode = useCallback(() => {
    setView("code");
    setTerminalLines([]);
  }, []);

  return (
    <div className="border-border w-full max-w-full min-w-0 rounded-[10px] border p-[4px] sm:w-[37rem] lg:w-full lg:max-w-[37rem]">
      <div className="border-foreground/[0.1] bg-card flex flex-col overflow-hidden rounded-[6px] border">
        {/* Tab bar */}
        <div className="border-foreground/[0.08] flex items-center border-b">
          <div className="flex flex-1 pl-0.5">
            {view === "code" ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab("plans")}
                  className={cn(
                    "relative px-3.5 py-2 text-sm transition-colors",
                    activeTab === "plans"
                      ? "text-foreground/80"
                      : "text-foreground/40 hover:text-foreground/60",
                  )}
                >
                  plans.ts
                  {activeTab === "plans" && (
                    <span className="bg-foreground/50 absolute right-2 bottom-0 left-2 h-px" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("config")}
                  className={cn(
                    "relative px-3.5 py-2 text-sm transition-colors",
                    activeTab === "config"
                      ? "text-foreground/80"
                      : "text-foreground/40 hover:text-foreground/60",
                  )}
                >
                  paykit.ts
                  {activeTab === "config" && (
                    <span className="bg-foreground/50 absolute right-2 bottom-0 left-2 h-px" />
                  )}
                </button>
              </>
            ) : (
              <span className="text-foreground/50 px-4 py-2 font-mono text-sm">Terminal</span>
            )}
          </div>
        </div>

        {/* Content — fixed height */}
        <div className="relative h-[22rem] lg:h-[27.5rem]">
          {/* Push / back button */}
          <div className="absolute right-2.5 bottom-2.5 z-10">
            <Button
              variant="outline"
              size={"sm"}
              onClick={view === "code" ? () => void runPush() : backToCode}
              disabled={pushing}
              className={"not-hover:bg-secondary/80!"}
            >
              {view === "code" ? (
                <Terminal className="size-3.5" />
              ) : (
                <ChevronLeft className="size-3.5 -ml-1" />
              )}
              {view === "code" ? "Terminal" : "Back to code"}
            </Button>
          </div>
          <div className="h-full min-h-0 min-w-0 overflow-hidden">
            {view === "code" ? (
              <>
                <div className={activeTab === "plans" ? "block h-full min-w-0" : "hidden"}>
                  {plansCodeBlock}
                </div>
                <div className={activeTab === "config" ? "block h-full min-w-0" : "hidden"}>
                  {configCodeBlock}
                </div>
              </>
            ) : (
              <div className="h-full bg-[#0e0e0e] p-4 font-mono text-[12px] leading-relaxed">
                <AnimatePresence initial={false}>
                  {terminalLines.map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className="min-h-[1.4em] whitespace-pre"
                    >
                      {line.segments.map((seg, j) => (
                        <span key={j} className={seg.color}>
                          {seg.text}
                        </span>
                      ))}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {pushing && terminalLines.length > 0 && (
                  <Loader2 className="mt-1 size-3 animate-spin text-white/30" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
