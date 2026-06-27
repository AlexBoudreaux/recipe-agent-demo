"use client";

import { SparklesIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ArtifactPanel() {
  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 border-b py-3">
        <div>
          <p className="text-sm font-medium leading-none">Artifact</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Recipes, techniques, and meal plans build here live
          </p>
        </div>
        <Badge variant="secondary">Empty</Badge>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SparklesIcon className="size-5" />
          </div>
          <p className="text-sm font-medium">Nothing here yet</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Paste a recipe blog or YouTube link in the chat and the extracted
            recipe will stream into this panel as it is built. Techniques and
            full meal plans show up here too.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
