import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Tool } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { KbdTooltip } from "@/components/ui/kbd-tooltip";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Cancel01Icon,
  Edit02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type {
  ChatStatus,
  DynamicToolUIPart,
  ToolUIPart,
  UIMessage,
  UIMessagePart,
} from "ai";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { SLASH_COMMANDS, TERAX_CMD_RE } from "../lib/slashCommands";
import { AiToolApproval } from "./AiToolApproval";

function CommandSnippet({ name }: { name: string }) {
  const meta = SLASH_COMMANDS[name];
  if (!meta) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/40 px-2 py-1 font-mono text-[11px]">
        /{name}
      </div>
    );
  }
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-border/50 bg-muted/40 px-2 py-1">
      <HugeiconsIcon
        icon={meta.icon}
        size={12}
        strokeWidth={1.75}
        className="shrink-0 text-foreground"
      />
      <span className="font-mono text-[11px] text-foreground">
        {meta.invocation}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {meta.label}
      </span>
    </div>
  );
}

type AnyToolPart = ToolUIPart | DynamicToolUIPart;
type AnyPart = UIMessagePart<Record<string, never>, Record<string, never>>;

type ApprovalArg = {
  id: string;
  approved: boolean;
  reason?: string;
};

type ChatHelpers = UseChatHelpers<UIMessage>;

type Props = {
  messages: UIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  clearError: () => void;
  addToolApprovalResponse: (arg: ApprovalArg) => void | PromiseLike<void>;
  stop: () => void | PromiseLike<void>;
  setMessages?: ChatHelpers["setMessages"];
  sendMessage?: ChatHelpers["sendMessage"];
};

/**
 * The composer prefixes every user message with optional XML-ish blocks
 * (command marker, snippets, selections, file attachments) before the body
 * text — see `composer.tsx`. When the user wants to edit a previously-sent
 * message we only let them edit the body; the prefix stays intact.
 */
const TERAX_CMD_PREFIX_RE =
  /^<terax-command\s+name="[a-z0-9-]+"(?:\s+state="[a-z]+")?\s*\/>(?:\n\n|$)/;
const PREFIX_BLOCK_RE =
  /^<(snippet|selection|file)\b[^>]*>[\s\S]*?<\/\1>(?:\n\n|$)/;

function splitUserMessageText(raw: string): { prefix: string; body: string } {
  let prefix = "";
  let rest = raw;
  const cmd = rest.match(TERAX_CMD_PREFIX_RE);
  if (cmd) {
    prefix += rest.slice(0, cmd[0].length);
    rest = rest.slice(cmd[0].length);
  }
  // Drain leading <snippet|selection|file> blocks.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const m = rest.match(PREFIX_BLOCK_RE);
    if (!m) break;
    prefix += rest.slice(0, m[0].length);
    rest = rest.slice(m[0].length);
  }
  return { prefix, body: rest };
}

export function AiChatView({
  messages,
  status,
  error,
  clearError,
  addToolApprovalResponse,
  setMessages,
  sendMessage,
}: Props) {
  const isBusy = status === "submitted" || status === "streaming";
  const lastMessage = messages[messages.length - 1];
  const showSpinner = isBusy && lastMessage?.role === "user";

  const onApproval = useCallback(
    (id: string, approved: boolean) => addToolApprovalResponse({ id, approved }),
    [addToolApprovalResponse],
  );

  const onEditUserMessage = useCallback(
    (messageId: string, newBody: string) => {
      if (!setMessages || !sendMessage) return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const target = messages[idx];
      const originalText = target.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      const { prefix } = splitUserMessageText(originalText);
      const trimmed = newBody.trim();
      if (!trimmed) return;
      const composed = prefix
        ? `${prefix.replace(/\n+$/, "")}\n\n${trimmed}`
        : trimmed;
      // Preserve original non-text parts (image attachments etc).
      const nonTextParts = target.parts.filter((p) => p.type !== "text");
      setMessages(messages.slice(0, idx));
      void sendMessage({
        role: "user",
        parts: [
          { type: "text", text: composed },
          ...nonTextParts,
        ],
      } as Parameters<typeof sendMessage>[0]);
    },
    [messages, setMessages, sendMessage],
  );

  const editable = !isBusy && !!setMessages && !!sendMessage;

  if (messages.length === 0) {
    return (
      <Conversation>
        <ConversationContent>
          <ConversationEmptyState
            title="Ask Terax anything"
            description="Explain command output, fix errors, generate snippets, or run a task."
          />
        </ConversationContent>
      </Conversation>
    );
  }

  return (
    <Conversation>
      <ConversationContent className="gap-5 p-3">
        {messages.map((m) => (
          <RenderedMessage
            key={m.id}
            message={m}
            onApproval={onApproval}
            onEdit={editable ? onEditUserMessage : undefined}
          />
        ))}
        {showSpinner && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner />
            Thinking…
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <div className="font-medium">Something went wrong.</div>
            <div className="mt-0.5 leading-relaxed opacity-90">
              {error.message}
            </div>
            <button
              type="button"
              onClick={clearError}
              className="mt-1 underline opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

const RenderedMessage = memo(function RenderedMessage({
  message,
  onApproval,
  onEdit,
}: {
  message: UIMessage;
  onApproval: (id: string, approved: boolean) => void;
  onEdit?: (messageId: string, newBody: string) => void;
}) {
  if (message.role === "user") {
    return <UserMessage message={message} onEdit={onEdit} />;
  }

  return (
    <Message from={message.role}>
      <MessageContent>
        <div className="flex flex-col gap-3">
          {message.parts.map((part, i) => (
            <RenderedPart
              key={`${message.id}-${i}`}
              part={part as AnyPart}
              onApproval={onApproval}
            />
          ))}
        </div>
      </MessageContent>
    </Message>
  );
});

function UserMessage({
  message,
  onEdit,
}: {
  message: UIMessage;
  onEdit?: (messageId: string, newBody: string) => void;
}) {
  const rawText = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  const { body } = splitUserMessageText(rawText);
  const cmdMatch = body.match(TERAX_CMD_RE);
  const commandName = cmdMatch?.[1] ?? null;
  const visibleText = cmdMatch ? body.slice(cmdMatch[0].length) : body;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(visibleText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    // Place caret at end.
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editing]);

  const startEdit = () => {
    setDraft(visibleText);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(visibleText);
  };

  const save = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (trimmed === visibleText.trim()) {
      setEditing(false);
      return;
    }
    onEdit?.(message.id, trimmed);
    setEditing(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      save();
    }
  };

  if (editing) {
    return (
      <Message from="user">
        <MessageContent className="group-[.is-user]:w-full group-[.is-user]:max-w-full group-[.is-user]:px-2 group-[.is-user]:py-2">
          {commandName ? <CommandSnippet name={commandName} /> : null}
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            className={cn(
              "min-h-[3.5rem] resize-none rounded-md border-border/60 bg-background/60 px-2 py-1.5 text-[12px] leading-relaxed",
              "focus-visible:ring-1 focus-visible:ring-ring/40",
            )}
            placeholder="Edit your message…"
          />
          <div className="mt-1 flex items-center justify-end gap-1">
            <KbdTooltip label="Cancel" keys={["Esc"]}>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={cancel}
                className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={11}
                  strokeWidth={1.75}
                />
                Cancel
              </Button>
            </KbdTooltip>
            <KbdTooltip label="Save & resend" keys={["⌘", "⏎"]}>
              <Button
                type="button"
                size="xs"
                onClick={save}
                disabled={!draft.trim() || draft.trim() === visibleText.trim()}
                className="h-6 gap-1 px-2 text-[11px]"
              >
                <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={1.75} />
                Save
              </Button>
            </KbdTooltip>
          </div>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message from="user" className="relative">
      <MessageContent>
        {commandName ? <CommandSnippet name={commandName} /> : null}
        {visibleText ? (
          <p className="whitespace-pre-wrap wrap-break-word">{visibleText}</p>
        ) : null}
      </MessageContent>
      {onEdit ? (
        <KbdTooltip label="Edit message">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={startEdit}
            aria-label="Edit message"
            className={cn(
              "absolute -top-1 right-1 size-6 rounded-md bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity",
              "hover:bg-background hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <HugeiconsIcon icon={Edit02Icon} size={11} strokeWidth={1.75} />
          </Button>
        </KbdTooltip>
      ) : null}
    </Message>
  );
}

const RenderedPart = memo(function RenderedPart({
  part,
  onApproval,
}: {
  part: AnyPart;
  onApproval: (id: string, approved: boolean) => void;
}) {
  if (part.type === "text") {
    return (
      <MessageResponse>
        {(part as unknown as { text: string }).text}
      </MessageResponse>
    );
  }

  if (part.type === "reasoning") {
    return (
      <Reasoning>
        <ReasoningTrigger />
        <ReasoningContent>
          {(part as unknown as { text: string }).text}
        </ReasoningContent>
      </Reasoning>
    );
  }

  if (
    part.type === "dynamic-tool" ||
    (typeof part.type === "string" && part.type.startsWith("tool-"))
  ) {
    return (
      <RenderedTool
        part={part as unknown as AnyToolPart}
        onApproval={onApproval}
      />
    );
  }

  return null;
});

const RenderedTool = memo(function RenderedTool({
  part,
  onApproval,
}: {
  part: AnyToolPart;
  onApproval: (id: string, approved: boolean) => void;
}) {
  const toolName =
    part.type === "dynamic-tool"
      ? part.toolName
      : part.type.replace(/^tool-/, "");

  if (part.state === "approval-requested") {
    return (
      <AiToolApproval
        part={part as Extract<ToolUIPart, { state: "approval-requested" }>}
        toolName={toolName}
        onRespond={(approved) => onApproval(part.approval.id, approved)}
      />
    );
  }

  return (
    <Tool
      toolName={toolName}
      state={part.state}
      input={part.input}
      output={"output" in part ? part.output : undefined}
      errorText={"errorText" in part ? part.errorText : undefined}
    />
  );
});
