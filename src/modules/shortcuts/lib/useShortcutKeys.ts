import { useMemo } from "react";

import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  getBindingTokens,
  SHORTCUTS,
  type ShortcutId,
} from "../shortcuts";

/**
 * Returns the display tokens for the **first** binding of a shortcut id,
 * honoring user-overridden bindings from the preferences store.
 *
 * Example: `["⌘", "I"]` on macOS or `["Ctrl", "I"]` on Windows/Linux.
 *
 * Returns an empty array if the shortcut has no binding (so callers can safely
 * pass the result straight into `<KbdTooltip keys={...}>`).
 */
export function useShortcutKeys(id: ShortcutId): string[] {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  return useMemo(() => {
    const s = SHORTCUTS.find((s) => s.id === id);
    if (!s) return [];
    const bindings = userShortcuts[id] || s.defaultBindings;
    if (!bindings || bindings.length === 0) return [];
    return getBindingTokens(bindings[0]);
  }, [id, userShortcuts]);
}
