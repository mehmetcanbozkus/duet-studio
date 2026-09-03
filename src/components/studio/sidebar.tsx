"use client";

import { Bot, Sparkles, User } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PROMPTS = [
  "Look at my song and add a hi-hat groove that fits the kick.",
  "Write a two-bar bassline in A minor that locks with the kick.",
  "Add a sad i VI III VII chord progression in the song's key.",
  "Humanize the hats and make the second bar busier.",
  "Take the steps I selected and make them a snare fill.",
  "Bring the tempo to 96 and add some swing.",
];

export function Sidebar() {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Prompt copied. Paste it to your agent.");
    } catch {
      toast(text);
    }
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4" />
          Ask your agent
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul className="flex flex-col gap-1">
          {PROMPTS.map((prompt) => (
            <li key={prompt}>
              <button
                type="button"
                onClick={() => copy(prompt)}
                className="hover:bg-muted w-full rounded-md px-2 py-1 text-left text-xs leading-snug"
              >
                “{prompt}”
              </button>
            </li>
          ))}
        </ul>
        <div className="text-muted-foreground flex items-center gap-3 border-t pt-2 text-xs">
          <span className="flex items-center gap-1">
            <span className="bg-human size-2.5 rounded-sm" />
            <User className="size-3" /> you
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-agent size-2.5 rounded-sm" />
            <Bot className="size-3" /> agent
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-selection/40 ring-selection size-2.5 rounded-sm ring-1" />{" "}
            selection
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
