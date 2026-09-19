import axios, { AxiosError } from "axios"
import { formatPayout } from "@/lib/utils"
import type {
  AiAnalysis, AiMode, AiProviderStatus, AppSettings, CampaignBranding, CampaignDetail, CampaignEditStyle, CampaignDocument, CampaignStatus, CampaignSummary,
  AccountKit, CreatePublishJobInput, DashboardSummary, EditPlan, Job, JobStatus, MediaAsset, MediaLocation, Platform, PlatformGuide,
  PlatformProfile, PublishingConnectionInput, PublishingConnectionStatus, PublishingPlatform, PublishingSession, PublishJob, PublishStatus, ReferenceVideo,
  RequirementItem, RequirementRevision, SourceAsset, SystemDependency, YouTubeOAuthStart,
} from "@/lib/types"

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5080/api"
export const API_BASE_URL = configuredBaseUrl === "/" ? "" : configuredBaseUrl.replace(/\/$/, "")

export const http = axios.create({ baseURL: API_BASE_URL, timeout: 30_000, headers: { Accept: "application/json" } })

/** Kept in step with CampaignDocumentService.MaxUploadBytes and the reference upload cap in ApiEndpoints. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 ** 2
export const MAX_REFERENCE_BYTES = 2 * 1024 ** 3
export const ACCEPTED_DOCUMENT_TYPES = ".pdf,.docx,.dotx,.txt,.md"
/** Kept in step with CampaignBrandingService.MaxUploadBytes. */
export const MAX_LOGO_BYTES = 8 * 1024 ** 2
export const ACCEPTED_LOGO_TYPES = ".png,.webp"
export const ACCEPTED_REFERENCE_TYPES = ".mp4,.mov,.m4v,.webm,.mkv"

export class ApiError extends Error {
  status?: number
  details?: string
  constructor(message: string, status?: number, details?: string) { super(message); this.name = "ApiError"; this.status = status; this.details = details }
}

http.interceptors.response.use((response) => response, (error: AxiosError<{ title?: string; detail?: string; message?: string; error?: string; errors?: Record<string, string[]> }>) => {
  const body = error.response?.data
  const validation = body?.errors ? Object.values(body.errors).flat().join(" ") : undefined
  const offline = !error.response && error.code !== "ECONNABORTED"
  const message = offline ? "The local API is not reachable. Start Whop Clipper or the .NET backend and try again." : validation || body?.detail || body?.message || body?.error || body?.title || error.message
  return Promise.reject(new ApiError(message, error.response?.status, body?.detail))
})

function data<T>(promise: Promise<{ data: T }>) { return promise.then((response) => response.data) }
let publishingSessionRequest: Promise<PublishingSession> | null = null
function getPublishingSession(refresh = false) {
  if (refresh || !publishingSessionRequest) publishingSessionRequest = data(http.get<PublishingSession>("/publishing/session"))
  return publishingSessionRequest
}
async function publishingWrite<T>(request: (headers: Record<string, string>) => Promise<{ data: T }>) {
  const run = async (refresh: boolean) => {
    const session = await getPublishingSession(refresh)
    return data(request({ [session.headerName]: session.nonce }))
  }
  try { return await run(false) }
  catch (error) {
    if (error instanceof ApiError && error.status === 403) return run(true)
    throw error
  }
}
function humanize(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()) }
function aspectRatio(width: number, height: number) { const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a; const divisor = gcd(width, height); return `${width / divisor}:${height / divisor}` }
function safeResult(value?: string | null): Record<string, unknown> { try { return value ? JSON.parse(value) as Record<string, unknown> : {} } catch { return {} } }
function safeObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return safeResult(value)
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function aiRecommendation(value: unknown): NonNullable<import("@/lib/types").HighlightCandidate["editRecommendation"]> {
  const raw = safeObject(value)
  const number = (...keys: string[]) => { const found = keys.map((key) => raw[key]).find((item) => typeof item === "number"); return found as number | undefined }
  const string = (...keys: string[]) => { const found = keys.map((key) => raw[key]).find((item) => typeof item === "string"); return found as string | undefined }
  const boolean = (...keys: string[]) => { const found = keys.map((key) => raw[key]).find((item) => typeof item === "boolean"); return found as boolean | undefined }
  const effects = (Array.isArray(raw.soundEffects) ? raw.soundEffects : Array.isArray(raw.sfx) ? raw.sfx : []).flatMap((effect) => {
    if (!effect || typeof effect !== "object") return []
    const item = effect as Record<string, unknown>
    const assetId = typeof item.assetId === "string" ? item.assetId : typeof item.id === "string" ? item.id : undefined
    if (!assetId) return []
    return [{ assetId, atSeconds: typeof item.atSeconds === "number" ? item.atSeconds : typeof item.timestamp === "number" ? item.timestamp : 0, gainDb: typeof item.gainDb === "number" ? item.gainDb : 0 }]
  })
  return { width: number("width"), height: number("height"), framesPerSecond: number("framesPerSecond", "fps"), framing: string("framing", "framingStrategy"), burnSubtitles: boolean("burnSubtitles", "subtitleEnabled"), subtitleStyle: string("subtitleStyle"), subtitleRelativePath: string("subtitleRelativePath", "subtitlePath") ?? null, musicAssetId: string("musicAssetId") ?? null, musicVolume: number("musicVolume"), musicDuckingDb: number("musicDuckingDb"), overlayText: string("ctaOverlayText", "overlayText", "cta"), soundEffects: effects }
}

interface ApiRequirementItem { id: string; category: string; key: string; value: string; sourceText: string; confidence: number; needsReview: boolean }
interface ApiRequirementRevision { id: string; version: number; isApproved: boolean; createdAt: string; approvedAt?: string | null; items: ApiRequirementItem[] }
interface ApiPlatformProfile { id: string; platform: Platform; enabled: boolean; width: number; height: number; minDurationSeconds: number; preferredDurationSeconds: number; maxDurationSeconds: number; maxFileSizeBytes?: number | null; captionTemplate: string; requiredHashtags: string[]; requiredMentions: string[]; disclosureText?: string | null; callToAction?: string | null; burnSubtitles: boolean; safeAreaNotes: string; complianceChecklist: string[]; valueOrigins: Record<string, string>; updatedAt: string }
interface ApiSource { isLocalFile?: boolean; id: string; url: string; title?: string | null; uploader?: string | null; durationSeconds?: number | null; isVideo?: boolean; fileSizeBytes?: number | null; thumbnailUrl?: string | null; localRelativePath?: string | null; subtitleRelativePath?: string | null; status?: string | null; createdAt: string; downloadedAt?: string | null }
interface ApiCampaignSummary { id: string; name: string; brand?: string | null; status: CampaignStatus; updatedAt: string; sourceCount: number; platformCount: number; latestRequirementVersion?: number | null; campaignType?: string | null; category?: string | null; payoutAmount?: number | null; payoutPerViews?: number | null; payoutUnit?: string | null; deadline?: string | null; whopUrl?: string | null }
interface ApiCampaignDocument { id: string; fileName: string; kind: CampaignDocument["kind"]; sizeBytes: number; pageCount?: number | null; extractedCharacterCount: number; extractionStatus: CampaignDocument["extractionStatus"]; extractionError?: string | null; includeInExtraction: boolean; relativePath: string; uploadedAt: string }
interface ApiReferenceVideo { id: string; label: string; url?: string | null; localRelativePath?: string | null; notes?: string | null; isPrimary: boolean; durationSeconds?: number | null; status: ReferenceVideo["status"]; error?: string | null; styleProfile?: unknown; createdAt: string; analyzedAt?: string | null }
interface ApiCampaignDetail { id: string; name: string; whopUrl?: string | null; campaignType: string; brand?: string | null; category?: string | null; payoutAmount?: number | null; payoutPerViews?: number | null; payoutUnit?: string | null; deadline?: string | null; rawInstructions: string; notes?: string | null; status: CampaignStatus; createdAt: string; updatedAt: string; requirementRevisions: ApiRequirementRevision[]; platformProfiles: ApiPlatformProfile[]; sources: ApiSource[]; documents?: ApiCampaignDocument[]; referenceVideos?: ApiReferenceVideo[]; branding?: CampaignBranding | null; editStyle?: CampaignEditStyle | null }
interface ApiJob { id: string; campaignId?: string | null; campaignName?: string | null; subjectName?: string | null; kind: string; status: JobStatus; progress: number; resultJson?: string | null; result?: Record<string, unknown> | null; error?: string | null; exitCode?: number | null; attempt: number; createdAt: string; startedAt?: string | null; completedAt?: string | null }
interface ApiOverlay { text: string; startSeconds: number; endSeconds: number; position: string; fontSize: number; color: string }
interface ApiEditPlan { id: string; campaignId: string; sourceAssetId: string; platform: Platform; startSeconds: number; endSeconds: number; width: number; height: number; framesPerSecond: number; crf: number; normalizeAudio: boolean; burnSubtitles: boolean; subtitleRelativePath?: string | null; musicAssetId?: string | null; musicVolume: number; outputFileName: string; isApproved: boolean; framing?: string | null; ctaOverlayText?: string | null; subtitleStyle?: string | null; musicDuckingDb?: number | null; soundEffects?: Array<{ assetId: string; atSeconds: number; gainDb: number }>; overlays?: ApiOverlay[]; createdAt: string }
interface ApiHighlight { id: string; provider: string; rank: number; startSeconds: number; endSeconds: number; hook: string; rationale: string; score: number; confidence: number; isSelected: boolean; editPlan?: unknown; editPlanJson?: string }
interface ApiAnalysis { id: string; campaignId: string; sourceAssetId: string; jobId: string; mode: AiMode; status: string; providers: string[]; error?: string | null; createdAt: string; completedAt?: string | null; highlights: ApiHighlight[] }
interface ApiMediaAsset { id: string; locationId: string; fileName: string; kind: "Music" | "SoundEffect"; sizeBytes: number; contentHash: string; durationSeconds?: number | null; tags: string[]; mood?: string | null; energy?: string | null; genre?: string | null; bpm?: number | null; favorite: boolean; licenseNotes?: string | null; indexedAt: string }
interface ApiMediaLocation { id: string; path: string; kind: "Music" | "SoundEffect"; enabled: boolean; createdAt: string }
interface ApiSettings { cookiesFromBrowser?: string | null; cookiesFilePath?: string | null; jsRuntime?: string | null; workspaceRoot: string; workspacePath?: string; ytDlpPath: string; ffmpegPath: string; ffprobePath: string; claudePath: string; codexPath: string; processTimeoutMinutes: number; aiTimeoutMinutes?: number; defaultAiMode?: AiMode; maxConcurrentMediaJobs?: number; requireEditApproval?: boolean; preferredVideoQuality?: string }
interface ApiDashboard { campaignCounts?: { total: number; draft: number; ready: number; processing: number; needsReview: number; completed: number; archived: number }; activeJobs?: number; failedJobs?: number; needsReview?: number; storageUsedBytes?: number; recentCampaigns?: ApiCampaignSummary[]; recentJobs: ApiJob[]; campaignCount: number; readyCount: number; needsReviewCount: number; failedJobCount: number }

function mapRequirementItem(item: ApiRequirementItem): RequirementItem { return { ...item, label: humanize(item.key), origin: "Extracted" } }
function mapRevision(revision: ApiRequirementRevision): RequirementRevision { return { id: revision.id, version: revision.version, status: revision.isApproved ? "Approved" : "Draft", approvedAt: revision.approvedAt, createdAt: revision.createdAt, items: revision.items.map(mapRequirementItem) } }
function mapProfile(profile: ApiPlatformProfile): PlatformProfile { return { id: profile.id, platform: profile.platform, enabled: profile.enabled, width: profile.width, height: profile.height, aspectRatio: aspectRatio(profile.width, profile.height), minDurationSeconds: profile.minDurationSeconds, preferredDurationSeconds: profile.preferredDurationSeconds, maxDurationSeconds: profile.maxDurationSeconds, maxFileSizeMb: profile.maxFileSizeBytes == null ? null : profile.maxFileSizeBytes / 1024 ** 2, captionTemplate: profile.captionTemplate, hashtags: profile.requiredHashtags ?? [], mentions: profile.requiredMentions ?? [], disclosure: profile.disclosureText, cta: profile.callToAction, burnSubtitles: profile.burnSubtitles, subtitleStyle: profile.burnSubtitles ? "Campaign subtitle style" : "", safeAreaNotes: profile.safeAreaNotes, complianceChecklist: profile.complianceChecklist ?? [], valueOrigins: profile.valueOrigins ?? {}, origin: Object.keys(profile.valueOrigins ?? {}).length ? "Extracted" : "Default" } }
function mapSource(source: ApiSource): SourceAsset { return { id: source.id, url: source.url, isLocalFile: source.isLocalFile ?? !source.url, title: source.title || source.url || "Local file", status: source.status || (source.localRelativePath ? "Downloaded" : source.title ? "Inspected" : "Pending"), durationSeconds: source.durationSeconds, isVideo: source.isVideo ?? (source.durationSeconds ?? 0) > 0, fileSizeBytes: source.fileSizeBytes, uploader: source.uploader, thumbnailUrl: source.thumbnailUrl, localPath: source.localRelativePath, subtitleRelativePath: source.subtitleRelativePath, createdAt: source.createdAt } }
function mapSummary(campaign: ApiCampaignSummary): CampaignSummary { return { ...campaign, brand: campaign.brand, updatedAt: campaign.updatedAt, payout: formatPayout(campaign.payoutAmount, campaign.payoutPerViews, campaign.payoutUnit) } }
function mapDocument(document: ApiCampaignDocument): CampaignDocument { return { id: document.id, fileName: document.fileName, kind: document.kind, sizeBytes: document.sizeBytes, pageCount: document.pageCount, extractedCharacterCount: document.extractedCharacterCount, extractionStatus: document.extractionStatus, extractionError: document.extractionError, includeInExtraction: document.includeInExtraction, relativePath: document.relativePath, uploadedAt: document.uploadedAt } }
function mapReference(reference: ApiReferenceVideo): ReferenceVideo { const profile = reference.styleProfile && typeof reference.styleProfile === "object" ? reference.styleProfile as ReferenceVideo["styleProfile"] : null; return { id: reference.id, label: reference.label, url: reference.url, localRelativePath: reference.localRelativePath, notes: reference.notes, isPrimary: reference.isPrimary, durationSeconds: reference.durationSeconds, status: reference.status, error: reference.error, styleProfile: profile, createdAt: reference.createdAt, analyzedAt: reference.analyzedAt } }
function mapJob(job: ApiJob): Job { const result = job.result ?? safeResult(job.resultJson); const progress = job.progress <= 1 ? job.progress * 100 : job.progress; return { id: job.id, campaignId: job.campaignId, campaignName: job.campaignName, subjectName: job.subjectName, type: job.kind, status: job.status, progress, message: job.error || (job.status === "Running" ? `${humanize(job.kind)} in progress` : undefined), errorSummary: job.error, resultJson: job.resultJson, outputPath: typeof result.outputRelativePath === "string" ? result.outputRelativePath : undefined, createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt } }
function mapEditPlan(plan: ApiEditPlan): EditPlan { return { id: plan.id, name: plan.outputFileName.replace(/\.mp4$/i, ""), campaignId: plan.campaignId, sourceAssetId: plan.sourceAssetId, platform: plan.platform, startSeconds: plan.startSeconds, endSeconds: plan.endSeconds, width: plan.width, height: plan.height, fps: plan.framesPerSecond, framing: plan.framing || "CenterCrop", subtitleEnabled: plan.burnSubtitles, subtitleStyle: plan.subtitleStyle ?? "", subtitleRelativePath: plan.subtitleRelativePath, musicAssetId: plan.musicAssetId, musicVolume: plan.musicVolume, normalizeAudio: plan.normalizeAudio, musicDuckingDb: plan.musicDuckingDb ?? -12, soundEffects: plan.soundEffects ?? [], overlays: (plan.overlays ?? []).map((overlay) => ({ type: "Text", text: overlay.text, atSeconds: overlay.startSeconds, endSeconds: overlay.endSeconds, position: overlay.position, fontSize: overlay.fontSize, color: overlay.color })), status: plan.isApproved ? "Approved" : "Draft" } }
function mapAnalysis(run: ApiAnalysis): AiAnalysis { return { id: run.id, sourceAssetId: run.sourceAssetId, mode: run.mode, status: run.status as JobStatus, createdAt: run.createdAt, sharedContextSummary: run.error || undefined, providerRuns: run.providers.map((provider) => ({ provider, status: run.status as JobStatus, candidateCount: run.highlights.filter((item) => item.provider === provider).length })), candidates: run.highlights.map((item) => ({ id: item.id, rank: item.rank, title: item.hook.slice(0, 72) || `${item.provider} highlight ${item.rank}`, startSeconds: item.startSeconds, endSeconds: item.endSeconds, hook: item.hook, rationale: item.rationale, confidence: item.confidence, campaignFit: item.score, retentionPotential: item.score, provider: item.provider, editRecommendation: aiRecommendation(item.editPlan ?? item.editPlanJson) })) } }
function mapMediaAsset(asset: ApiMediaAsset): MediaAsset { return { id: asset.id, locationId: asset.locationId, name: asset.fileName, path: asset.fileName, type: asset.kind, durationSeconds: asset.durationSeconds, mood: asset.mood, energy: asset.energy, genre: asset.genre, bpm: asset.bpm, tags: asset.tags ?? [], favorite: asset.favorite, licenseNotes: asset.licenseNotes, hash: asset.contentHash, sizeBytes: asset.sizeBytes } }
function mapSettings(settings: ApiSettings): AppSettings { return { workspacePath: settings.workspacePath || settings.workspaceRoot, ytDlpPath: settings.ytDlpPath, ffmpegPath: settings.ffmpegPath, ffprobePath: settings.ffprobePath, claudePath: settings.claudePath, codexPath: settings.codexPath, defaultAiMode: settings.defaultAiMode ?? "Compare", aiTimeoutMinutes: settings.aiTimeoutMinutes ?? settings.processTimeoutMinutes, maxConcurrentMediaJobs: settings.maxConcurrentMediaJobs ?? 1, requireEditApproval: settings.requireEditApproval ?? true, preferredVideoQuality: settings.preferredVideoQuality ?? "Best", cookiesFromBrowser: settings.cookiesFromBrowser ?? "", cookiesFilePath: settings.cookiesFilePath ?? "", jsRuntime: settings.jsRuntime ?? "" } }

export interface CreateCampaignInput {
  name: string
  whopUrl?: string
  brand?: string
  category?: string
  campaignType?: string
  payoutAmount?: number | null
  payoutPerViews?: number | null
  payoutUnit?: string | null
  /** ISO date (yyyy-mm-dd), or null for "no deadline". */
  deadline?: string | null
  rawInstructions: string
  notes?: string
}

async function fetchCampaignRaw(id: string) { return data(http.get<ApiCampaignDetail>(`/campaigns/${id}`)) }
async function fetchMediaAssets() { return (await data(http.get<ApiMediaAsset[]>("/media-library/assets"))).map(mapMediaAsset) }
async function fetchLatestAnalysis(campaignId: string) {
  try { return mapAnalysis(await data(http.get<ApiAnalysis>(`/campaigns/${campaignId}/ai-analysis/latest`))) }
  catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error }
}

export const api = {
  dashboard: async () => {
    const [summary, campaigns] = await Promise.all([data(http.get<ApiDashboard>("/dashboard")), data(http.get<ApiCampaignSummary[]>("/campaigns"))])
    const mappedCampaigns = (summary.recentCampaigns?.length ? summary.recentCampaigns : campaigns).map(mapSummary)
    const campaignCounts = summary.campaignCounts ? { Draft: summary.campaignCounts.draft, Ready: summary.campaignCounts.ready, Processing: summary.campaignCounts.processing, NeedsReview: summary.campaignCounts.needsReview, Completed: summary.campaignCounts.completed, Archived: summary.campaignCounts.archived } : campaigns.map(mapSummary).reduce<DashboardSummary["campaignCounts"]>((counts, campaign) => { counts[campaign.status] = (counts[campaign.status] ?? 0) + 1; return counts }, {})
    const recentJobs = summary.recentJobs.map(mapJob)
    return { campaignCounts, activeJobs: summary.activeJobs ?? recentJobs.filter((job) => job.status === "Running" || job.status === "Queued").length, failedJobs: summary.failedJobs ?? summary.failedJobCount, needsReview: summary.needsReview ?? summary.needsReviewCount, storageUsedBytes: summary.storageUsedBytes ?? 0, recentCampaigns: mappedCampaigns.slice(0, 5), recentJobs } satisfies DashboardSummary
  },
  campaigns: async (includeArchived = false) => (await data(http.get<ApiCampaignSummary[]>("/campaigns", { params: { includeArchived } }))).map(mapSummary),
  campaign: async (id: string) => {
    const [campaign, plans, latestAnalysis] = await Promise.all([fetchCampaignRaw(id), data(http.get<ApiEditPlan[]>(`/campaigns/${id}/edit-plans`)), fetchLatestAnalysis(id)])
    return { id: campaign.id, name: campaign.name, whopUrl: campaign.whopUrl, campaignType: campaign.campaignType, brand: campaign.brand, category: campaign.category, payout: formatPayout(campaign.payoutAmount, campaign.payoutPerViews, campaign.payoutUnit), payoutAmount: campaign.payoutAmount, payoutPerViews: campaign.payoutPerViews, payoutUnit: campaign.payoutUnit, deadline: campaign.deadline, rawInstructions: campaign.rawInstructions, notes: campaign.notes, status: campaign.status, createdAt: campaign.createdAt, updatedAt: campaign.updatedAt, requirements: (campaign.requirementRevisions ?? []).map(mapRevision), platformProfiles: (campaign.platformProfiles ?? []).map(mapProfile), sources: (campaign.sources ?? []).map(mapSource), documents: (campaign.documents ?? []).map(mapDocument), referenceVideos: (campaign.referenceVideos ?? []).map(mapReference), branding: campaign.branding ?? null, editStyle: campaign.editStyle ?? null, selectedAiMode: latestAnalysis?.mode ?? "Compare", latestAnalysis, editPlans: plans.map(mapEditPlan) } satisfies CampaignDetail
  },
  createCampaign: async (input: CreateCampaignInput) => {
    const campaign = await data(http.post<ApiCampaignDetail>("/campaigns", {
      name: input.name, whopUrl: input.whopUrl || null, campaignType: input.campaignType || "Clipping",
      brand: input.brand || null, category: input.category || null, payoutAmount: input.payoutAmount ?? null,
      payoutPerViews: input.payoutPerViews ?? null, payoutUnit: input.payoutUnit ?? null,
      deadline: input.deadline || null, rawInstructions: input.rawInstructions, notes: input.notes || null,
    }))
    return api.campaign(campaign.id)
  },
  // An omitted field keeps its current value; an explicit null clears it, which is how
  // "no deadline" and a cleared payout are saved.
  updateCampaign: async (id: string, patch: Partial<CreateCampaignInput & { status: string }>) => {
    const current = await fetchCampaignRaw(id)
    const pick = <T,>(next: T | undefined, fallback: T) => (next === undefined ? fallback : next)
    await data(http.put(`/campaigns/${id}`, {
      name: patch.name ?? current.name,
      whopUrl: pick(patch.whopUrl, current.whopUrl) || null,
      campaignType: patch.campaignType ?? current.campaignType,
      brand: pick(patch.brand, current.brand) || null,
      category: pick(patch.category, current.category) || null,
      payoutAmount: pick(patch.payoutAmount, current.payoutAmount) ?? null,
      payoutPerViews: pick(patch.payoutPerViews, current.payoutPerViews) ?? null,
      payoutUnit: pick(patch.payoutUnit, current.payoutUnit) ?? null,
      deadline: pick(patch.deadline, current.deadline) || null,
      notes: pick(patch.notes, current.notes) || null,
      rawInstructions: patch.rawInstructions ?? current.rawInstructions,
      status: patch.status ?? current.status,
    }))
    return api.campaign(id)
  },
  archiveCampaign: (id: string) => data(http.delete<void>(`/campaigns/${id}`)),
  restoreCampaign: async (id: string) => mapSummary(await data(http.post<ApiCampaignSummary>(`/campaigns/${id}/restore`))),
  deleteCampaign: (id: string) => data(http.delete<{ deleted: boolean; workspaceRemoved: boolean; warning?: string }>(`/campaigns/${id}`, { params: { purge: true } })),
  duplicateCampaign: async (id: string) => { const campaign = await data(http.post<ApiCampaignDetail>(`/campaigns/${id}/duplicate`)); return api.campaign(campaign.id) },
  extractRequirements: async (campaignId: string) => mapRevision(await data(http.post<ApiRequirementRevision>(`/campaigns/${campaignId}/extract-requirements`))),
  updateRequirementRevision: async (campaignId: string, revisionId: string, revision: Pick<RequirementRevision, "items">) => mapRevision(await data(http.put<ApiRequirementRevision>(`/campaigns/${campaignId}/requirement-revisions/${revisionId}`, { items: revision.items.map((item) => ({ category: item.category, key: item.key, value: item.value, sourceText: item.sourceText ?? "", confidence: item.confidence ?? 0, needsReview: item.needsReview ?? false })) }))),
  approveRequirements: (campaignId: string, revisionId: string) => data(http.post<{ id: string; version: number; isApproved: boolean; approvedAt: string }>(`/campaigns/${campaignId}/requirement-revisions/${revisionId}/approve`)),
  platformProfile: async (campaignId: string, platform: Platform) => mapProfile(await data(http.get<ApiPlatformProfile>(`/campaigns/${campaignId}/platform-profiles/${platform}`))),
  updatePlatformProfile: async (campaignId: string, platform: Platform, profile: PlatformProfile) => mapProfile(await data(http.put<ApiPlatformProfile>(`/campaigns/${campaignId}/platform-profiles/${platform}`, { enabled: profile.enabled, width: profile.width, height: profile.height, minDurationSeconds: profile.minDurationSeconds, preferredDurationSeconds: profile.preferredDurationSeconds, maxDurationSeconds: profile.maxDurationSeconds, maxFileSizeBytes: profile.maxFileSizeMb == null ? null : Math.round(profile.maxFileSizeMb * 1024 ** 2), captionTemplate: profile.captionTemplate, requiredHashtags: profile.hashtags, requiredMentions: profile.mentions, disclosureText: profile.disclosure, callToAction: profile.cta, burnSubtitles: profile.burnSubtitles ?? true, safeAreaNotes: profile.safeAreaNotes ?? "", complianceChecklist: profile.complianceChecklist ?? [] }))),
  detectedLinks: async (campaignId: string) => data(http.get<import("@/lib/types").DetectedLink[]>(`/campaigns/${campaignId}/detected-links`)),
  importDetectedLinks: (campaignId: string, urls: string[], target: "source" | "reference", download = true) =>
    data(http.post<{ added: number; skipped: number; queued: number; errors: string[] }>(`/campaigns/${campaignId}/detected-links/import`, { urls, target, confirmedPermission: true, download })),
  campaignDocuments: async (campaignId: string) => (await data(http.get<ApiCampaignDocument[]>(`/campaigns/${campaignId}/documents`))).map(mapDocument),
  // A brief published as a web page rather than sent as a file. The server reads the markup, not a
  // screenshot, so every link keeps the address it was published with.
  fetchBriefPage: async (campaignId: string, url: string) => {
    const response = await data(http.post<{ document: ApiCampaignDocument; warning?: string | null }>(`/campaigns/${campaignId}/documents/fetch`, { url }, { timeout: 45_000 }))
    return { document: mapDocument(response.document), warning: response.warning ?? null }
  },
  uploadCampaignDocument: async (campaignId: string, file: File, onProgress?: (percent: number) => void) => {
    if (file.size > MAX_DOCUMENT_BYTES) throw new ApiError(`“${file.name}” is larger than the ${MAX_DOCUMENT_BYTES / 1024 ** 2} MB brief upload limit.`)
    const response = await data(http.post<{ document: ApiCampaignDocument; warning?: string | null }>(`/campaigns/${campaignId}/documents`, file, {
      params: { fileName: file.name }, headers: { "Content-Type": "application/octet-stream" }, timeout: 0,
      onUploadProgress: (event) => onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : 0),
    }))
    return { document: mapDocument(response.document), warning: response.warning ?? null }
  },
  updateCampaignDocument: async (campaignId: string, documentId: string, includeInExtraction: boolean) =>
    mapDocument(await data(http.put<ApiCampaignDocument>(`/campaigns/${campaignId}/documents/${documentId}`, { includeInExtraction }))),
  deleteCampaignDocument: (campaignId: string, documentId: string) => data(http.delete<void>(`/campaigns/${campaignId}/documents/${documentId}`)),
  uploadCampaignLogo: async (campaignId: string, file: File, onProgress?: (percent: number) => void) => {
    if (file.size > MAX_LOGO_BYTES) throw new ApiError(`“${file.name}” is larger than the ${MAX_LOGO_BYTES / 1024 ** 2} MB logo upload limit.`)
    return data(http.post<CampaignBranding>(`/campaigns/${campaignId}/branding/logo`, file, {
      params: { fileName: file.name }, headers: { "Content-Type": "application/octet-stream" }, timeout: 0,
      onUploadProgress: (event) => onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : 0),
    }))
  },
  updateCampaignBranding: (campaignId: string, branding: Pick<CampaignBranding, "position" | "widthFraction" | "marginFraction" | "opacity" | "enabled">) =>
    data(http.put<CampaignBranding>(`/campaigns/${campaignId}/branding`, branding)),
  deleteCampaignLogo: (campaignId: string) => data(http.delete<void>(`/campaigns/${campaignId}/branding/logo`)),
  campaignEditStyle: (campaignId: string) => data(http.get<CampaignEditStyle>(`/campaigns/${campaignId}/edit-style`)),
  updateCampaignEditStyle: (campaignId: string, style: CampaignEditStyle) =>
    data(http.put<CampaignEditStyle>(`/campaigns/${campaignId}/edit-style`, style)),
  /** Builds exactly these stories from one episode with the podcast-split edit. */
  importStories: async (campaignId: string, input: { sourceAssetId?: string; url?: string; stories: Array<{ title: string; pieces: Array<{ startSeconds: number; endSeconds: number }> }> }) =>
    mapJob(await data(http.post<ApiJob>(`/campaigns/${campaignId}/stories`, input))),
  /** Re-render one podcast-split clip from its stored story. Pass volumes to override the campaign default for this clip. */
  rerenderClip: async (editPlanId: string, volumes?: { voiceVolume?: number; musicVolume?: number }) =>
    mapJob(await data(http.post<ApiJob>(`/edit-plans/${editPlanId}/rerender`, undefined, { params: volumes }))),
  /** Live-preview info for a clip: its music-free companion video, the song + where it starts, and current volumes. */
  clipPreview: async (editPlanId: string) => data(http.get<{
    campaignId: string; previewRelativePath: string | null; musicAssetId: string | null
    musicStartSeconds: number; voiceVolume: number; musicVolume: number
  }>(`/edit-plans/${editPlanId}/preview`)),
  /** URL that streams a music/sfx file for the in-browser preview mixer. */
  musicFileUrl: (assetId: string) => `${API_BASE_URL}/media-library/assets/${assetId}/file`,
  referenceVideos: async (campaignId: string) => (await data(http.get<ApiReferenceVideo[]>(`/campaigns/${campaignId}/reference-videos`))).map(mapReference),
  addReferenceVideo: async (campaignId: string, input: { url: string; label?: string; notes?: string; isPrimary?: boolean }) => {
    const response = await data(http.post<{ reference: ApiReferenceVideo; job: ApiJob } | ApiReferenceVideo>(`/campaigns/${campaignId}/reference-videos`, { url: input.url, label: input.label || null, notes: input.notes || null, isPrimary: input.isPrimary ?? false }))
    return mapReference("reference" in response ? response.reference : response)
  },
  uploadReferenceVideo: async (campaignId: string, file: File, input: { label?: string; notes?: string; isPrimary?: boolean } = {}, onProgress?: (percent: number) => void) => {
    if (file.size > MAX_REFERENCE_BYTES) throw new ApiError(`“${file.name}” is larger than the ${MAX_REFERENCE_BYTES / 1024 ** 3} GB reference upload limit.`)
    const response = await data(http.post<{ reference: ApiReferenceVideo; job: ApiJob }>(`/campaigns/${campaignId}/reference-videos/upload`, file, {
      params: { fileName: file.name, label: input.label || undefined, notes: input.notes || undefined, isPrimary: input.isPrimary ?? false },
      headers: { "Content-Type": "application/octet-stream" }, timeout: 0,
      onUploadProgress: (event) => onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : 0),
    }))
    return mapReference(response.reference)
  },
  updateReferenceVideo: async (campaignId: string, referenceId: string, patch: { label?: string | null; notes?: string | null; isPrimary: boolean }) =>
    mapReference(await data(http.put<ApiReferenceVideo>(`/campaigns/${campaignId}/reference-videos/${referenceId}`, { label: patch.label ?? null, notes: patch.notes ?? null, isPrimary: patch.isPrimary }))),
  analyzeReferenceVideo: async (campaignId: string, referenceId: string, refresh = false) => {
    const response = await data(http.post<{ reference: ApiReferenceVideo; job: ApiJob }>(`/campaigns/${campaignId}/reference-videos/${referenceId}/analyze`, null, { params: { refresh } }))
    return mapJob(response.job)
  },
  deleteReferenceVideo: (campaignId: string, referenceId: string) => data(http.delete<void>(`/campaigns/${campaignId}/reference-videos/${referenceId}`)),
  deleteSource: (campaignId: string, sourceId: string, deleteFile = false) =>
    data(http.delete<{ deleted: boolean; fileRemoved: boolean; editPlansRemoved: number; analysesRemoved: number }>(`/campaigns/${campaignId}/sources/${sourceId}`, { params: { deleteFile } })),
  localSourceFolder: (campaignId: string) => data(http.get<{ folder: string }>(`/campaigns/${campaignId}/sources/local-folder`)),
  scanLocalSources: (campaignId: string) => data(http.post<{ attached: number; added: number; alreadyKnown: number; folder: string; notes: string[] }>(`/campaigns/${campaignId}/sources/scan-local`)),
  localReferenceFolder: (campaignId: string) => data(http.get<{ folder: string }>(`/campaigns/${campaignId}/reference-videos/local-folder`)),
  scanLocalReferences: (campaignId: string) => data(http.post<{ attached: number; added: number; alreadyKnown: number; folder: string; notes: string[] }>(`/campaigns/${campaignId}/reference-videos/scan-local`)),
  inspectSource: async (campaignId: string, url: string) => { const response = await data(http.post<{ source: ApiSource; job: ApiJob }>(`/campaigns/${campaignId}/sources/inspect`, { url })); return mapSource(response.source) },
  addSource: async (campaignId: string, url: string) => mapSource(await data(http.post<ApiSource>(`/campaigns/${campaignId}/sources`, { url }))),
  downloadSource: async (campaignId: string, sourceAssetId: string) => mapJob(await data(http.post<ApiJob>(`/campaigns/${campaignId}/downloads`, { sourceAssetId }))),
  // Queues the whole download-to-clips pipeline for every source that has no clips yet. One job
  // per source, run one at a time, each VOD deleted before the next is fetched.
  autoRunCampaign: async (campaignId: string, dryRun = false) => {
    const response = await data(http.post<{ queued: ApiJob[]; outstanding: string[]; notInspected: string[]; skipped: number; estimatedBytes: number; freeBytes: number; dryRun: boolean }>(`/campaigns/${campaignId}/auto-run`, { dryRun }))
    return { queued: response.queued.map(mapJob), outstanding: response.outstanding ?? [], notInspected: response.notInspected ?? [], skipped: response.skipped, estimatedBytes: response.estimatedBytes, freeBytes: response.freeBytes, dryRun: response.dryRun }
  },
  // One source through the same download-to-clips pipeline that "Process all sources" runs.
  // The body names only the source: StartSourcePipelineRequest and AutoRunCampaignRequest
  // declare identical defaults for every shared field, so a source queued here runs on
  // exactly the settings it would have got in a bulk run.
  startSourcePipeline: async (campaignId: string, sourceAssetId: string) =>
    (await data(http.post<ApiJob[]>(`/campaigns/${campaignId}/pipelines`, { sourceAssetIds: [sourceAssetId] }))).map(mapJob),
  startAnalysis: async (campaignId: string, sourceAssetId: string, mode: AiMode, platform: Platform, transcript?: string) => { const response = await data(http.post<{ analysisRunId: string; job: ApiJob }>(`/campaigns/${campaignId}/ai-analysis`, { sourceAssetId, mode, platform, transcript: transcript?.trim() || null })); return { id: response.analysisRunId, sourceAssetId, mode, platform, status: response.job.status, createdAt: response.job.createdAt, candidates: [] } satisfies AiAnalysis },
  analysis: async (id: string) => mapAnalysis(await data(http.get<ApiAnalysis>(`/ai-analysis/${id}`))),
  selectHighlight: (analysisId: string, highlightId: string) => data(http.post(`/ai-analysis/${analysisId}/select-highlight/${highlightId}`)),
  createEditPlan: async (campaignId: string, plan: Partial<EditPlan>, isApproved = false) => mapEditPlan(await data(http.post<ApiEditPlan>(`/campaigns/${campaignId}/edit-plans`, { sourceAssetId: plan.sourceAssetId, platform: plan.platform, startSeconds: plan.startSeconds, endSeconds: plan.endSeconds, width: plan.width, height: plan.height, framesPerSecond: plan.fps ?? 30, crf: 20, normalizeAudio: plan.normalizeAudio ?? true, burnSubtitles: plan.subtitleEnabled ?? true, subtitleRelativePath: plan.subtitleRelativePath || null, musicAssetId: plan.musicAssetId || null, musicVolume: plan.musicVolume ?? .12, framing: plan.framing, ctaOverlayText: plan.ctaText ?? plan.overlays?.find((overlay) => overlay.type === "CTA")?.text ?? null, subtitleStyle: plan.subtitleStyle || null, musicDuckingDb: plan.musicDuckingDb ?? -12, soundEffects: plan.soundEffects ?? [], overlays: (plan.overlays ?? []).map((overlay) => ({ text: overlay.text, startSeconds: overlay.atSeconds, endSeconds: overlay.endSeconds ?? overlay.atSeconds + 3, position: overlay.position ?? "Top", fontSize: overlay.fontSize ?? 48, color: overlay.color ?? "white", style: overlay.style ?? "Outline", yFraction: overlay.yFraction ?? null })), outputFileName: `${(plan.name || `${plan.platform ?? "clip"}-clip`).replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.mp4`, isApproved }))),
  renderEditPlan: async (editPlanId: string) => mapJob(await data(http.post<ApiJob>(`/edit-plans/${editPlanId}/renders`))),
  validateRender: async (renderId: string) => mapJob(await data(http.post<ApiJob>(`/renders/${renderId}/validate`))),
  renderedClips: (campaignId: string) => data(http.get<import("@/lib/types").RenderedClip[]>(`/campaigns/${campaignId}/outputs`)),
  revealOutput: (campaignId: string, path: string) => data(http.post<{ revealed: boolean; folder: string | null }>(`/campaigns/${campaignId}/outputs/reveal`, null, { params: { path } })),
  exportCampaign: (campaignId: string) => data(http.post<{ folderRelativePath: string; summaryRelativePath: string }>(`/campaigns/${campaignId}/exports`)),
  // The server caps this list; without a limit it silently truncates and the pager would then
  // claim the last page is the last job. Keep the default in step with JOB_HISTORY_LIMIT.
  jobs: async (limit = 200) => (await data(http.get<ApiJob[]>("/jobs", { params: { limit } }))).map(mapJob),
  job: async (id: string) => mapJob(await data(http.get<ApiJob>(`/jobs/${id}`))),
  cancelJob: async (id: string) => mapJob(await data(http.post<ApiJob>(`/jobs/${id}/cancel`))),
  retryJob: async (id: string) => mapJob(await data(http.post<ApiJob>(`/jobs/${id}/retry`))),
  settings: async () => mapSettings(await data(http.get<ApiSettings>("/settings"))),
  updateSettings: async (settings: AppSettings) => { await data(http.put("/settings", { workspaceRoot: settings.workspacePath, ytDlpPath: settings.ytDlpPath, ffmpegPath: settings.ffmpegPath, ffprobePath: settings.ffprobePath, claudePath: settings.claudePath, codexPath: settings.codexPath, processTimeoutMinutes: settings.aiTimeoutMinutes, defaultAiMode: settings.defaultAiMode, maxConcurrentMediaJobs: settings.maxConcurrentMediaJobs, requireEditApproval: settings.requireEditApproval, preferredVideoQuality: settings.preferredVideoQuality, cookiesFromBrowser: settings.cookiesFromBrowser || null, cookiesFilePath: settings.cookiesFilePath || null, jsRuntime: settings.jsRuntime || null })); return settings },
  orphanedCampaignFolders: () => data(http.get<import("@/lib/types").OrphanedCampaignFolder[]>("/system/orphaned-campaign-folders")),
  deleteOrphanedCampaignFolder: (folderName: string) => data(http.delete<{ deleted: boolean }>(`/system/orphaned-campaign-folders/${folderName}`)),
  dependencies: async () => (await data(http.get<Array<{ name: string; configuredPath: string; available: boolean; version?: string | null; error?: string | null }>>("/system/dependencies"))).map((item) => ({ name: item.name, path: item.configuredPath, available: item.available, version: item.version, detail: item.error } satisfies SystemDependency)),
  aiProviders: async () => (await data(http.get<Array<{ name: string; configuredPath: string; modes: string[] }>>("/ai/providers"))).map((item) => ({ provider: item.name, available: Boolean(item.configuredPath), path: item.configuredPath } as AiProviderStatus)),
  mediaLocations: async () => (await data(http.get<ApiMediaLocation[]>("/media-library/locations"))).map((location) => ({ id: location.id, path: location.path, type: location.kind, assetCount: undefined, lastScannedAt: location.createdAt } satisfies MediaLocation)),
  addMediaLocation: async (path: string, type: string) => { const kind = type === "SoundEffect" ? "SoundEffect" : "Music"; const location = await data(http.post<ApiMediaLocation>("/media-library/locations", { path, kind })); return { id: location.id, path: location.path, type: location.kind, assetCount: undefined, lastScannedAt: location.createdAt } satisfies MediaLocation },
  mediaAssets: async () => fetchMediaAssets(),
  updateMediaAsset: async (id: string, patch: Partial<MediaAsset>) => { const current = (await fetchMediaAssets()).find((asset) => asset.id === id); if (!current) throw new ApiError("Audio asset was not found.", 404); const updated = await data(http.put<ApiMediaAsset>(`/media-library/assets/${id}`, { tags: patch.tags ?? current.tags, mood: patch.mood ?? current.mood, energy: patch.energy ?? current.energy, genre: patch.genre ?? current.genre, bpm: patch.bpm ?? current.bpm, favorite: patch.favorite ?? current.favorite, licenseNotes: patch.licenseNotes ?? current.licenseNotes })); return mapMediaAsset(updated) },
  scanMediaLibrary: async () => { const result = await data(http.post<{ indexed: number }>("/media-library/scan")); return { id: `scan-${Date.now()}`, type: "MediaScan", status: "Completed", progress: 100, message: `${result.indexed} assets indexed`, createdAt: new Date().toISOString() } satisfies Job },
  publishingGuides: () => data(http.get<PlatformGuide[]>("/publishing/platforms")),
  publishingGuide: (platform: PublishingPlatform) => data(http.get<PlatformGuide>(`/publishing/platforms/${platform}`)),
  publishingSession: () => getPublishingSession(),
  accountKits: (campaignId: string) => data(http.get<AccountKit[]>(`/campaigns/${campaignId}/publishing/account-kits`)),
  accountKit: (campaignId: string, platform: PublishingPlatform) => data(http.get<AccountKit>(`/campaigns/${campaignId}/publishing/account-kits/${platform}`)),
  updateAccountKit: (campaignId: string, platform: PublishingPlatform, fields: Record<string, string>) =>
    publishingWrite((headers) => http.put<AccountKit>(`/campaigns/${campaignId}/publishing/account-kits/${platform}`, { fields }, { headers })),
  regenerateAccountKitIdentity: (campaignId: string, platform: PublishingPlatform) =>
    publishingWrite((headers) => http.post<AccountKit>(`/campaigns/${campaignId}/publishing/account-kits/${platform}/regenerate-identity`, null, { headers })),
  publishingConnections: () => data(http.get<PublishingConnectionStatus[]>("/publishing/connections")),
  publishingConnection: (platform: PublishingPlatform) => data(http.get<PublishingConnectionStatus>(`/publishing/connections/${platform}`)),
  updatePublishingConnection: (platform: PublishingPlatform, input: PublishingConnectionInput) =>
    publishingWrite((headers) => http.put<PublishingConnectionStatus>(`/publishing/connections/${platform}`, input, { headers })),
  disconnectPublishingConnection: (platform: PublishingPlatform) => publishingWrite((headers) => http.delete<void>(`/publishing/connections/${platform}`, { headers })),
  validatePublishingConnection: (platform: PublishingPlatform) => publishingWrite((headers) => http.post<PublishingConnectionStatus>(`/publishing/connections/${platform}/validate`, null, { headers })),
  startYouTubeOAuth: () => publishingWrite((headers) => http.post<YouTubeOAuthStart>("/publishing/connections/YouTubeShorts/oauth/start", {}, { headers })),
  publishingJobs: (filters?: { campaignId?: string; platform?: PublishingPlatform; status?: PublishStatus }) =>
    data(http.get<PublishJob[]>("/publishing/jobs", { params: filters })),
  publishingJob: (id: string) => data(http.get<PublishJob>(`/publishing/jobs/${id}`)),
  createPublishingJob: (campaignId: string, input: CreatePublishJobInput) =>
    publishingWrite((headers) => http.post<PublishJob>(`/campaigns/${campaignId}/publishing/jobs`, input, { headers })),
  cancelPublishingJob: (id: string) => publishingWrite((headers) => http.post<PublishJob>(`/publishing/jobs/${id}/cancel`, null, { headers })),
  confirmInstagramPublishingJob: (id: string, idempotencyKey: string) =>
    publishingWrite((headers) => http.post<PublishJob>(`/publishing/jobs/${id}/confirm-instagram`, { confirmed: true, idempotencyKey }, { headers })),
  completeManualPublishingJob: (id: string, postUrl: string) =>
    publishingWrite((headers) => http.post<PublishJob>(`/publishing/jobs/${id}/complete-manual`, { confirmed: true, postUrl }, { headers })),
}

/** Direct download URL for the TikTok handoff ZIP. The endpoint never contains credentials. */
export function manualPublishingPackageUrl(jobId: string) {
  return `${API_BASE_URL}/publishing/jobs/${encodeURIComponent(jobId)}/manual-package`
}

export function getErrorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong." }
