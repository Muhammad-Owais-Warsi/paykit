"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CopyMarkdownButton({ markdownUrl }: { markdownUrl: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    void fetch(markdownUrl)
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.text();
      })
      .then((text) => navigator.clipboard.writeText(text))
      .catch(() => {
        toast.error("Failed to copy markdown");
        setCopied(false);
      });
  }, [markdownUrl]);

  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={onClick}>
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy Markdown"}
    </Button>
  );
}
