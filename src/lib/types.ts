export type CampaignStatus = "Draft" | "Ready" | "Processing" | "NeedsReview" | "Completed" | "Archived"
export type JobStatus = "Queued" | "Running" | "Completed" | "Failed" | "Cancelled"
export type Platform = "TikTok" | "InstagramReels" | "YouTubeShorts" | "X"
export type PublishingPlatform = Exclude<Platform, "X">
export type PublishingConnectionMode = "Api" | "Manual"
export type PublishingConnectionState = "NotConfigured" | "Configured" | "NeedsAttention"
export type PublishPrivacy = "private" | "unlisted" | "public"
export type PublishStatus = "Queued" | "Validating" | "Uploading" | "Processing" | "AwaitingFinalConfirmation" | "Published" | "RequiresManualAction" | "NeedsAttention" | "Failed" | "Cancelled"
export type AiMode = "Claude" | "Codex" | "Auto" | "Compare"
export type RequirementOrigin = "Extracted" | "Default" | "UserOverride"

export interface CampaignSummary {
  id: string
  name: string
  status: CampaignStatus
  brand?: string | null
  category?: string | null
  campaignType?: "Clipping" | "UGC" | string | null
  whopUrl?: string | null
  deadline?: string | null
  /** Human-readable payout label derived from the structured fields, e.g. "$1 per 1,000 views". */
  payout?: string | null
  payoutAmount?: number | null
  /** View count the payout applies to. Null when the reward is not view-based. */
  payoutPerViews?: number | null
  payoutUnit?: string | null
  platformCount?: number
  sourceCount?: number
  updatedAt: string
  createdAt?: string
}

export interface RequirementItem {
  id?: string
  key: string
  label: string
  value: string
  category: "Format" | "Publishing" | "Brand" | "Content" | "Account" | "Reward" | "Safety" | string
  sourceText?: string | null
  confidence?: number | null
  origin?: RequirementOrigin
  needsReview?: boolean
}

export interface RequirementRevision {
  id: string
  version: number
  status?: "Draft" | "Approved" | "Superseded" | string
  approvedAt?: string | null
  createdAt: string
  items: RequirementItem[]
}

export interface PlatformProfile {
  id?: string
  platform: Platform
  enabled: boolean
  width: number
  height: number
  aspectRatio: string
  minDurationSeconds: number
  preferredDurationSeconds: number
  maxDurationSeconds: number
  maxFileSizeMb?: number | null
  captionTemplate: string
  hashtags: string[]
  mentions: string[]
  disclosure?: string | null
  cta?: string | null
  subtitleStyle?: string | null
  burnSubtitles?: boolean
  safeAreaNotes?: string | null
  brandingNotes?: string | null
  notes?: string | null
  origin?: RequirementOrigin
  complianceChecklist?: string[]
  valueOrigins?: Record<string, string>
}

export interface SourceAsset {
  id: string
  url?: string | null
  title: string
  kind?: "Remote" | "Local" | string
  status?: "Pending" | "Inspected" | "Downloading" | "Downloaded" | "Failed" | string
  durationSeconds?: number | null
  /** Confirmed to be a single video: a known duration, or a video content type from the host. */
  isVideo?: boolean
  uploader?: string | null
  thumbnailUrl?: string | null
  localPath?: string | null
  subtitleRelativePath?: string | null
  format?: string | null
  fileSizeBytes?: number | null
  hasTranscript?: boolean
  isLocalFile?: boolean
  createdAt?: string
}

export type CampaignDocumentKind = "Pdf" | "Word" | "Text" | "Markdown" | "Html"
export type DocumentExtractionStatus = "Pending" | "Extracted" | "Failed"
export type ReferenceVideoStatus = "Pending" | "Analyzing" | "Analyzed" | "Failed"

export interface CampaignDocument {
  id: string
  fileName: string
  kind: CampaignDocumentKind
  sizeBytes: number
  pageCount?: number | null
  extractedCharacterCount: number
  extractionStatus: DocumentExtractionStatus
  extractionError?: string | null
  includeInExtraction: boolean
  relativePath: string
  uploadedAt: string
}

/** The client logo burned into every clip. Sizes are fractions of the output frame. */
export interface CampaignBranding {
  logoRelativePath?: string | null
  logoFileName?: string | null
  logoCropRect?: string | null
  position: "Top" | "Center" | "Bottom"
  widthFraction: number
  marginFraction: number
  opacity: number
  enabled: boolean
}

export type EditStyleKind = "Streamer" | "PodcastSplit"

/** Which edit a campaign's clips get. The podcast fields only matter for "PodcastSplit". */
export interface CampaignEditStyle {
  style: EditStyleKind
  musicVolume: number
  musicDuckingDb: number
  captionFont: string
  captionFontSize: number
  logoWidthFraction: number
  logoRightMarginFraction: number
  logoTopMarginFraction: number
  brollShotSeconds: number
  /** The one folder of music beds this campaign draws from; unset means every enabled folder. */
  musicLocationId?: string | null
  /** File names this campaign will not use, e.g. a bed that drowned the speech. Never offered or picked. */
  excludedMusic?: string[] | null
  /** Loudness of the podcast voice, 1 = the normalised baseline. Turn up if music covers it. */
  voiceVolume?: number
}

/** How a podcast-split clip was put together: the footage underneath and any moment left without any. */
export interface RenderedClipStyle {
  style: EditStyleKind | string
  pieces: number
  cameraShots: number
  brollShots: number
  gaps: Array<{ atSeconds: number; durationSeconds: number; query: string; reason: string }>
  footage: Array<{ query: string; title?: string | null; url?: string | null }>
  /** This clip's own voice/music gains, if it overrides the campaign default. */
  voiceVolume?: number | null
  musicVolume?: number | null
}

export interface ReferenceStyleProfile {
  schemaVersion: string
  durationSeconds: number
  width: number
  height: number
  aspectRatio: string
  orientation: string
  frameRate: number
  hasAudio: boolean
  pacing: "VeryFast" | "Fast" | "Medium" | "Slow" | string
  shots: {
    cutCount: number
    cutsPerMinute: number
    averageShotSeconds: number
    medianShotSeconds: number
    shortestShotSeconds: number
    longestShotSeconds: number
    openingShotSeconds: number
  }
  loudness: { integratedLufs?: number | null; loudnessRangeLu?: number | null; truePeakDb?: number | null }
  spokenWordsPerMinute?: number | null
  cutTimestamps: number[]
  summary: string[]
  derivedAt: string
}

export interface ReferenceVideo {
  id: string
  label: string
  url?: string | null
  localRelativePath?: string | null
  notes?: string | null
  isPrimary: boolean
  durationSeconds?: number | null
  status: ReferenceVideoStatus
  error?: string | null
  styleProfile?: ReferenceStyleProfile | null
  createdAt: string
  analyzedAt?: string | null
}

export type DetectedLinkKind = "Media" | "Admin" | "Other"

/** A URL found in the campaign brief that can be accepted as a source or a reference. */
export interface DetectedLink {
  url: string
  host: string
  kind: DetectedLinkKind
  context: string
  occurrences: number
  alreadySource: boolean
  alreadyReference: boolean
}

/**
 * Campaign media on disk that no campaign owns. Left behind when a campaign's rows were deleted
 * but its folder could not be, so nothing in the app points at it any more.
 */
export interface OrphanedCampaignFolder {
  folderName: string
  sizeBytes: number
  fileCount: number
  lastModified: string
}

/** A finished render sitting in the campaign's output folder. */
export interface RenderedClip {
  relativePath: string
  fileName: string
  platform: string
  sizeBytes: number
  createdAt: string
  editPlanId?: string | null
  startSeconds?: number | null
  endSeconds?: number | null
  /** What the clip is about - the hook burned onto it. */
  title?: string
  /** Ready to paste into an upload form, required hashtags already included. */
  caption?: string
  /** Set for podcast-split clips only. */
  style?: RenderedClipStyle | null
}

export interface CampaignDetail extends CampaignSummary {
  rawInstructions: string
  notes?: string | null
  requirements: RequirementRevision[]
  platformProfiles: PlatformProfile[]
  sources: SourceAsset[]
  documents: CampaignDocument[]
  referenceVideos: ReferenceVideo[]
  branding?: CampaignBranding | null
  /** Null until a style is chosen, which means the streamer style. */
  editStyle?: CampaignEditStyle | null
  selectedAiMode?: AiMode
  latestAnalysis?: AiAnalysis | null
  editPlans?: EditPlan[]
}

export interface DashboardSummary {
  campaignCounts: Partial<Record<CampaignStatus, number>>
  activeJobs: number
  failedJobs: number
  needsReview: number
  storageUsedBytes: number
  recentCampaigns: CampaignSummary[]
  recentJobs: Job[]
}

export interface Job {
  id: string
  campaignId?: string | null
  campaignName?: string | null
  /** The video this job is working on, or for a render the clip it is producing. */
  subjectName?: string | null
  type: "Download" | "Metadata" | "Transcription" | "AiAnalysis" | "Render" | "Validation" | "Export" | string
  status: JobStatus
  progress: number
  message?: string | null
  errorSummary?: string | null
  createdAt: string
  startedAt?: string | null
  completedAt?: string | null
  outputPath?: string | null
  provider?: string | null
  resultJson?: string | null
}

export interface HighlightCandidate {
  id: string
  rank: number
  title: string
  startSeconds: number
  endSeconds: number
  hook: string
  rationale: string
  confidence: number
  campaignFit: number
  retentionPotential: number
  clarity?: number
  emotionalImpact?: number
  provider: "Claude" | "Codex" | string
  platform?: Platform
  uncertainties?: string[]
  editRecommendation?: {
    width?: number
    height?: number
    framesPerSecond?: number
    framing?: string
    burnSubtitles?: boolean
    subtitleStyle?: string
    subtitleRelativePath?: string | null
    musicAssetId?: string | null
    musicVolume?: number
    musicDuckingDb?: number
    overlayText?: string
    soundEffects?: Array<{ assetId: string; atSeconds: number; gainDb: number }>
  }
}

export interface AiAnalysis {
  id: string
  status: JobStatus
  mode: AiMode
  createdAt: string
  sourceAssetId: string
  platform?: Platform
  sharedContextSummary?: string | null
  candidates: HighlightCandidate[]
  providerRuns?: Array<{
    provider: string
    status: JobStatus
    model?: string | null
    durationMs?: number | null
    candidateCount?: number
    error?: string | null
  }>
}

export interface EditPlan {
  id: string
  name: string
  campaignId: string
  sourceAssetId: string
  platform: Platform
  highlightCandidateId?: string | null
  startSeconds: number
  endSeconds: number
  width: number
  height: number
  fps: number
  framing: "SmartCrop" | "CenterCrop" | "BlurredBackground" | "Letterbox" | string
  subtitleEnabled: boolean
  subtitleStyle: string
  subtitleRelativePath?: string | null
  musicAssetId?: string | null
  musicVolume: number
  normalizeAudio: boolean
  musicDuckingDb: number
  soundEffects?: Array<{ assetId: string; atSeconds: number; gainDb: number }>
  /** Handle burned along the bottom for the whole clip. Kept apart from `overlays` so a hook
   * added at the front cannot be mistaken for the CTA. */
  ctaText?: string | null
  /**
   * `style` picks stroked text ("Outline") or the white caption card ("Card").
   * `yFraction` pins the top edge at a fraction of frame height, overriding `position` - a clip
   * composited with a facecam across the top has no usable named edge for the hook.
   */
  overlays?: Array<{ type: string; text: string; atSeconds: number; endSeconds?: number; position?: string; fontSize?: number; color?: string; style?: "Outline" | "Card"; yFraction?: number | null }>
  status?: "Draft" | "Approved" | "Rendered" | string
  ffmpegPreview?: string | null
}

export interface MediaLocation {
  id: string
  path: string
  type: "Music" | "SoundEffect" | "Mixed" | string
  assetCount?: number
  lastScannedAt?: string | null
}

export interface MediaAsset {
  id: string
  locationId?: string
  name: string
  path: string
  type: "Music" | "SoundEffect" | string
  durationSeconds?: number | null
  mood?: string | null
  energy?: string | null
  genre?: string | null
  bpm?: number | null
  tags: string[]
  favorite: boolean
  licenseNotes?: string | null
  hash?: string | null
  sizeBytes?: number | null
}

export interface SystemDependency {
  name: "PostgreSQL" | "yt-dlp" | "FFmpeg" | "FFprobe" | "Claude CLI" | "Codex CLI" | string
  available: boolean
  version?: string | null
  path?: string | null
  detail?: string | null
}

export interface AiProviderStatus {
  provider: "Claude" | "Codex" | string
  available: boolean
  authenticated?: boolean
  version?: string | null
  model?: string | null
  detail?: string | null
}

export interface AppSettings {
  workspacePath: string
  databaseConnection?: string | null
  ytDlpPath: string
  ffmpegPath: string
  ffprobePath: string
  claudePath: string
  codexPath: string
  defaultAiMode: AiMode
  aiTimeoutMinutes: number
  maxConcurrentMediaJobs: number
  requireEditApproval: boolean
  preferredVideoQuality: string
  cookiesFromBrowser?: string | null
  cookiesFilePath?: string | null
  jsRuntime?: string | null
}

export interface ValidationResult {
  id?: string
  renderId?: string
  readyToUpload: boolean
  checks: Array<{
    id: string
    label: string
    group: "Technical" | "Campaign" | "Publishing" | string
    status: "Passed" | "NeedsReview" | "Failed"
    detail?: string | null
  }>
  outputPath?: string | null
  publishingText?: string | null
}

export interface PlatformCredentialRequirement {
  key: string
  label: string
  secret: boolean
  required: boolean
  helpText: string
}

/** Platform guidance returned by the local API. Passwords are intentionally never part of this contract. */
export interface PlatformGuide {
  platform: PublishingPlatform
  displayName: string
  connectionMode: PublishingConnectionMode
  signupUrl: string
  accountTypeRequirement: string
  credentialRequirements: PlatformCredentialRequirement[]
  videoRequirements: string[]
  uploadInstructions: string[]
  limitations: string[]
}

export interface AccountKitField {
  key: string
  label: string
  value: string
  required: boolean
  copyable: boolean
  helpText: string
}

/** Non-secret signup/profile data scoped to one campaign and platform. */
export interface AccountKit {
  campaignId: string
  platform: PublishingPlatform
  displayName: string
  connectionMode: PublishingConnectionMode
  signupUrl: string
  fields: AccountKitField[]
  setupSteps: string[]
  publishDefaults: {
    enabled: boolean
    title: string
    caption: string
    hashtags: string[]
    mentions: string[]
    disclosure?: string | null
    callToAction?: string | null
    privacy: PublishPrivacy
  }
}

export interface PublishingConnectionStatus {
  platform: PublishingPlatform
  connectionMode: PublishingConnectionMode
  status: PublishingConnectionState
  configuredFields: string[]
  secretConfigured: {
    clientSecret: boolean
    accessToken: boolean
    refreshToken: boolean
  }
  accountIdentifier?: string | null
  grantedScopes: string[]
  tokenExpiresAt?: string | null
  updatedAt?: string | null
  lastValidatedAt?: string | null
  lastError?: string | null
  /** Server-evaluated publishing capability; the UI must not infer this from saved fields. */
  canPublish: boolean
  capabilityMessage: string
}

export interface PublishingConnectionInput {
  clientId?: string | null
  clientSecret?: string | null
  accessToken?: string | null
  refreshToken?: string | null
  accountId?: string | null
  authMode?: "FacebookLoginForBusiness" | null
  pageId?: string | null
  tokenExpiresAt?: string | null
  clearFields?: string[]
}

export interface PublishingSession {
  nonce: string
  headerName: string
}

export interface PublishJob {
  id: string
  campaignId: string
  platform: PublishingPlatform
  status: PublishStatus
  progress: number
  outputRelativePath: string
  fileName: string
  title: string
  caption: string
  privacy: PublishPrivacy
  shareToFeed: boolean
  dryRun: boolean
  accountIdentifier?: string | null
  fileSha256: string
  externalId?: string | null
  externalUrl?: string | null
  error?: string | null
  manualPackageDownloadUrl?: string | null
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
}

export interface CreatePublishJobInput {
  platform: PublishingPlatform
  outputRelativePath: string
  title: string
  caption: string
  privacy: PublishPrivacy
  shareToFeed?: boolean
  /** The local API refuses any upload that has not been explicitly confirmed in the UI. */
  confirmed: true
  /** Generated for each deliberate publish action so retries cannot create duplicate posts. */
  idempotencyKey: string
  dryRun?: boolean
}

export interface YouTubeOAuthStart {
  authorizationUrl: string
  expiresAt: string
}
