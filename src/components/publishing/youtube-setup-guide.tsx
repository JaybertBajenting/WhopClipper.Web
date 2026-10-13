import type { ReactNode } from "react"
import { CheckCircle2, Circle, Link2 } from "lucide-react"
import type { YouTubeSchedule } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function Page({ href, children }: { href: string; children: ReactNode }) {
  return <a className="font-semibold underline underline-offset-2" href={href} target="_blank" rel="noreferrer">{children}</a>
}

function Numbered({ steps }: { steps: ReactNode[] }) {
  return <ol className="space-y-2">{steps.map((step, index) => <li key={index} className="flex gap-2"><span className="shrink-0 font-semibold text-ink">{index + 1}.</span><span>{step}</span></li>)}</ol>
}

// Each step opens the exact Google page, so nothing has to be found through Google's menus.
const googleSteps: ReactNode[] = [
  <>Open <Page href="https://console.cloud.google.com/">Google Cloud Console</Page> in your browser and sign in. Any Google account you own works.</>,
  <><strong>Make a new project.</strong> At the top left, right beside the words "Google Cloud", there is a button showing the current project's name (or "Select a project"). Click it. In the window that opens, click <strong>New project</strong> at the top right. Type a name, for example Whop Clipper, and click <strong>Create</strong>.</>,
  <><strong>Switch to the new project.</strong> Wait a few seconds, click that top-left button again, and click the new project's name. Check that the button now shows the new name. Every step below happens in the project shown there.</>,
  <><strong>Turn on the YouTube API.</strong> Open the <Page href="https://console.cloud.google.com/apis/library/youtube.googleapis.com">YouTube Data API v3 page</Page> and click the blue <strong>Enable</strong> button. If the button says <strong>Manage</strong>, it is already on.</>,
  <><strong>Set up the sign-in screen.</strong> Open <Page href="https://console.cloud.google.com/auth/overview">Google Auth Platform</Page>. If you see <strong>Get started</strong>, click it and fill it in: type any app name (for example Whop Clipper), pick your email under <strong>User support email</strong>, click <strong>Next</strong>, choose <strong>External</strong>, click <strong>Next</strong>, type your email under <strong>Contact information</strong>, click <strong>Next</strong>, tick <strong>I agree</strong>, click <strong>Continue</strong>, then <strong>Create</strong>. If there is no Get started button, this is already done.</>,
  <><strong>Let your account in.</strong> Open <Page href="https://console.cloud.google.com/auth/audience">Audience</Page>. Scroll to <strong>Test users</strong>, click <strong>Add users</strong>, type the email of the Google account that owns your YouTube channel, and click <strong>Save</strong>. Use the email you sign in to YouTube with, not the channel's name. Leave <strong>Publish app</strong> alone; the app works with the project in Testing.</>,
  <><strong>Create the client.</strong> Open <Page href="https://console.cloud.google.com/auth/clients">Clients</Page> and click <strong>Create client</strong>. Under <strong>Application type</strong> choose <strong>Desktop app</strong>. Any name is fine. Click <strong>Create</strong>.</>,
  <><strong>Download the file.</strong> A box says the client was created. Click <strong>Download JSON</strong> before you close it, because Google shows the secret only then. The file goes to your Downloads folder and its name starts with client_secret_.</>,
]

const appSteps: ReactNode[] = [
  <>In this app, click <strong>Publishing</strong> in the left menu, then the <strong>Connections</strong> tab, then the <strong>YouTube Shorts</strong> button.</>,
  <>Click the dashed box that says <strong>Use a Google client file</strong>. A file window opens. Go to the file from part 1, click it, and click <strong>Open</strong>. A message says "Client ID and secret filled in".</>,
  <>In <strong>Exact channel handle or ID</strong>, type your channel's handle with the @, for example @yourchannel. To find it, open youtube.com, click your picture at the top right, and read the @name under your channel name.</>,
  <>Click <strong>Save configuration</strong> at the bottom right of the form.</>,
  <>Scroll down to <strong>Connect with Google OAuth</strong> and click <strong>Connect YouTube</strong>. Google opens in your web browser.</>,
  <>On Google's page, choose the Google account that owns the channel: the same email you added under Test users. If it then asks which channel, pick the one your clips should go to. <strong>Clips upload to the channel you pick here.</strong></>,
  <>Google then says "Google hasn't verified this app". Click <strong>Continue</strong>. This is your own app, so it is safe.</>,
  <>Tick <strong>both</strong> boxes (or <strong>Select all</strong>), then click <strong>Continue</strong>. One box lets the app upload videos. The other lets it move or delete a scheduled clip.</>,
  <>The browser says "YouTube authorization was saved securely". Close that tab and come back here. The Connections tab now says <strong>Automatic upload ready</strong>.</>,
]

// A second page needs nothing in Google Cloud: it signs in through the client file the first page uses.
const morePagesSteps: ReactNode[] = [
  <>Under <strong>Publishing</strong>, <strong>Connections</strong>, <strong>YouTube Shorts</strong>, find the box <strong>Add another page</strong>. Type the new channel's handle and click <strong>Add page</strong>.</>,
  <>Scroll down and click <strong>Connect YouTube</strong>. On Google's screen, pick the <strong>new</strong> channel, then tick both boxes and click <strong>Continue</strong>. If you pick a channel that is already connected, the app refuses it and tells you which one it was.</>,
  <>Open each campaign's <strong>Review &amp; export</strong> tab and choose its page under <strong>YouTube page for this campaign</strong>. A campaign only uploads to the page chosen for it.</>,
  <>Each page has its own daily times and its own queue. Set them under <strong>Publishing</strong>, <strong>YouTube schedule</strong>, after picking the page at the top.</>,
]

const problems: [string, ReactNode][] = [
  ["Google says \"Access blocked\" or \"has not completed the Google verification process\" (Error 403: access_denied)", <>The Google account you picked is not on the project's tester list. Open <Page href="https://console.cloud.google.com/auth/audience">Audience</Page>, click <strong>Add users</strong> under <strong>Test users</strong>, and add the email you picked on Google's "Choose an account" screen (the email, not the channel's name). Then click <strong>Connect YouTube</strong> again and pick that same email. If the email is already listed, wait a few minutes and try again: Google says a change can take from 5 minutes to a few hours to apply.</>],
  ["The schedule says \"Reconnect YouTube once\"", <>Only one of the two boxes was ticked. Click <strong>Connect YouTube</strong> again and tick both.</>],
  ["The app says Google signed it out of YouTube", <>Click <strong>Connect YouTube</strong> again and sign in as before. Clips that are already uploaded still go public on time, and clips that were waiting upload as soon as you are back in.</>],
]

/** Connecting YouTube from nothing, click by click: the Google client file first, then this app's Connections tab. */
export function YouTubeConnectSteps() {
  return (
    <div className="space-y-5 text-sm text-[var(--fg-body)]">
      <section className="space-y-2">
        <p className="font-semibold text-ink">Part 1. Make the Google client file (about 10 minutes)</p>
        <p>This is a small file from Google that lets this app upload to your channel. You make it once, in a Google Cloud project of its own. The links below open the exact Google page for each step.</p>
        <Numbered steps={googleSteps} />
        <p className="text-[11px] text-[var(--fg-muted)]">A separate project keeps its own daily upload allowance, apart from any other app of yours that uploads to YouTube.</p>
      </section>
      <section className="space-y-2">
        <p className="font-semibold text-ink">Part 2. Connect it in this app</p>
        <Numbered steps={appSteps} />
        <p className="text-[11px] text-[var(--fg-muted)]">Your Google password is typed only on Google's own page, never in this app. The file's secret is encrypted for your Windows user once you save.</p>
      </section>
      <section className="space-y-2">
        <p className="font-semibold text-ink">Adding another YouTube page</p>
        <Numbered steps={morePagesSteps} />
      </section>
      <details>
        <summary className="cursor-pointer text-xs font-semibold">If something goes wrong</summary>
        <ul className="mt-3 space-y-2">
          {problems.map(([problem, fix]) => <li key={problem}><span className="font-semibold text-ink">{problem}.</span> {fix}</li>)}
        </ul>
      </details>
    </div>
  )
}

function Step({ done, title, children }: { done: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      {done ? <CheckCircle2 aria-label="Done" className="mt-0.5 size-4 shrink-0 text-brand-dark" /> : <Circle aria-label="To do" className="mt-0.5 size-4 shrink-0 text-[var(--fg-muted)]" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <div className="space-y-2 text-sm text-[var(--fg-body)]">{children}</div>
      </div>
    </li>
  )
}

/** What to do, in order, to get clips posting by themselves. Ticks off what the app can see is done. */
export function YouTubeSetupGuide({ schedule, onOpenConnections }: { schedule: YouTubeSchedule; onOpenConnections?: () => void }) {
  const connected = schedule.connected && schedule.canManage
  const times = schedule.settings.slots.length
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up auto-upload</CardTitle>
        <CardDescription>Do this once. After that, each clip is one click, and it goes public by itself with this PC off.</CardDescription>
      </CardHeader>
      <CardContent>
        <details open={!connected}>
          <summary className="cursor-pointer text-sm font-semibold">{connected ? "Setup is done. Show the steps" : "Steps"}</summary>
          <ol className="mt-4 space-y-5">
            <Step done={connected} title="1. Connect YouTube">
              <p>{connected ? <>Connected{schedule.channel ? <> to <strong>{schedule.channel}</strong></> : null}.</> : schedule.message}</p>
              {onOpenConnections ? <Button variant="outline" size="sm" onClick={onOpenConnections}><Link2 /> Open Connections</Button> : null}
              <details>
                <summary className="cursor-pointer text-xs font-semibold">How to connect, click by click</summary>
                <div className="mt-3"><YouTubeConnectSteps /></div>
              </details>
            </Step>
            <Step done title="2. Set the daily times">
              <p>{times === 1 ? "1 time a day is set." : `${times} times a day are set.`} Each clip you schedule takes the next free time.</p>
              <p>To change them, scroll down to <strong>Daily go-public times</strong>. Click a time to edit it, click the <strong>x</strong> beside a time to remove it, or click <strong>Add time</strong> for one more. Then click <strong>Save times</strong>.</p>
            </Step>
            <Step done={schedule.notifications.enabled} title="3. Turn on the phone notification (optional)">
              <p>Scroll down to <strong>Phone notification when a clip goes public</strong> and follow the steps there. Your phone then gets each clip's link when it goes public.</p>
            </Step>
            <Step done={schedule.items.length > 0} title="4. Schedule a clip">
              <p>Click <strong>Campaigns</strong> in the left menu, open a campaign, and click the <strong>Review &amp; export</strong> tab to see its rendered clips.</p>
              <p>Check a clip's title and caption first: they become the YouTube title and description.</p>
              <p><strong>Quick way:</strong> on the clip's tile, click the small calendar icon at the bottom right. It turns into a button showing the time the clip will go public. Click that button to confirm.</p>
              <p><strong>Or</strong> click the clip to open it, find the <strong>YouTube</strong> box, click <strong>Schedule on YouTube</strong>, then <strong>Confirm</strong>.</p>
              <p>The clip uploads straight away. Keep the app open until it says "Uploaded, private until its slot". After that this PC can be off.</p>
            </Step>
          </ol>
        </details>
      </CardContent>
    </Card>
  )
}
