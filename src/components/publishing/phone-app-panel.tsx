import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BellRing, KeyRound, QrCode, RefreshCw, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function PhoneAppPanel() {
  const client = useQueryClient()
  const [serviceAccount, setServiceAccount] = useState<File | null>(null)
  const [androidSettings, setAndroidSettings] = useState<File | null>(null)
  const [pairing, setPairing] = useState<{ code: string; svg: string } | null>(null)
  const [rotateOpen, setRotateOpen] = useState(false)
  const status = useQuery({ queryKey: ["publishing", "phone-app"], queryFn: api.phoneAppStatus, refetchInterval: 15_000 })
  const invalidate = () => client.invalidateQueries({ queryKey: ["publishing", "phone-app"] })
  const fail = (error: unknown) => { toast.error(getErrorMessage(error)); void invalidate() }
  const configure = useMutation({
    mutationFn: () => api.configurePhoneApp(serviceAccount!, androidSettings!),
    onSuccess: () => { toast.success("Firebase configured. Show the QR code to pair your phone."); setServiceAccount(null); setAndroidSettings(null); setPairing(null); void invalidate() }, onError: fail,
  })
  const showPairing = useMutation({ mutationFn: api.phoneAppPairing, onSuccess: setPairing, onError: fail })
  const sync = useMutation({ mutationFn: api.syncPhoneApp, onSuccess: () => { toast.success("Schedule saved to Firebase"); void invalidate() }, onError: fail })
  const test = useMutation({ mutationFn: api.testPhoneApp, onSuccess: () => { toast.success("Test push sent. Check your phone."); void invalidate() }, onError: fail })
  const rotate = useMutation({ mutationFn: api.rotatePhoneApp, onSuccess: () => {
    setPairing(null); setRotateOpen(false); toast.success("Old phones disconnected. Pair again with the new QR code."); void invalidate()
  }, onError: fail })
  const busy = configure.isPending || sync.isPending || rotate.isPending
  const pairingImage = useMemo(() => pairing ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairing.svg)}` : undefined, [pairing])
  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="size-5" aria-hidden="true" /> 1. Connect Firebase</CardTitle>
          <CardDescription>Connect once to send your schedule and campaign links to your Android phone.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {status.isError && <Alert tone="error">{getErrorMessage(status.error)}</Alert>}
          {status.isPending && <p role="status" className="text-sm text-[var(--fg-muted)]">Checking your connection…</p>}
          {status.data?.configured && <Alert tone={status.data.lastError ? "warning" : "success"}>
            <p className="font-semibold">Connected to {status.data.projectId}</p>
            <p>{status.data.lastSyncedAt ? `Last saved ${new Date(status.data.lastSyncedAt).toLocaleString()}` : "Waiting for the first successful sync."}</p>
            <p>{status.data.deviceCount} registered phone{status.data.deviceCount === 1 ? "" : "s"} at the last cloud save.</p>
            {status.data.lastError && <p className="mt-2">{status.data.lastError}</p>}
          </Alert>}
          <p className="text-sm text-[var(--fg-muted)]">Choose both JSON files from the <strong className="text-[var(--fg-body)]">same Firebase project</strong>. The private key is encrypted in your Windows user vault.</p>
          <div className="space-y-2"><Label htmlFor="phone-service-key">Service-account private key (.json)</Label>
            <Input id="phone-service-key" type="file" accept=".json,application/json" aria-describedby="phone-service-help" disabled={busy} onChange={(event) => setServiceAccount(event.target.files?.[0] ?? null)} />
            <p id="phone-service-help" className="text-xs text-[var(--fg-muted)]">Project settings → Service accounts → Generate new private key. Keep this file on your PC.</p></div>
          <div className="space-y-2"><Label htmlFor="phone-android-settings">Android app settings (google-services.json)</Label>
            <Input id="phone-android-settings" type="file" accept=".json,application/json" aria-describedby="phone-android-help" disabled={busy} onChange={(event) => setAndroidSettings(event.target.files?.[0] ?? null)} />
            <p id="phone-android-help" className="text-xs text-[var(--fg-muted)]">Project settings → Your apps → Android app with package <code className="break-all">com.whopclipper.phone</code>.</p></div>
          <Button disabled={busy || !serviceAccount || !androidSettings} onClick={() => configure.mutate()}>{configure.isPending ? "Connecting…" : "Connect Firebase"}</Button>
          <details className="rounded-xl border p-4 text-sm leading-relaxed">
            <summary className="cursor-pointer font-semibold">First time? Firebase setup steps</summary>
            <ol className="mt-4 list-decimal space-y-3 pl-5">
              <li>Create a project in <a className="underline" href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Firebase Console</a>. Leave Analytics off and keep the Spark plan.</li>
              <li>Create the <strong>default Firestore database</strong> in production mode. Paste the rules from <code className="break-all">PhoneApp/firebase/firestore.rules</code> into its Rules tab and publish.</li>
              <li>Open <strong>Authentication → Sign-in method</strong> and enable <strong>Anonymous</strong>.</li>
              <li>Add an Android app with package name <code className="break-all">com.whopclipper.phone</code>. Download <code>google-services.json</code>. Skip the Gradle instructions; the phone gets its configuration from the pairing code.</li>
              <li>Download the service-account private key, choose both files above, and click <strong>Connect Firebase</strong>. Wait for a <strong>Last saved</strong> time before pairing.</li>
            </ol>
          </details>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="size-5" aria-hidden="true" /> 2. Pair your phone</CardTitle>
          <CardDescription>Install WhopClipper-Phone.apk, then open Whop Clipper on your phone.</CardDescription></CardHeader>
        <CardContent className="space-y-5 text-sm leading-relaxed">
          <p>Tap <strong>Scan PC QR</strong> on the phone and point its camera at the code below. If scanning is unavailable, copy the pairing code and use <strong>Paste code</strong> on your phone.</p>
          {status.data?.configured ? <Button disabled={busy || showPairing.isPending} onClick={() => showPairing.mutate()}><QrCode aria-hidden="true" /> {showPairing.isPending ? "Loading pairing QR…" : "Show pairing QR"}</Button>
            : <Alert>Complete step 1 to show your pairing QR.</Alert>}
          {pairing && <div className="space-y-3 rounded-xl border p-4">
            <p className="font-semibold">Private pairing QR and code</p>
            <p className="text-xs text-[var(--fg-muted)]">These grant access to your schedule. Only share them with your own phone.</p>
            <img className="mx-auto aspect-square w-full max-w-80 rounded-lg bg-white p-3" alt="Private phone pairing QR code. Scan with Scan PC QR in the phone app." src={pairingImage} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(pairing.code); toast.success("Pairing code copied. Use Paste code on your phone.") } catch { toast.error("Clipboard unavailable. Scan the QR code instead.") } }}>Copy pairing code</Button>
              <Button variant="ghost" onClick={() => setPairing(null)}>Hide QR</Button>
            </div>
          </div>}
          <div className="space-y-3 border-t pt-5">
            <h3 className="text-base font-semibold">3. Check your reminders</h3>
            <p className="text-[var(--fg-muted)]">Follow the phone's setup steps for notifications and precise alarms. In its Settings, finish <strong>POCO battery setup</strong>, then run the one-minute test alarm.</p>
            {status.data?.configured && <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => sync.mutate()}><RefreshCw aria-hidden="true" /> {sync.isPending ? "Syncing…" : "Sync now"}</Button>
              <Button variant="outline" disabled={busy || test.isPending} onClick={() => test.mutate()}><BellRing aria-hidden="true" /> {test.isPending ? "Sending…" : "Send test push"}</Button>
            </div>}
            <p className="text-xs text-[var(--fg-muted)]">After pairing, lock the phone and send a test push here. Check that the notification arrives.</p>
          </div>
          <Alert>The phone sets local alarms after syncing, so reminders can run with the PC off. Schedule changes reach it on the next sync. The app labels visibility as unconfirmed if it cannot verify YouTube.</Alert>
          <p className="text-xs text-[var(--fg-muted)]">Mark link submitted is a checklist saved on your phone. Submit the link yourself on Whop.</p>
          {status.data?.configured && <div className="space-y-2 border-t pt-4">
            <p className="text-xs text-[var(--fg-muted)]">To revoke access for previously paired phones, replace the pairing keys. You will need to pair every phone again.</p>
            <Button variant="ghost" disabled={busy} onClick={() => setRotateOpen(true)}><KeyRound aria-hidden="true" /> Make new keys</Button>
          </div>}
        </CardContent>
      </Card>
      <Dialog open={rotateOpen} onOpenChange={setRotateOpen}><DialogContent>
        <DialogHeader><DialogTitle>Disconnect previously paired phones?</DialogTitle><DialogDescription>Making new keys revokes their cloud access. Every phone must scan the new QR code. Previously downloaded schedules remain on those phones until they connect again.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setRotateOpen(false)}>Cancel</Button><Button disabled={rotate.isPending} onClick={() => rotate.mutate()}>{rotate.isPending ? "Replacing keys…" : "Make new keys"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  )
}
