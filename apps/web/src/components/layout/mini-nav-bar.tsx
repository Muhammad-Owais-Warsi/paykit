"use client";

import { motion } from "framer-motion";
import Link from "next/link";

import { Wordmark } from "@/components/icons/wordmark";
import { BrandMenu } from "@/components/web/brand-menu";

import { SectionShell } from "./section";

export function MiniNavBar() {
  return (
    <div className="pointer-events-none fixed top-0 right-0 left-0 z-99 flex items-start [scrollbar-gutter:stable]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="bg-background border-border pointer-events-auto w-full border-b lg:hidden"
      >
        <SectionShell className="flex items-center">
          <Link href="/" aria-label="PayKit home" className="flex items-center gap-1 px-5 py-3">
            <Wordmark title={null} className="h-4 origin-left scale-95" />
          </Link>
        </SectionShell>
      </motion.div>

      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.28, delay: 0.04, ease: "easeOut" }}
        className="bg-background border-border pointer-events-auto relative hidden w-full items-stretch justify-center border-b lg:flex"
      >
        <SectionShell>
          <div className="flex h-12 items-center px-12">
            <BrandMenu />
          </div>
        </SectionShell>
      </motion.div>
    </div>
  );
}
