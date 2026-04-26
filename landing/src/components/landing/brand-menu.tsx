"use client";

import { Code2 } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/icons/logo";
import { WORDMARK_SVG, Wordmark } from "@/components/icons/wordmark";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type BrandAsset = "Logo" | "Wordmark";

const brandAssets = {
  Logo: '<svg width="44" height="50" viewBox="0 0 44 50" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.2441 20.4778L19.8545 26.0842C20.12 26.2391 20.2841 26.5255 20.2842 26.8352V50.0003L10.1152 44.0676V20.553C10.1155 20.4865 10.1871 20.4446 10.2441 20.4778ZM20.9277 0.290293C21.5915 -0.0966618 22.4096 -0.096867 23.0732 0.290293L42.9277 11.8733C43.5912 12.2606 43.9999 12.9761 44 13.7503V36.9153C43.9999 37.6897 43.5913 38.406 42.9277 38.7932L23.7168 50.0003V42.2034L36.459 34.7708C36.99 34.4609 37.3173 33.888 37.3174 33.2678V17.3997C37.3174 16.778 36.9888 16.2058 36.459 15.8967L22.8584 7.96217L22.8086 7.93482C22.304 7.66265 21.697 7.66216 21.1914 7.93482L21.1416 7.96217L7.54102 15.8967C7.00982 16.2067 6.68263 16.7796 6.68262 17.3997V36.262C6.68259 37.0483 6.68165 37.9225 6.68164 38.7962C6.68162 39.9535 6.68163 41.1112 6.68164 42.0657L1.07324 38.7932C0.40942 38.406 1.30519e-05 37.6898 0 36.9153V13.7503C0.000134393 12.9759 0.40953 12.2605 1.07324 11.8733L20.9277 0.290293ZM33.7559 20.4778C33.8131 20.4445 33.8848 20.4862 33.8848 20.553V31.7659C33.8848 32.0755 33.7213 32.3619 33.4561 32.5169L23.8457 38.1233C23.7885 38.1567 23.7168 38.1149 23.7168 38.0481V26.8352C23.7169 26.5255 23.8801 26.2391 24.1455 26.0842L33.7559 20.4778ZM21.5713 11.7171C21.8366 11.5625 22.1634 11.5625 22.4287 11.7171L32.0391 17.3235C32.0963 17.3569 32.0963 17.4405 32.0391 17.4739L22.4287 23.0803C22.1632 23.2351 21.8368 23.2351 21.5713 23.0803L11.96 17.4749C11.9028 17.4415 11.9029 17.3579 11.96 17.3245L21.5713 11.7171Z" fill="currentColor"/></svg>',
  Wordmark: WORDMARK_SVG,
};

export function BrandMenu() {
  const logoRef = useRef<HTMLAnchorElement>(null);

  async function copyAsSvg(asset: BrandAsset) {
    try {
      await navigator.clipboard.writeText(brandAssets[asset]);
      toast.success(`${asset} SVG code copied to clipboard.`, {
        icon: <Code2 className="size-4" />,
      });
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  }

  return (
    <div className="z-10 flex items-center">
      <ContextMenu>
        <ContextMenuTrigger
          className="flex items-center"
          render={
            <Link
              ref={logoRef}
              href="/"
              aria-label="PayKit home"
              className="flex items-center py-1.5"
            >
              <Wordmark title={undefined} className="h-5 origin-left scale-105" />
            </Link>
          }
        />

        <ContextMenuContent
          anchor={logoRef}
          align="start"
          alignOffset={0}
          side="bottom"
          sideOffset={4}
          positionerClassName="z-100"
        >
          <ContextMenuItem className="px-3" onClick={() => copyAsSvg("Logo")}>
            <Logo className="text-muted-foreground" /> Copy logo as SVG
          </ContextMenuItem>
          <ContextMenuItem className="px-3" onClick={() => copyAsSvg("Wordmark")}>
            <Code2 className="text-muted-foreground" /> Copy wordmark as SVG
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
