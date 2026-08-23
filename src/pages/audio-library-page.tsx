import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderPlus, Heart, Library, Music2, RefreshCw, Search, SlidersHorizontal, Sparkles, Volume2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { api, getErrorMessage } from "@/lib/api"
import type { MediaAsset } from "@/lib/types"
import { formatDate, formatDuration } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, ErrorState, FieldError, LoadingPage, PageHeader } from "@/components/page"

const locationSchema = z.object({ path: z.string().trim().min(3, "Enter an absolute local folder path."), type: z.enum(["Music", "SoundEffect", "Mixed"]) })
type LocationValues = z.infer<typeof locationSchema>

function AddLocationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const form = useForm<LocationValues>({ resolver: zodResolver(locationSchema), defaultValues: { path: "", type: "Mixed" } })
  const add = useMutation({ mutationFn: (values: LocationValues) => api.addMediaLocation(values.path, values.type), onSuccess: () => { toast.success("Library folder added"); form.reset(); onOpenChange(false); queryClient.invalidateQueries({ queryKey: ["media-locations"] }) }, onError: (error) => toast.error(getErrorMessage(error)) })
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Add local audio folder</DialogTitle><DialogDescription>The scanner reads supported files in place. It never moves or modifies your originals.</DialogDescription></DialogHeader><form id="add-location" className="space-y-4" onSubmit={form.handleSubmit((values) => add.mutate(values))}><div><Label htmlFor="audio-path">Absolute folder path</Label><Input id="audio-path" className="mt-1.5 font-mono text-xs" placeholder="D:\Media\ClipForge\Audio" {...form.register("path")} /><FieldError>{form.formState.errors.path?.message}</FieldError></div><div><Label>Folder contents</Label><Select value={form.watch("type")} onValueChange={(value) => form.setValue("type", value as LocationValues["type"])}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Music">Music</SelectItem><SelectItem value="SoundEffect">Sound effects</SelectItem><SelectItem value="Mixed">Mixed</SelectItem></SelectContent></Select></div></form><DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="brand" form="add-location" type="submit" disabled={add.isPending}><FolderPlus /> Add folder</Button></DialogFooter></DialogContent></Dialog>
}

function AssetEditor({ asset, open, onOpenChange }: { asset: MediaAsset; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const [tags, setTags] = useState(asset.tags.join(", "))
  const [licenseNotes, setLicenseNotes] = useState(asset.licenseNotes ?? "")
  const [mood, setMood] = useState(asset.mood ?? "")
  const [energy, setEnergy] = useState(asset.energy ?? "")
  const save = useMutation({ mutationFn: () => api.updateMediaAsset(asset.id, { tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), licenseNotes, mood, energy }), onSuccess: () => { toast.success("Audio metadata saved"); onOpenChange(false); queryClient.invalidateQueries({ queryKey: ["media-assets"] }) }, onError: (error) => toast.error(getErrorMessage(error)) })
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{asset.name}</DialogTitle><DialogDescription>These notes become part of the bounded asset manifest shared with the AI.</DialogDescription></DialogHeader><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div><Label>Mood</Label><Input className="mt-1.5" value={mood} onChange={(event) => setMood(event.target.value)} placeholder="uplifting" /></div><div><Label>Energy</Label><Input className="mt-1.5" value={energy} onChange={(event) => setEnergy(event.target.value)} placeholder="medium" /></div></div><div><Label>Tags <span className="font-normal text-[var(--fg-muted)]">comma-separated</span></Label><Input className="mt-1.5" value={tags} onChange={(event) => setTags(event.target.value)} /></div><div><Label>Source and license notes</Label><Textarea className="mt-1.5" value={licenseNotes} onChange={(event) => setLicenseNotes(event.target.value)} placeholder="Where this asset came from and how it may be used…" /></div></div><DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="brand" onClick={() => save.mutate()} disabled={save.isPending}>Save metadata</Button></DialogFooter></DialogContent></Dialog>
}

function AssetRow({ asset }: { asset: MediaAsset }) {
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const favorite = useMutation({ mutationFn: () => api.updateMediaAsset(asset.id, { favorite: !asset.favorite }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media-assets"] }), onError: (error) => toast.error(getErrorMessage(error)) })
  return <><div className="grid gap-3 border-b border-[var(--border-default)] px-5 py-4 last:border-0 md:grid-cols-[minmax(0,1.3fr)_0.65fr_0.65fr_1fr_auto] md:items-center"><div className="flex min-w-0 items-center gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${asset.type === "Music" ? "bg-[var(--surface-accent)] text-brand-dark" : "bg-[var(--surface-warning)] text-[var(--warning-text)]"}`}>{asset.type === "Music" ? <Music2 className="size-5" /> : <Volume2 className="size-5" />}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{asset.name}</p><p className="mt-1 truncate font-mono text-[10px] text-[var(--fg-muted)]" title={asset.path}>{asset.path}</p></div></div><div className="text-xs"><p className="font-semibold">{formatDuration(asset.durationSeconds)}</p><p className="mt-1 text-[var(--fg-muted)]">{asset.bpm ? `${asset.bpm} BPM` : "BPM unknown"}</p></div><div className="text-xs"><p className="font-semibold">{asset.mood || "Untagged"}</p><p className="mt-1 text-[var(--fg-muted)]">{asset.energy || "Energy unknown"}</p></div><div className="flex flex-wrap gap-1.5">{asset.tags.slice(0, 4).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}{!asset.licenseNotes && <Badge variant="warning">License note missing</Badge>}</div><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" aria-label={asset.favorite ? "Remove favorite" : "Add favorite"} onClick={() => favorite.mutate()}><Heart className={asset.favorite ? "fill-[var(--danger-text-soft)] text-[var(--danger-text-soft)]" : ""} /></Button><Button size="icon" variant="ghost" aria-label="Edit asset metadata" onClick={() => setEditOpen(true)}><SlidersHorizontal /></Button></div></div><AssetEditor asset={asset} open={editOpen} onOpenChange={setEditOpen} /></>
}

export function AudioLibraryPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [type, setType] = useState("All")
  const queryClient = useQueryClient()
  const locations = useQuery({ queryKey: ["media-locations"], queryFn: api.mediaLocations, retry: 1 })
  const assets = useQuery({ queryKey: ["media-assets"], queryFn: () => api.mediaAssets(), retry: 1 })
  const scan = useMutation({ mutationFn: api.scanMediaLibrary, onSuccess: () => { toast.success("Audio scan queued"); queryClient.invalidateQueries({ queryKey: ["jobs"] }); setTimeout(() => queryClient.invalidateQueries({ queryKey: ["media-assets"] }), 1_500) }, onError: (error) => toast.error(getErrorMessage(error)) })
  const filtered = useMemo(() => (assets.data ?? []).filter((asset) => (type === "All" || asset.type === type) && `${asset.name} ${asset.tags.join(" ")} ${asset.mood ?? ""}`.toLowerCase().includes(query.toLowerCase())), [assets.data, query, type])
  if (locations.isLoading || assets.isLoading) return <LoadingPage cards={3} />
  if (locations.isError || assets.isError) return <ErrorState message={getErrorMessage(locations.error || assets.error)} onRetry={() => { locations.refetch(); assets.refetch() }} />
  return <div className="animate-enter"><PageHeader eyebrow="Reusable assets" title="Audio library" description="Curate the only music and sound effects AI edit plans may select." actions={<><Button variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending || !locations.data?.length}><RefreshCw className={scan.isPending ? "animate-spin" : ""} /> Scan folders</Button><Button variant="brand" onClick={() => setAddOpen(true)}><FolderPlus /> Add folder</Button></>} /><AddLocationDialog open={addOpen} onOpenChange={setAddOpen} />
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Card><CardContent className="flex items-center gap-4 p-5"><span className="rounded-xl bg-[var(--surface-accent)] p-3 text-brand-dark"><Library className="size-5" /></span><div><p className="text-2xl font-semibold">{assets.data?.length ?? 0}</p><p className="text-xs text-[var(--fg-muted)]">Indexed assets</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-4 p-5"><span className="rounded-xl bg-[var(--surface-warning)] p-3 text-[var(--warning-text)]"><FolderPlus className="size-5" /></span><div><p className="text-2xl font-semibold">{locations.data?.length ?? 0}</p><p className="text-xs text-[var(--fg-muted)]">Watched folders</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-4 p-5"><span className="rounded-xl bg-[var(--surface-info)] p-3 text-[var(--info-text)]"><Sparkles className="size-5" /></span><div><p className="text-2xl font-semibold">{assets.data?.filter((asset) => asset.favorite).length ?? 0}</p><p className="text-xs text-[var(--fg-muted)]">Favorites</p></div></CardContent></Card></div>
    {locations.data?.length ? <Card className="mb-6"><CardHeader className="pb-3"><CardTitle className="text-sm">Watched folders</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{locations.data.map((location) => <div key={location.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-accent-subtle)] p-4"><p className="truncate font-mono text-xs" title={location.path}>{location.path}</p><p className="mt-2 text-[11px] text-[var(--fg-muted)]">{location.type} · {location.assetCount ?? 0} assets · Scanned {formatDate(location.lastScannedAt)}</p></div>)}</CardContent></Card> : null}
    <Card><CardContent className="p-0"><div className="flex flex-col gap-3 border-b border-[var(--border-default)] p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted)]" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, tag, or mood…" /></div><Select value={type} onValueChange={setType}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="All">All assets</SelectItem><SelectItem value="Music">Music</SelectItem><SelectItem value="SoundEffect">Sound effects</SelectItem></SelectContent></Select></div>{filtered.length ? <div>{filtered.map((asset) => <AssetRow key={asset.id} asset={asset} />)}</div> : <div className="p-5"><EmptyState title={locations.data?.length ? "No matching audio" : "Add an audio folder"} description={locations.data?.length ? "Scan your folders or adjust the search filters." : "Point ClipForge at your reusable music and sound-effect folders to build an approved manifest."} icon={<Music2 className="size-6" />} action={!locations.data?.length ? <Button variant="brand" onClick={() => setAddOpen(true)}><FolderPlus /> Add folder</Button> : undefined} /></div>}</CardContent></Card>
  </div>
}
