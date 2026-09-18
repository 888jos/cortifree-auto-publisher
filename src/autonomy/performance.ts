import { dataBackend } from '../lib/data-backend';
import { getUploadPostPostAnalytics, getUploadPostStatus, normalizeUploadPostResults } from '../../app/lib/upload-post';
import { loadEditorialSnapshot, autonomyValue } from '../editorial/snapshot';
import { fillHook, type EditorialHook, type EditorialTopic } from './selection';

type Row = Record<string, unknown>;
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
  const response = await dataBackend(resource, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
}
function n(value: unknown) { const x = Number(value ?? 0); return Number.isFinite(x) ? x : 0; }
function median(values: number[]) {
  const sorted = [...values].sort((a,b)=>a-b); if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length/2); return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
}
function metricScore(m: Record<string, unknown>) {
  return n(m.views ?? m.impressions ?? m.reach) + n(m.likes)*2 + n(m.comments)*5 + n(m.shares)*10 + n(m.saves)*10;
}
function platformAnalytics(payload: Record<string, unknown>, platform: string) {
  const platforms = payload.platforms && typeof payload.platforms === 'object' ? payload.platforms as Record<string, any> : {};
  const entry = platforms[platform] ?? Object.values(platforms)[0] ?? {};
  return (entry?.post_metrics && typeof entry.post_metrics === 'object' ? entry.post_metrics : {}) as Record<string, unknown>;
}

export async function refreshPublishStatuses(limit = 40) {
  const jobs = (await rows(`publish_jobs?status=in.(PUBLISHING,SCHEDULED)&order=created_at.asc&limit=${limit}`)).slice(0, limit);
  const report: Row[] = [];
  for (const job of jobs) {
    try {
      const provider = await getUploadPostStatus({ requestId: String(job.provider_request_id ?? ''), jobId: String(job.provider_job_id ?? '') });
      const statusText = String(provider.status ?? '').toLowerCase();
      const results = normalizeUploadPostResults(provider);
      const result = results.find((x) => x.platform === job.platform) ?? results[0];
      const failed = result?.success === false || ['failed','not_found'].includes(statusText);
      const status = failed ? 'FAILED' : statusText === 'completed' ? 'PUBLISHED' : String(job.status);
      const postUrl = typeof result?.post_url === 'string' ? result.post_url : typeof result?.url === 'string' ? result.url : null;
      await patch(`publish_jobs?id=eq.${encodeURIComponent(String(job.id))}`, { status, post_url: postUrl, updated_at: new Date().toISOString() });
      if (job.carousel_id) await patch(`carousels?id=eq.${encodeURIComponent(String(job.carousel_id))}`, { status, updated_at: new Date().toISOString() });
      report.push({ id: job.id, status });
    } catch (error) { report.push({ id: job.id, status: job.status, error: error instanceof Error ? error.message : String(error) }); }
  }
  return report;
}

export async function refreshPostAnalytics(limit = 40) {
  const snapshot = loadEditorialSnapshot();
  const winnerMultiple = autonomyValue(snapshot, 'winner_threshold_vs_account_median', 2);
  const jobs = (await rows(`publish_jobs?status=eq.PUBLISHED&order=created_at.desc&limit=${Math.max(limit, 100)}`)).filter((job) => job.provider_request_id).slice(0, limit);
  const created: Row[] = [];
  for (const job of jobs) {
    const carouselId = String(job.carousel_id ?? '');
    if (!carouselId) continue;
    const previous = (await rows(`analytics_snapshots?carousel_id=eq.${encodeURIComponent(carouselId)}&order=captured_at.desc&limit=1`))[0];
    if (previous?.captured_at && Date.now() - Date.parse(String(previous.captured_at)) < 20 * 3_600_000) continue;
    try {
      const analytics = await getUploadPostPostAnalytics(String(job.provider_request_id), String(job.platform) as 'tiktok' | 'instagram');
      const metrics = platformAnalytics(analytics, String(job.platform));
      const capturedAt = new Date().toISOString();
      const row = {
        id: `AN_${carouselId}_${capturedAt.replace(/[^0-9]/g,'').slice(0,10)}`, workspace_id: 'cortifree',
        carousel_id: carouselId, account_id: job.account_id, platform: job.platform, captured_at: capturedAt,
        views: n(metrics.views ?? metrics.impressions ?? metrics.reach), likes: n(metrics.likes), comments: n(metrics.comments),
        shares: n(metrics.shares), saves: n(metrics.saves ?? metrics.favorites), profile_views: n(metrics.profileViews),
        performance_score: metricScore(metrics), raw: analytics,
      };
      await upsert('analytics_snapshots?on_conflict=id', row);
      created.push(row);
    } catch (error) { created.push({ carousel_id: carouselId, error: error instanceof Error ? error.message : String(error) }); }
  }

  const valid = (await rows('analytics_snapshots?order=captured_at.desc&limit=1000')).filter((r) => r.account_id && Number.isFinite(Number(r.views)));
  const medians = new Map<string, number>();
  for (const accountId of new Set(valid.map((r) => String(r.account_id)))) {
    const latestByCarousel = new Map<string, Row>();
    for (const row of valid.filter((r) => String(r.account_id) === accountId)) if (!latestByCarousel.has(String(row.carousel_id))) latestByCarousel.set(String(row.carousel_id), row);
    medians.set(accountId, median([...latestByCarousel.values()].map((r) => n(r.views))));
  }

  const winnerRows: Row[] = [];
  for (const row of created.filter((r) => r.carousel_id && r.account_id && !r.error)) {
    const base = medians.get(String(row.account_id)) ?? 0;
    const isWinner = base > 0 && n(row.views) >= winnerMultiple * base;
    if (!isWinner) continue;
    const carousel = (await rows(`carousels?id=eq.${encodeURIComponent(String(row.carousel_id))}&limit=1`))[0];
    if (!carousel) continue;
    await patch(`carousels?id=eq.${encodeURIComponent(String(row.carousel_id))}`, { is_winner: true, performance_score: row.performance_score, winner_at: new Date().toISOString() });
    winnerRows.push({ carousel_id: row.carousel_id, views: row.views, account_median: base, multiple: n(row.views)/base });
  }
  return { snapshots: created, winners: winnerRows };
}

export async function queueWinnerVariants() {
  const snapshot = loadEditorialSnapshot();
  const count = autonomyValue(snapshot, 'winner_variants_to_queue', 3);
  const winners = (await rows('carousels?is_winner=eq.true&order=winner_at.desc&limit=20')).slice(0,20);
  const topics = snapshot.tables.content_topics as unknown as EditorialTopic[];
  const hooks = (snapshot.tables.content_hooks as unknown as EditorialHook[]).filter((h) => h.active !== false);
  const queued: Row[] = [];
  for (const winner of winners) {
    const existing = await rows(`carousel_ideas?source_winner_id=eq.${encodeURIComponent(String(winner.id))}&limit=20`);
    if (existing.length >= count) continue;
    const topic = topics.find((t) => t.topic === winner.topic && t.pillar_id === winner.pillar_id) ?? topics.find((t) => t.topic === winner.topic);
    if (!topic) continue;
    const compatible = hooks.filter((h) => String(h.compatible_formats).split('|').map(x=>x.trim()).includes(String(winner.content_type)));
    for (const hook of compatible.slice(0, Math.max(0, count-existing.length))) {
      const id = `CF_WIN_${String(winner.id).replace(/[^A-Z0-9]/gi,'')}_${hook.hook_id}`;
      const idea = {
        id, workspace_id:'cortifree', account_id:winner.account_id, persona_id:winner.persona_id, pillar_id:topic.pillar_id,
        content_type:winner.content_type, topic_id:topic.topic_id, topic:topic.topic, angle:`${topic.angle} — winner variation`,
        hook_id:hook.hook_id, hook_formula:hook.formula, final_hook:fillHook(hook.formula,topic), cta_id:null, cta_text:'Save this for later.',
        strategy:'WINNER_VARIANT', status:'QUEUED', source_winner_id:winner.id, created_at:new Date().toISOString(),
      };
      await upsert('carousel_ideas?on_conflict=id', idea); queued.push(idea);
    }
  }
  return queued;
}
