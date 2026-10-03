import type { CampaignEditStyle, EditStyleKind, RenderedClipStyle } from "@/lib/types"

/** What the API returns for a campaign that has never picked a style. */
export const DEFAULT_EDIT_STYLE: CampaignEditStyle = {
  style: "Streamer",
  musicVolume: 0.2,
  voiceVolume: 1,
  musicDuckingDb: -14,
  captionFont: "Segoe UI Black",
  captionFontSize: 84,
  logoWidthFraction: 0.2,
  logoRightMarginFraction: 0.074,
  logoTopMarginFraction: 0.071,
  brollShotSeconds: 2.2,
}

export const EDIT_STYLE_OPTIONS: Array<{ value: EditStyleKind; title: string; description: string }> = [
  {
    value: "Streamer",
    title: "Streamer highlights",
    description: "Full-frame crop on the streamer, a hook card, sound cues and colour flashes.",
  },
  {
    value: "PodcastSplit",
    title: "Podcast split + B-roll",
    description: "Guest on top, required relevant B-roll underneath, one word at a time on the split line. Missing footage stops the render for review.",
  },
  {
    value: "NarratedLuxury",
    title: "Narrated luxury (MambaFX)",
    description: "A narrator sets the story up over a fast montage, then the vlog moment plays in a window under a meme title. One coloured word at a time, skull ending. Needs an ElevenLabs voice in Settings.",
  },
]

export const editStyleSignature = (style?: CampaignEditStyle | null) => {
  const value = style ?? DEFAULT_EDIT_STYLE
  return [value.style, value.musicVolume, value.voiceVolume ?? 1, value.musicDuckingDb, value.brollShotSeconds,
    value.logoWidthFraction, value.captionFont, value.captionFontSize, value.logoRightMarginFraction,
    value.logoTopMarginFraction, value.skullEnding ?? true, value.soundEffects ?? true].join("|")
}

/** One line for a clip tile: how many shots of footage, and whether any moment came back empty. */
export function describeClipStyle(style?: RenderedClipStyle | null): { summary: string; gapCount: number } | null {
  if (!style || style.style !== "PodcastSplit") return null
  const gapCount = style.gaps?.length ?? 0
  const shots = `${style.brollShots} B-roll shot${style.brollShots === 1 ? "" : "s"}`
  const pieces = `${style.pieces} piece${style.pieces === 1 ? "" : "s"}`
  const gaps = gapCount === 0 ? "no gaps" : `${gapCount} gap${gapCount === 1 ? "" : "s"}`
  return { summary: `${pieces} · ${shots} · ${gaps}`, gapCount }
}
