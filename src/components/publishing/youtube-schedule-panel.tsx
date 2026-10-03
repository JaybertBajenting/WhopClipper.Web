import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BellRing, CalendarClock, CircleAlert, ExternalLink, Plus, RefreshCw, Send, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import { formatSlot, scheduleState, shortsUrl } from "@/lib/youtube-schedule"
import type { PublishJob, YouTubeSchedule } from "@/lib/types"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ErrorState } from "@/components/page"

export const scheduleQueryKey = ["publishing", "youtube-schedule"] as const

/** The schedule every clip-level button reads, polled so a slot flipping public shows up. */
export function useYouTubeSchedule() {
  return useQuery({ queryKey: scheduleQueryKey, queryFn: api.youtubeSchedule, refetchInterval: 30_000, retry: 1 })
}

/** Take-off with a second click to confirm: it deletes the upload, which cannot be undone on YouTube. */
export function TakeOffButton({ job, size = "sm" }: { job: PublishJob; size?: "sm" | "default" }) {
  const queryClient = useQueryClient()
  const [armed, setArmed] = useState(false)
  const takeOff = useMutation({
    mutationFn: () => api.unscheduleFromYouTube(job.id),
    onSuccess: () => {
      toast.success(job.externalId ? "Deleted from YouTube. Later clips moved up a slot." : "Taken off before it uploaded. Later clips moved up a slot.")
      queryClient.invalidateQueries({ queryKey: scheduleQueryKey })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => setArmed(false),
  })
  const busy = ["Validating", "Uploading", "Processing"].includes(job.status)
  if (!armed)
    return <Button variant="outline" size={size} disabled={busy || takeOff.isPending} onClick={() => setArmed(true)}><Trash2 /> Take off YouTube</Button>
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-[var(--fg-muted)]">{job.externalId ? "Deletes it from YouTube." : "Cancels the upload."} Later clips move up.</span>
      <Button variant="destructive" size={size} disabled={takeOff.isPending} onClick={() => takeOff.mutate()}>
        {takeOff.isPending ? "Taking off..." : "Yes, take it off"}
      </Button>
      <Button variant="ghost" size={size} onClick={() => setArmed(false)}><X /></Button>
    </span>
  )
}

function SlotSettings({ schedule }: { schedule: YouTubeSchedule }) {
  const queryClient = useQueryClient()
  const [slots, setSlots] = useState(schedule.settings.slots)
  const dirty = slots.join() !== schedule.settings.slots.join()
  const save = useMutation({
    mutationFn: () => api.updateYouTubeScheduleSettings({ slots, timeZoneId: schedule.settings.timeZoneId, uploadWindowHours: schedule.settings.uploadWindowHours }),
    onSuccess: (updated) => { toast.success("Daily slots saved. Clips already scheduled keep their times."); queryClient.setQueryData(scheduleQueryKey, updated) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily go-public times</CardTitle>
        <CardDescription>{schedule.settings.timeZoneName}. Each clip you schedule takes the next free time, and YouTube makes it public then, even with this PC off.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {slots.map((slot, index) => (
            <span key={index} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] px-2 py-1">
              <input aria-label={`Slot ${index + 1}`} type="time" value={slot} className="bg-transparent text-sm tabular-nums"
                onChange={(event) => setSlots((current) => current.map((value, i) => (i === index ? event.target.value : value)))} />
              <button type="button" aria-label="Remove slot" className="text-[var(--fg-muted)] hover:text-ink" disabled={slots.length === 1}
                onClick={() => setSlots((current) => current.filter((_, i) => i !== index))}><X className="size-3.5" /></button>
            </span>
          ))}
          <Button variant="ghost" size="sm" disabled={slots.length >= 12} onClick={() => setSlots((current) => [...current, "12:00"])}><Plus /> Add time</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Save times</Button>
          <p className="text-[11px] text-[var(--fg-muted)]">
            Each clip uploads about {schedule.settings.uploadWindowHours} hours before its time: YouTube allows roughly six uploads a day.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function PhoneNotifications({ schedule }: { schedule: YouTubeSchedule }) {
  const queryClient = useQueryClient()
  const notifications = schedule.notifications
  const update = useMutation({
    mutationFn: (input: { enabled: boolean; topic?: string }) => api.updatePhoneNotifications(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scheduleQueryKey }),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const test = useMutation({
    mutationFn: api.testPhoneNotification,
    onSuccess: () => toast.success("Sent. It should appear on your phone within a few seconds."),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const copyTopic = async () => {
    try { await navigator.clipboard.writeText(notifications.topic); toast.success("Topic copied") }
    catch { toast.error("Could not copy. Select the topic and copy it manually.") }
  }
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><BellRing className="size-4" /> Phone notification when a clip goes public</CardTitle>
          <CardDescription>
            Your phone gets the clip's YouTube link with a Copy button, and tapping it opens the campaign page so you can paste it into your submission.
          </CardDescription>
        </div>
        <Switch aria-label="Phone notifications" checked={notifications.enabled} disabled={update.isPending}
          onCheckedChange={(enabled) => update.mutate({ enabled })} />
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2 text-sm text-[var(--fg-body)]">
          <li>1. Install the free <strong>ntfy</strong> app on your phone (App Store or Google Play).</li>
          <li>2. Tap <strong>+</strong> (Subscribe to topic) and enter this topic exactly:</li>
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Input readOnly value={notifications.topic} className="max-w-sm font-mono text-xs" aria-label="ntfy topic" />
          <Button variant="outline" size="sm" onClick={copyTopic}>Copy</Button>
          <Button variant="ghost" size="sm" disabled={update.isPending} onClick={() => update.mutate({ enabled: notifications.enabled, topic: "new" })}>
            <RefreshCw /> New topic
          </Button>
        </div>
        <p className="text-[11px] text-[var(--fg-muted)]">
          Server: {notifications.server}. Anyone who knows the topic can read these messages, so keep it private; "New topic" replaces it.
        </p>
        <Button variant="outline" size="sm" disabled={test.isPending} onClick={() => test.mutate()}><Send /> Send a test notification</Button>
      </CardContent>
    </Card>
  )
}

export function YouTubeSchedulePanel() {
  const schedule = useYouTubeSchedule()
  if (schedule.isError) return <ErrorState title="Couldn't load the YouTube schedule" message={getErrorMessage(schedule.error)} onRetry={() => schedule.refetch()} />
  if (!schedule.data) return <Card><CardContent className="p-8 text-center text-sm text-[var(--fg-muted)]">Loading the schedule...</CardContent></Card>
  const data = schedule.data
  const upcoming = data.items.filter((item) => !["Removed", "Cancelled", "Failed"].includes(item.status))
  return (
    <div className="space-y-5">
      <Alert tone={data.connected && data.canManage ? "success" : "warning"}>
        <span className="flex gap-3">
          {data.connected && data.canManage ? <CalendarClock className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
          <span>
            {data.message}
            {data.connected && data.canManage ? <> Next free time: <strong>{formatSlot(data.nextFreeSlot)}</strong>{data.channel ? <> on <strong>{data.channel}</strong></> : null}.</> : null}
          </span>
        </span>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Upcoming on YouTube {upcoming.length ? <Badge variant="success">{upcoming.length}</Badge> : null}</CardTitle>
          <CardDescription>Schedule clips from each clip's "Schedule on YouTube" button in Rendered clips. Taking one off moves every later clip up a slot.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? <p className="text-sm text-[var(--fg-muted)]">Nothing scheduled yet.</p> : (
            <ul className="divide-y divide-[var(--border-default)]">
              {upcoming.map((job) => {
                const url = shortsUrl(job)
                return (
                  <li key={job.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="w-40 shrink-0 text-sm font-semibold tabular-nums">{formatSlot(job.scheduledPublishAt)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{job.title}</span>
                      <span className="block text-[11px] text-[var(--fg-muted)]">{scheduleState(job)}{job.notificationScheduled ? " · phone notification set" : ""}</span>
                    </span>
                    {url ? <Button variant="ghost" size="sm" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink /> YouTube</a></Button> : null}
                    {job.status !== "Published" ? <TakeOffButton job={job} /> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <SlotSettings key={data.settings.slots.join()} schedule={data} />
      <PhoneNotifications schedule={data} />
      <p className="px-1 text-[11px] text-[var(--fg-muted)]">
        Clips upload private with a scheduled publish time. If an upload hits YouTube's daily limit it waits for the reset at midnight Pacific time and tries again.
      </p>
    </div>
  )
}
