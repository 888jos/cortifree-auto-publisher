import { dataBackend } from '../lib/data-backend';
import {
  getUploadPostPostAnalytics,
  getUploadPostStatus,
  normalizeUploadPostAnalytics,
  normalizeUploadPostResults,
} from '../../app/lib/upload-post';
import { loadRuntimeEditorial, autonomyRuleValue } from '../runtime/config';
import { fillHook, type EditorialHook, type EditorialTopic } from './selection';

type Row = Record<string, unknown>;
type Platform = 'tiktok' | 'instagram';

const milestones = [
  { label: '1h', hours: 1, grace: 2 },
  { label: '6h', hours: 6, grace: 2 },
  { label: '24h', hours: 24, grace: 4 },
  { label: '72h', hours: 72, grace: 8 },
] as const;

async function rows(resource: string): Promise<Row[]> {
  const response = await dataBackend(resource);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as Row[];
}
async function patch(resource: string, body: Record<string, unknown>) {
  const response = await dataBackend(resource, { method: 'PATCH', body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
}
async function upsert(resource: string, body: unknown) {
  const response = await dataBackend(resource, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
}
function n(value: unknown) {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function median(values: number[]) {
  const sorted = [...values].sort((a,b)=>a-b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
}
function performanceScore(metrics: ReturnType<typeof normalizeUploadPostAnalytics>) {
  return metrics.views + metrics.likes * 2 + metrics.comments * 5 + metrics.shares * 10
    + Math.max(metrics.saves, metrics.favorites) * 10;
}
function platformFor(job: Row): Platform {
  return String(job.platform ?? '').toLowerCase() === 'instagram' ? 'instagram' : 'tiktok';
}
function iso(value: unknown) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export async function refreshPublishStatuses(limit = 100) {
  const jobs = (await rows(`publish_jobs?status=in.(PUBLISHING,SCHEDULED)&order=created_at.asc&limit=${limit}`)).slice(0, limit);
  const report: Row[] = [];
  for (const job of jobs) {
    try {
      const provider = await getUploadPostStatus({
        requestId: String(job.provider_request_id ?? ''),
        jobId: String(job.provider_job_id ?? ''),
      });
      const statusText = String(provider.status ?? '').toLowerCase();
      const results = normalizeUploadPostResults(provider);
      const result = results.find((entry) => entry.platform === job.platform) ?? results[0];
      const failed = result?.success === false || ['failed','not_found'].includes(statusText);
      const published = statusText === 'completed';
      const status = failed ? 'FAILED' : published ? 'PUBLISHED' : String(job.status);
      const postUrl = typeof result?.post_url === 'string'
        ? result.post_url
        : typeof result?.url === 'string'
          ? result.url
          : null;
      const update: Row = { status, post_url: postUrl, updated_at: new Date().toISOString() };
      if (published && !job.published_at) update.published_at = new Date().toISOString();
      if (failed) update.last_error = String(result?.error ?? provider.error ?? 'Upload-Post publish failed');
      await patch(`publish_jobs?id=eq.${encodeURIComponent(String(job.id))}`, update);
      if (job.carousel_id) {
        await patch(`carousels?id=eq.${encodeURIComponent(String(job.carousel_id))}`, {
          status,
          review_status: published ? 'PUBLISHED' : failed ? 'FAILED' : undefined,
          updated_at: new Date().toISOString(),
        });
      }
      report.push({ id: job.id, status, post_url: postUrl });
    } catch (error) {
      report.push({ id: job.id, status: job.status, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

function dueMilestone(ageHours: number, existing: Set<string>) {
  return milestones.find((milestone) =>
    ageHours >= milestone.hours
    && ageHours <= milestone.hours + milestone.grace
    && !existing.has(milestone.label)
  );
}

async function syncContentPerformance(job: Row, label: string, metrics: ReturnType<typeof normalizeUploadPostAnalytics>, capturedAt: string) {
  const carouselId = String(job.carousel_id ?? '');
  if (!carouselId) return;
  const carousel = (await rows(`carousels?id=eq.${encodeURIComponent(carouselId)}&select=id,account_id,persona_id,format_id,pillar_id,topic_id,hook_id,cta_id&limit=1`))[0];
  if (!carousel) return;
  const patchRow: Row = {
    workspace_id: 'cortifree',
    carousel_id: carouselId,
    account_id: carousel.account_id ?? job.account_id ?? null,
    persona_id: carousel.persona_id ?? null,
    format_id: carousel.format_id ?? null,
    pillar_id: carousel.pillar_id ?? null,
    topic_id: carousel.topic_id ?? null,
    hook_id: carousel.hook_id ?? null,
    cta_id: carousel.cta_id ?? null,
    platform: job.platform ?? metrics.platform,
    posted_at: job.published_at ?? capturedAt,
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    saves: Math.max(metrics.saves, metrics.favorites),
    profile_visits: metrics.profileViews,
    completion_rate: metrics.fullVideoWatchedRate,
    engagement_rate: metrics.views > 0 ? (metrics.likes + metrics.comments + metrics.shares + Math.max(metrics.saves, metrics.favorites)) / metrics.views : 0,
    save_rate: metrics.views > 0 ? Math.max(metrics.saves, metrics.favorites) / metrics.views : 0,
    share_rate: metrics.views > 0 ? metrics.shares / metrics.views : 0,
    performance_score: performanceScore(metrics),
    source_post_url: metrics.postUrl ?? job.post_url ?? null,
    synced_at: capturedAt,
  };
  if (label === '1h') patchRow.views_1h = metrics.views;
  if (label === '24h') patchRow.views_24h = metrics.views;
  if (label === '72h') patchRow.views_72h = metrics.views;
  await upsert('content_performance?on_conflict=carousel_id', patchRow);
}

export async function refreshPostAnalytics(limit = 100) {
  const { autonomyRules } = await loadRuntimeEditorial();
  const winnerMultiple = autonomyRuleValue(autonomyRules, 'winner_threshold_vs_account_median', 2);
  const jobs = (await rows(`publish_jobs?status=eq.PUBLISHED&provider_request_id=not.is.null&order=created_at.desc&limit=${Math.max(limit, 100)}`))
    .filter((job) => job.provider_request_id)
    .slice(0, limit);
  const created: Row[] = [];

  for (const job of jobs) {
    const carouselId = String(job.carousel_id ?? '');
    if (!carouselId) continue;
    const publishedAt = iso(job.published_at ?? job.updated_at ?? job.created_at);
    if (!publishedAt) continue;
    const ageHours = Math.max(0, (Date.now() - Date.parse(publishedAt)) / 3_600_000);
    const prior = await rows(`analytics_snapshots?publish_job_id=eq.${encodeURIComponent(String(job.id))}&select=snapshot_label&limit=20`);
    const existing = new Set(prior.map((row) => String(row.snapshot_label ?? '')).filter(Boolean));
    const milestone = dueMilestone(ageHours, existing);
    if (!milestone) continue;

    try {
      const platform = platformFor(job);
      const analytics = await getUploadPostPostAnalytics(String(job.provider_request_id), platform);
      const metrics = normalizeUploadPostAnalytics(analytics, platform);
      const capturedAt = new Date().toISOString();
      const row = {
        id: `AN_JOB_${String(job.id)}_${milestone.label}`,
        workspace_id: 'cortifree',
        content_kind: metrics.mediaType === 'video' ? 'video' : 'carousel',
        carousel_id: carouselId,
        account_id: job.account_id ?? null,
        publish_job_id: Number(job.id),
        provider_request_id: job.provider_request_id,
        platform_post_id: metrics.platformPostId,
        profile_username: metrics.profileUsername,
        platform,
        post_url: metrics.postUrl ?? job.post_url ?? null,
        media_type: metrics.mediaType,
        published_at: publishedAt,
        captured_at: capturedAt,
        snapshot_label: milestone.label,
        age_hours: ageHours,
        views: metrics.views,
        reach: metrics.reach,
        impressions: metrics.impressions,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        saves: metrics.saves,
        favorites: metrics.favorites,
        profile_views: metrics.profileViews,
        new_followers: metrics.newFollowers,
        watch_time_minutes: metrics.watchTimeMinutes,
        average_view_duration_seconds: metrics.averageViewDurationSeconds,
        average_view_percentage: metrics.averageViewPercentage,
        full_video_watched_rate: metrics.fullVideoWatchedRate,
        total_time_watched: metrics.totalTimeWatched,
        performance_score: performanceScore(metrics),
        retention: metrics.retention,
        impression_sources: metrics.impressionSources,
        audience_types: metrics.audienceTypes,
        raw: analytics,
      };
      await upsert('analytics_snapshots?on_conflict=id', row);
      await syncContentPerformance(job, milestone.label, metrics, capturedAt);
      created.push(row);
    } catch (error) {
      created.push({ carousel_id: carouselId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const valid = (await rows('analytics_snapshots?order=captured_at.desc&limit=2000'))
    .filter((row) => row.account_id && Number.isFinite(Number(row.views)));
  const medians = new Map<string, number>();
  for (const accountId of new Set(valid.map((row) => String(row.account_id)))) {
    const latestByCarousel = new Map<string, Row>();
    for (const row of valid.filter((entry) => String(entry.account_id) === accountId)) {
      if (!latestByCarousel.has(String(row.carousel_id))) latestByCarousel.set(String(row.carousel_id), row);
    }
    medians.set(accountId, median([...latestByCarousel.values()].map((row) => n(row.views))));
  }

  const winnerRows: Row[] = [];
  for (const row of created.filter((entry) => entry.carousel_id && entry.account_id && !entry.error)) {
    const base = medians.get(String(row.account_id)) ?? 0;
    const isWinner = base > 0 && n(row.views) >= winnerMultiple * base;
    if (!isWinner) continue;
    const carousel = (await rows(`carousels?id=eq.${encodeURIComponent(String(row.carousel_id))}&limit=1`))[0];
    if (!carousel || carousel.is_winner === true) continue;
    await patch(`carousels?id=eq.${encodeURIComponent(String(row.carousel_id))}`, {
      is_winner: true,
      performance_score: row.performance_score,
      winner_at: new Date().toISOString(),
    });
    winnerRows.push({
      carousel_id: row.carousel_id,
      views: row.views,
      account_median: base,
      multiple: n(row.views) / base,
    });
  }
  return { snapshots: created, winners: winnerRows };
}

export async function queueWinnerVariants() {
  const { topics, hooks, autonomyRules } = await loadRuntimeEditorial();
  const count = autonomyRuleValue(autonomyRules, 'winner_variants_to_queue', 3);
  const winners = (await rows('carousels?is_winner=eq.true&order=winner_at.desc&limit=20')).slice(0,20);
  const runtimeTopics = topics as unknown as EditorialTopic[];
  const runtimeHooks = (hooks as unknown as EditorialHook[]).filter((hook) => hook.active !== false);
  const queued: Row[] = [];
  for (const winner of winners) {
    const existing = await rows(`carousel_ideas?source_winner_id=eq.${encodeURIComponent(String(winner.id))}&limit=20`);
    if (existing.length >= count) continue;
    const topic = runtimeTopics.find((item) => item.topic === winner.topic && item.pillar_id === winner.pillar_id)
      ?? runtimeTopics.find((item) => item.topic === winner.topic);
    if (!topic) continue;
    const compatible = runtimeHooks.filter((hook) =>
      String(hook.compatible_formats).split('|').map((value) => value.trim()).includes(String(winner.content_type)),
    );
    for (const hook of compatible.slice(0, Math.max(0, count - existing.length))) {
      const id = `CF_WIN_${String(winner.id).replace(/[^A-Z0-9]/gi,'')}_${hook.hook_id}`;
      const idea = {
        id,
        workspace_id: 'cortifree',
        account_id: winner.account_id,
        persona_id: winner.persona_id,
        pillar_id: topic.pillar_id,
        content_type: winner.content_type,
        topic_id: topic.topic_id,
        topic: topic.topic,
        angle: `${topic.angle} — winner variation`,
        hook_id: hook.hook_id,
        hook_formula: hook.formula,
        final_hook: fillHook(hook.formula, topic),
        cta_id: null,
        cta_text: 'Save this for later.',
        strategy: 'WINNER_VARIANT',
        status: 'QUEUED',
        source_winner_id: winner.id,
        created_at: new Date().toISOString(),
      };
      await upsert('carousel_ideas?on_conflict=id', idea);
      queued.push(idea);
    }
  }
  return queued;
}
