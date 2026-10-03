import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Mic, Play } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** ElevenLabs' text-to-speech models as its docs listed them in October 2026 (Turbo v2/v2.5 are deprecated). */
const MODELS = [
  { value: "eleven_v4", label: "Eleven v4 (newest, most expressive)" },
  { value: "eleven_v4_turbo", label: "Eleven v4 Turbo (v4, faster)" },
  { value: "eleven_v3", label: "Eleven v3" },
  { value: "eleven_multilingual_v2", label: "Multilingual v2 (most stable)" },
  { value: "eleven_flash_v2_5", label: "Flash v2.5 (half price)" },
  { value: "eleven_flash_v2", label: "Flash v2 (English only, half price)" },
]

let pendingSave: (() => void) | null = null

/** Saves a narrator key or voice that was typed but not saved yet. The settings page calls it from "Save settings". */
export function saveVoiceOverIfChanged() { pendingSave?.() }

/**
 * The narrator for the narrated-luxury style. The API key is sent once and kept encrypted by the backend; the page only
 * ever sees a hint of it. "Check" is free; "Play sample" reads one line and spends a few credits.
 */
export function VoiceOverCard() {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ["voice-over"], queryFn: api.voiceOver })
  const [apiKey, setApiKey] = useState("")
  const [voiceId, setVoiceId] = useState("")
  const [modelId, setModelId] = useState("eleven_v4")
  const [voiceName, setVoiceName] = useState<string | null>(null)
  const [sampleUrl, setSampleUrl] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (!settings.data || loaded.current) return
    loaded.current = true
    setVoiceId(settings.data.voiceId)
    setModelId(settings.data.modelId || "eleven_v4")
  }, [settings.data])
  useEffect(() => () => { if (sampleUrl) URL.revokeObjectURL(sampleUrl) }, [sampleUrl])

  const save = useMutation({
    mutationFn: () => api.saveVoiceOver({ apiKey: apiKey.trim() || undefined, voiceId: voiceId.trim(), modelId }),
    onSuccess: (saved) => {
      setApiKey("")
      setVoiceName(null)
      queryClient.setQueryData(["voice-over"], saved)
      toast.success("Voice saved")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const check = useMutation({
    mutationFn: api.testVoiceOver,
    onSuccess: (result) => { setVoiceName(result.voiceName); toast.success(`Working: ${result.voiceName}`) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const sample = useMutation({
    mutationFn: api.voiceOverSample,
    onSuccess: (audio) => setSampleUrl(URL.createObjectURL(audio)),
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const data = settings.data
  const dirty = Boolean(apiKey.trim()) || (data ? voiceId.trim() !== data.voiceId || modelId !== data.modelId : false)
  const canSave = dirty && !save.isPending && Boolean(data?.configured || apiKey.trim()) && Boolean(voiceId.trim())
  // The page's own "Save settings" bar sits right under this card, and a key typed here was once "saved" with that
  // button, which saved everything except the key. While there is something to save, that button saves it too.
  useEffect(() => {
    pendingSave = canSave ? () => save.mutate() : null
    return () => { pendingSave = null }
  })
  // Enter in a field saves the voice, and must not also submit the settings form this card sits inside.
  const saveOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    if (canSave) save.mutate()
  }
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Narrator voice</CardTitle>
          <CardDescription>
            ElevenLabs reads the narration of the narrated luxury style. The key is encrypted on this PC and never shown again.
          </CardDescription>
        </div>
        <Mic className="size-5 text-brand-dark" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {data?.configured
            ? <Badge variant="success">Key saved {data.keyHint ? `(${data.keyHint})` : ""}</Badge>
            : <Badge variant="warning">Not set up</Badge>}
          {voiceName && <span className="inline-flex items-center gap-1 text-[var(--fg-strong)]"><CheckCircle2 className="size-3.5" /> {voiceName}</span>}
        </div>
        {/* Not a form of its own: this card sits inside the settings form, and a form inside a form is not valid. */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="elevenlabs-key">API key</Label>
            <Input id="elevenlabs-key" type="password" autoComplete="off" className="mt-1.5 font-mono text-xs"
              placeholder={data?.configured ? "Leave empty to keep the saved key" : "sk_..."}
              value={apiKey} onChange={(event) => setApiKey(event.target.value)} onKeyDown={saveOnEnter} />
            <p className="mt-1 text-xs text-[var(--fg-muted)]">ElevenLabs → your profile → API Keys.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="elevenlabs-voice">Voice ID</Label>
              <Input id="elevenlabs-voice" className="mt-1.5 font-mono text-xs" placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                value={voiceId} onChange={(event) => setVoiceId(event.target.value)} onKeyDown={saveOnEnter} />
              <p className="mt-1 text-xs text-[var(--fg-muted)]">Voices → the voice → the ID button.</p>
            </div>
            <div>
              <Label htmlFor="elevenlabs-model">Model</Label>
              {/* The app's own dropdown: the browser's native one drew its options pale on white in the dark theme. */}
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger id="elevenlabs-model" className="mt-1.5" aria-label="Model"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODELS.map((model) => <SelectItem key={model.value} value={model.value}>{model.label}</SelectItem>)}
                  {/* A model saved earlier that is no longer listed stays selectable rather than silently changing. */}
                  {modelId && !MODELS.some((model) => model.value === modelId) ? <SelectItem value={modelId}>{modelId}</SelectItem> : null}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">v4 sounds the most hyped. If your plan does not have it, pick another and play a sample.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={!canSave} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save voice"}
            </Button>
            <Button type="button" variant="outline" disabled={!data?.configured || check.isPending} onClick={() => check.mutate()}>
              {check.isPending ? "Checking…" : "Check key"}
            </Button>
            <Button type="button" variant="outline" disabled={!data?.configured || sample.isPending} onClick={() => sample.mutate()}>
              <Play /> {sample.isPending ? "Reading…" : "Play sample"}
            </Button>
          </div>
          {dirty && <p className="text-xs text-[var(--warning-text)]">Not saved yet. Press Save voice, or Save settings below.</p>}
        </div>
        {sampleUrl && <audio className="w-full" src={sampleUrl} controls autoPlay aria-label="Voice sample" />}
      </CardContent>
    </Card>
  )
}
