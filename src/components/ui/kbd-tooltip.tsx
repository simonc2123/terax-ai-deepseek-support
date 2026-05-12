import * as React from "react";

import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type KbdTooltipProps = {
  /** Label text shown in the tooltip. */
  label: React.ReactNode;
  /**
   * Optional shortcut tokens (e.g. ["⌘", "I"] or ["Ctrl", "Shift", "M"]).
   * Rendered as a single Kbd group on the right side of the tooltip.
   */
  keys?: string[];
  /** Tooltip side. Defaults to "top". */
  side?: React.ComponentProps<typeof TooltipContent>["side"];
  /** Tooltip alignment. Defaults to "center". */
  align?: React.ComponentProps<typeof TooltipContent>["align"];
  /** Render-delay before the tooltip is shown. Defaults to 100ms. */
  delayDuration?: number;
  /** Optional className applied to the TooltipContent. */
  contentClassName?: string;
  children: React.ReactNode;
};

/**
 * Lightweight reusable tooltip with optional inline keyboard-shortcut Kbd chips.
 *
 * The `<TooltipContent>` ships with built-in styling for `data-slot="kbd"`
 * children so we just need to drop a `<Kbd>` in alongside the label.
 */
export function KbdTooltip({
  label,
  keys,
  side = "top",
  align = "center",
  delayDuration = 100,
  contentClassName,
  children,
}: KbdTooltipProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className={cn("gap-2", contentClassName)}
        >
          <span>{label}</span>
          {keys && keys.length > 0 ? (
            <Kbd className="h-4 gap-px px-1.5 font-mono text-[10.5px]">
              {keys.map((k, i) => (
                <React.Fragment key={`${k}-${i}`}>{k}</React.Fragment>
              ))}
            </Kbd>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
