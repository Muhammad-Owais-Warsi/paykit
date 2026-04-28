import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

import type { FlowEntry } from "./demo-types";
import { interactiveReplies, scriptedReplies } from "./demo-types";

export function useDemoAutoPlay({
  sectionRef,
  setInput,
  setAutoTyping,
  setMessages,
  setUsed,
  addCard,
  addEntry,
  streamReply,
  usedRef,
  limitRef,
}: {
  sectionRef: RefObject<HTMLDivElement | null>;
  setInput: (v: string) => void;
  setAutoTyping: (v: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<{ role: "user" | "ai"; text: string }[]>>;
  setUsed: React.Dispatch<React.SetStateAction<number>>;
  addCard: (trigger: string) => string;
  addEntry: (cId: string, entry: FlowEntry) => void;
  streamReply: (text: string, onStreamStart?: () => void) => Promise<void>;
  usedRef: RefObject<number>;
  limitRef: RefObject<number>;
}) {
  const hasPlayed = useRef(false);

  const typeText = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        setAutoTyping(true);
        let i = 0;
        const interval = setInterval(() => {
          i++;
          setInput(text.slice(0, i));
          if (i >= text.length) {
            clearInterval(interval);
            setAutoTyping(false);
            resolve();
          }
        }, 25);
      }),
    [setInput, setAutoTyping],
  );

  const wait = useCallback(
    (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    [],
  );

  const scriptSend = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        const currentUsed = usedRef.current ?? 0;
        const currentLimit = limitRef.current ?? 0;
        const newUsed = currentUsed + 1;
        const newRemaining = currentLimit - newUsed;

        setMessages((prev) => [...prev, { role: "user" as const, text }]);
        setInput("");

        const cId = addCard("Sent a message");
        addEntry(cId, { type: "code", snippet: "check" });

        if (newRemaining < 0) {
          addEntry(cId, {
            type: "step",
            icon: "shield-alert",
            label: "allowed: false · limit reached",
            success: false,
          });
          setUsed(newUsed);
          resolve();
          return;
        }

        setTimeout(() => {
          addEntry(cId, {
            type: "step",
            icon: "shield",
            label: `allowed: true · ${newRemaining} remaining`,
          });
        }, 350);

        const scriptIdx = newUsed - 1;
        const reply =
          scriptIdx < scriptedReplies.length
            ? scriptedReplies[scriptIdx]!
            : interactiveReplies[scriptIdx % interactiveReplies.length]!;

        void streamReply(reply, () => {
          addEntry(cId, { type: "code", snippet: "report" });
          setTimeout(() => {
            addEntry(cId, {
              type: "step",
              icon: "refresh",
              label: `Usage recorded · ${newRemaining}/${currentLimit}`,
            });
            setUsed(newUsed);
          }, 200);
        }).then(() => {
          setTimeout(resolve, 300);
        });
      }),
    [addCard, addEntry, streamReply, setInput, setMessages, setUsed, usedRef, limitRef],
  );

  const runAutoPlay = useCallback(async () => {
    await wait(600);

    await typeText("How does billing work?");
    await wait(200);
    await scriptSend("How does billing work?");
    await wait(800);

    await typeText("Can I add usage limits?");
    await wait(200);
    await scriptSend("Can I add usage limits?");
    await wait(800);

    await typeText("What happens when I hit the limit?");
    await wait(200);
    await scriptSend("What happens when I hit the limit?");
  }, [typeText, scriptSend, wait]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !hasPlayed.current) {
          hasPlayed.current = true;
          void runAutoPlay();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [runAutoPlay, sectionRef]);
}
