import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Clapperboard, Info } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import { DEFAULT_EDIT_STYLE, EDIT_STYLE_OPTIONS, editStyleSignature } from "@/lib/edit-style"
import type { CampaignEditStyle } from "@/lib/types"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const percent = (value: number) => `${Math.round(value * 100)}%`

/**
 * Which edit the campaign's clips get. Pipelines read it when they start, so a change applies to
 * every clip queued afterwards; clips already rendered keep the style they were cut with.
 */
export function EditStyleCard({ campaignId, editStyle }: { campaignId: string; editStyle?: CampaignEditStyle | null }) {
  const queryClient = useQueryClient()
  const signature = editStyleSignature(editStyle)
  const [syncedSignature, setSyncedSignature] = useState(signature)
  const [draft, setDraft] = useState<CampaignEditStyle>(editStyle ?? DEFAULT_EDIT_STYLE)
  if (signature !== syncedSignature) { setSyncedSignature(signature); setDraft(editStyle ?? DEFAULT_EDIT_STYLE) }
  const dirty = editStyleSignature(draft) !== signature
  const podcast = draft.style === "PodcastSplit"

  const save = useMutation({
    mutationFn: (next: CampaignEditStyle) => api.updateCampaignEditStyle(campaignId, next),
    onSuccess: (saved) => {
      toast.success(saved.style === "PodcastSplit" ? "New clips will use the podcast split" : "New clips will use the streamer style")
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Edit style</CardTitle>
          <CardDescription>How every clip queued from now on is cut. Clips already rendered keep their style.</CardDescription>
        </div>
        <Clapperboard className="size-5 text-brand-dark" />
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Edit style" className="grid gap-3 sm:grid-cols-2">
          {EDIT_STYLE_OPTIONS.map((option) => {
            const selected = draft.style === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={save.isPending}
                onClick={() => setDraft({ ...draft, style: option.value })}
                className={`rounded-xl border p-4 text-left transition-colors ${selected
                  ? "border-brand-dark bg-[var(--surface-accent-subtle)]"
                  : "border-[var(--border-default)] hover:border-[var(--border-strong)]"}`}
              >
                <span className="block text-sm font-semibold text-ink">{option.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--fg-muted)]">{option.description}</span>
              </button>
            )
          })}
        </div>

        {podcast && (
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-[var(--fg-strong)]" htmlFor="broll-shot-seconds">
                  B-roll shot length: {draft.brollShotSeconds.toFixed(1)} s
                </label>
                <input id="broll-shot-seconds" type="range" min={12} max={40} value={Math.round(draft.brollShotSeconds * 10)} className="w-full"
                  onChange={(event) => setDraft({ ...draft, brollShotSeconds: Number(event.target.value) / 10 })} />
                <p className="mt-1 text-xs text-[var(--fg-muted)]">Double Coverage TV changes footage about every 2.2 seconds.</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-[var(--fg-strong)]" htmlFor="music-bed-volume">
                  Music bed: {percent(draft.musicVolume)}
                </label>
                <input id="music-bed-volume" type="range" min={0} max={60} value={Math.round(draft.musicVolume * 100)} className="w-full"
                  onChange={(event) => setDraft({ ...draft, musicVolume: Number(event.target.value) / 100 })} />
                <p className="mt-1 text-xs text-[var(--fg-muted)]">Ducked under the speech; picked in turn from your music library.</p>
              </div>
            </div>
            <SplitPreview />
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => save.mutate(draft)} disabled={!dirty || save.isPending}>
            {save.isPending ? "Saving…" : "Save style"}
          </Button>
          {dirty && <span className="text-xs text-[var(--fg-muted)]">Unsaved changes</span>}
        </div>

        {podcast && (
          <Alert className="mt-4">
            <span className="flex gap-2">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                Footage is found on YouTube for each named person, event or place. Broadcaster logos and score bugs are
                cropped out, or blurred when they sit mid-frame. Each clip lists the footage it used and any moment where
                nothing usable came back.
              </span>
            </span>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

/** A proportional stand-in for the layout, like the logo card's preview. Not a frame grab. */
function SplitPreview() {
  return (
    <div className="mx-auto flex w-[135px] flex-col">
      <div className="relative h-[240px] w-[135px] overflow-hidden rounded-lg border border-[var(--border-default)]">
        <div className="absolute inset-x-0 top-0 flex h-1/2 items-center justify-center bg-[var(--surface-accent-subtle)] text-[10px] font-semibold text-[var(--fg-muted)]">Guest</div>
        <div className="absolute inset-x-0 bottom-0 flex h-1/2 items-center justify-center bg-[var(--border-default)]/40 text-[10px] font-semibold text-[var(--fg-muted)]">B-roll</div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-ink px-1.5 text-[9px] font-black italic tracking-wide text-white">WORD</div>
        <div className="absolute right-[7%] top-[7%] h-[5%] w-[20%] rounded-sm bg-brand-dark" />
      </div>
      <p className="mt-1.5 text-center text-[10px] text-[var(--fg-muted)]">9:16 · watermark top right</p>
    </div>
  )
}
