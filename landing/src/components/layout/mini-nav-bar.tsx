"use client";

import { motion } from "framer-motion";
import Link from "next/link";

import { Wordmark } from "@/components/icons/wordmark";

import { DashedLine } from "./section";

export function MiniNavBar() {
  return (
    <motion.div
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.28, delay: 0.04, ease: "easeOut" }}
      className="bg-background fixed top-0 right-0 left-0 z-50 flex justify-center border-b"
    >
      <div className="relative w-full max-w-[76rem]">
        <div className="hidden min-[76rem]:block">
          <DashedLine orientation="vertical" />
        </div>
        <div className="absolute top-0 right-0 hidden h-full min-[76rem]:block">
          <DashedLine orientation="vertical" />
        </div>
        <div className="flex items-center px-12 py-3.5">
          <Link href="/" className="flex items-center">
            <Wordmark className="h-5 scale-105" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
