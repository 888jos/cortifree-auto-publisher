import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

function cortiFreeTable() {
  return defineTable({
    legacyId: v.string(),
    workspaceId: v.literal("cortifree"),
    data: v.any(),
    migratedAt: v.number(),
    storageId: v.optional(v.id("_storage")),
    storageField: v.optional(v.string()),
  })
    .index("by_legacy_id", ["legacyId"])
    .index("by_workspace", ["workspaceId"]);
}

export default defineSchema({
  personas: cortiFreeTable(),
  accounts: cortiFreeTable(),
  assets: cortiFreeTable(),
  content_formats: cortiFreeTable(),
  carousel_ideas: cortiFreeTable(),
  carousels: cortiFreeTable(),
  carousel_slides: cortiFreeTable(),
  image_generation_jobs: cortiFreeTable(),
  render_jobs: cortiFreeTable(),
  publish_jobs: cortiFreeTable(),
  platform_posts: cortiFreeTable(),
  analytics_snapshots: cortiFreeTable(),
  template_performance: cortiFreeTable(),
  topic_performance: cortiFreeTable(),
  persona_performance: cortiFreeTable(),
  system_logs: cortiFreeTable(),
  ai_usage_logs: cortiFreeTable(),
  asset_usage_history: cortiFreeTable(),
  visual_references: cortiFreeTable(),
  persona_scene_templates: cortiFreeTable(),
  image_generation_usage: cortiFreeTable(),
});
