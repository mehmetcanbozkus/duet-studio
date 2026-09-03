"use client";

import { Download, FileAudio, FileMusic } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useStudio } from "@/lib/studio/store";

type ExportFormat = "MIDI" | "WAV";

export function ExportMenu() {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const exportSong = async (format: ExportFormat) => {
    setExporting(format);
    try {
      const song = structuredClone(useStudio.getState().song);
      const filename =
        format === "MIDI"
          ? (await import("@/lib/studio/export-midi")).exportMidi(song)
          : await (await import("@/lib/studio/export-wav")).exportWav(song);
      useStudio.getState().logActivity({
        actor: "human",
        label: `Exported ${filename}`,
      });
      toast.success(`${format} exported`, { description: filename });
    } catch (error) {
      toast.error(`${format} export failed`, {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" disabled={!!exporting} />}
      >
        {exporting ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Download data-icon="inline-start" />
        )}
        {exporting ? `Exporting ${exporting}…` : "Export"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Download song</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => void exportSong("MIDI")}>
            <FileMusic />
            MIDI
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void exportSong("WAV")}>
            <FileAudio />
            WAV audio
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
