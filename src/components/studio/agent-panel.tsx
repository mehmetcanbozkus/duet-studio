"use client";

import type { ModelMessage } from "ai";
import { Bot, KeyRound, Loader2, Send, Trash2, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_MODEL,
  runBrowserAgent,
  type AgentEvent,
} from "@/lib/webmcp/browser-agent";
import { cn } from "@/lib/utils";

const KEY_STORAGE = "duet-studio-openai-key";
const MODEL_STORAGE = "duet-studio-openai-model";

type StorageKind = "local" | "session";

function readStorage(kind: StorageKind, key: string) {
  try {
    const store =
      kind === "local" ? window.localStorage : window.sessionStorage;
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(kind: StorageKind, key: string, value: string | null) {
  try {
    const store =
      kind === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // storage unavailable
  }
}

/**
 * The key is kept in sessionStorage (gone when the tab closes). It only reaches localStorage when
 * the visitor explicitly asks to be remembered on this device.
 */
function persistKey(key: string, remember: boolean) {
  writeStorage("session", KEY_STORAGE, key || null);
  writeStorage("local", KEY_STORAGE, remember && key ? key : null);
}

interface Line {
  id: number;
  role: "you" | "agent" | "tool" | "note" | "error";
  text: string;
}

/**
 * Fallback agent that lives inside the page. It discovers the same WebMCP tools through
 * document.modelContext.getTools() and calls them with executeTool(), so anyone with an OpenAI key
 * can try the collaboration even without an agent-enabled browser.
 */
export function AgentPanel() {
  const [remember, setRemember] = useState(
    () => readStorage("local", KEY_STORAGE) !== null,
  );
  const [apiKey, setApiKey] = useState(
    () =>
      readStorage("local", KEY_STORAGE) ??
      readStorage("session", KEY_STORAGE) ??
      "",
  );
  const [model, setModel] = useState(
    () => readStorage("local", MODEL_STORAGE) ?? DEFAULT_MODEL,
  );
  const [prompt, setPrompt] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<ModelMessage[]>([]);
  const idRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines]);

  const push = (role: Line["role"], text: string) =>
    setLines((prev) =>
      [...prev, { id: ++idRef.current, role, text }].slice(-60),
    );

  const forgetKey = () => {
    setApiKey("");
    persistKey("", false);
    toast.success("Key removed from this browser.");
  };

  const send = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    const key = apiKey.trim();
    if (!key) {
      toast.error("Add an OpenAI API key first.");
      return;
    }
    persistKey(key, remember);
    writeStorage("local", MODEL_STORAGE, model.trim() || DEFAULT_MODEL);
    setPrompt("");
    push("you", text);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const onEvent = (event: AgentEvent) =>
      push(
        event.type === "tool"
          ? "tool"
          : event.type === "error"
            ? "error"
            : "agent",
        event.text,
      );
    try {
      historyRef.current = await runBrowserAgent({
        apiKey: key,
        model: model.trim() || DEFAULT_MODEL,
        messages: [...historyRef.current, { role: "user", content: text }],
        onEvent: (event) => {
          if (event.type === "text" && event.text.startsWith("Discovered "))
            push("note", event.text);
          else onEvent(event);
        },
        signal: controller.signal,
      });
    } catch (error) {
      push("error", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bot className="text-agent size-4" />
          Built-in agent
        </CardTitle>
        <CardDescription>
          No agent browser? Bring your own OpenAI key. This agent finds the same
          tools through{" "}
          <code className="font-mono text-[11px]">document.modelContext</code>{" "}
          and plays along.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {/* A password field outside a form makes Chrome complain in the console;
            submitting is a no-op because the key is only used when you chat. */}
        <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
          <div className="relative flex-1">
            <KeyRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-… (kept in this tab)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pl-7 text-xs"
              aria-label="OpenAI API key"
            />
          </div>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-28 font-mono text-xs"
            aria-label="Model id"
            title="OpenAI model id"
          />
        </form>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-muted-foreground text-xs font-normal">
            <Switch
              size="sm"
              checked={remember}
              onCheckedChange={(checked) => {
                setRemember(checked);
                persistKey(apiKey.trim(), checked);
              }}
            />
            Remember on this device
          </Label>
          {apiKey && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-6 px-2 text-xs"
              onClick={forgetKey}
            >
              <Trash2 data-icon="inline-start" />
              Forget key
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-[11px] leading-snug">
          The key goes from this tab straight to api.openai.com and is kept in
          this tab&apos;s session storage until you close it. Any script running
          on this page could read it, so use a key with a spending limit and
          revoke it after your demo.
        </p>
        {lines.length > 0 && (
          <div
            ref={listRef}
            className="bg-muted/40 flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md p-2 text-xs"
          >
            {lines.map((line) => (
              <div
                key={line.id}
                className={cn(
                  "flex gap-1.5",
                  line.role === "you" && "font-medium",
                  line.role === "tool" && "text-agent font-mono text-[11px]",
                  line.role === "note" && "text-muted-foreground",
                  line.role === "error" && "text-destructive",
                )}
              >
                {line.role === "tool" && (
                  <Wrench className="mt-0.5 size-3 shrink-0" />
                )}
                {line.role === "agent" && (
                  <Bot className="text-agent mt-0.5 size-3 shrink-0" />
                )}
                <span className="break-words">{line.text}</span>
              </div>
            ))}
            {busy && (
              <div className="text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" /> working…
              </div>
            )}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Input
            placeholder="Add a hi-hat groove that fits the kick…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="text-xs"
            aria-label="Message to the built-in agent"
            disabled={busy}
          />
          {busy ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop"
            >
              <Loader2 className="animate-spin" />
            </Button>
          ) : (
            <Button type="submit" size="icon" aria-label="Send">
              <Send />
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
