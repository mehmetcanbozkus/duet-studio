"use client";

import type { ModelMessage } from "ai";
import { Bot, KeyRound, Loader2, Send, Wrench } from "lucide-react";
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
import {
  DEFAULT_MODEL,
  runBrowserAgent,
  type AgentEvent,
} from "@/lib/webmcp/browser-agent";
import { cn } from "@/lib/utils";

const KEY_STORAGE = "duet-studio-openai-key";
const MODEL_STORAGE = "duet-studio-openai-model";

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
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
  const [apiKey, setApiKey] = useState(() => readStorage(KEY_STORAGE) ?? "");
  const [model, setModel] = useState(
    () => readStorage(MODEL_STORAGE) ?? DEFAULT_MODEL,
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

  const send = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    if (!apiKey.trim()) {
      toast.error(
        "Add an OpenAI API key first. It stays in this browser only.",
      );
      return;
    }
    try {
      localStorage.setItem(KEY_STORAGE, apiKey.trim());
      localStorage.setItem(MODEL_STORAGE, model.trim() || DEFAULT_MODEL);
    } catch {
      // storage unavailable
    }
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
        apiKey: apiKey.trim(),
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
        <div className="flex gap-2">
          <div className="relative flex-1">
            <KeyRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
            <Input
              type="password"
              autoComplete="off"
              placeholder="sk-… (stored only in this browser)"
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
        </div>
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
