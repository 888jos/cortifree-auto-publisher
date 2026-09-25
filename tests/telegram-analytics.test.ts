import { describe, expect, it } from "vitest";
import { normalizeUploadPostAnalytics } from "../app/lib/upload-post";

describe("Upload-Post analytics normalization", () => {
  it("normalizes TikTok video metrics", () => {
    const result = normalizeUploadPostAnalytics({
      post: { profile_username: "cf_test", media_type: "video" },
      platforms: {
        tiktok: {
          platform_post_id: "123",
          post_url: "https://tiktok.com/test",
          post_metrics: {
            views: 1000,
            likes: 100,
            comments: 10,
            shares: 20,
            favorites: 30,
            profile_views: 12,
            new_followers: 4,
            full_video_watched_rate: 28.5,
            average_time_watched: 6.2,
            total_time_watched: 6200,
            retention: [{ second: 1, rate: 0.9 }],
          },
        },
      },
    }, "tiktok");

    expect(result.views).toBe(1000);
    expect(result.favorites).toBe(30);
    expect(result.averageViewDurationSeconds).toBe(6.2);
    expect(result.fullVideoWatchedRate).toBe(28.5);
    expect(result.platformPostId).toBe("123");
    expect(result.mediaType).toBe("video");
  });
});
