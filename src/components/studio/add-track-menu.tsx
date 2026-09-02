"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { INSTRUMENTS } from "@/lib/studio/instruments";
import { createTrack } from "@/lib/studio/song";
import { useStudio } from "@/lib/studio/store";
import type { Instrument } from "@/lib/studio/types";

export function AddTrackMenu() {
  const commit = useStudio((s) => s.commit);
  const add = (instrument: Instrument) =>
    commit("human", `Added ${instrument} track`, (draft) => {
      draft.tracks.push(createTrack(instrument, "human", draft));
    });

  const drums = INSTRUMENTS.filter((i) => i.kind === "drum");
  const melodic = INSTRUMENTS.filter((i) => i.kind === "melodic");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}>
        <Plus data-icon="inline-start" />
        Add track
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Drums</DropdownMenuLabel>
          {drums.map((i) => (
            <DropdownMenuItem key={i.id} onClick={() => add(i.id)}>
              {i.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Melodic</DropdownMenuLabel>
          {melodic.map((i) => (
            <DropdownMenuItem key={i.id} onClick={() => add(i.id)}>
              {i.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
