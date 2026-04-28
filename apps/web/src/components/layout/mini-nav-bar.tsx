"use client";

import { motion } from "framer-motion";

import { BrandMenu } from "@/components/web/brand-menu";

import { SectionShell } from "./section";

export function MiniNavBar() {
  return (
    <motion.div
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.28, delay: 0.04, ease: "easeOut" }}
      className="bg-background border-border fixed top-0 right-0 left-0 z-50 flex justify-center border-b"
    >
      <SectionShell>
        <div className="flex h-12 items-center px-12">
          <BrandMenu />
        </div>
      </SectionShell>
    </motion.div>
  );
}
