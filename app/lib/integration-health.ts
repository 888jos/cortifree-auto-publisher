export type LocalIntegrationHealth = {
  runtime: {
    nodeEnv: string;
    dataBackend: string;
    workerOpsRefreshMs: number;
  };
  telegram: {
    configured: boolean;
    botTokenPresent: boolean;
    chatIdPresent: boolean;
    webhookSecretPresent: boolean;
  };
  uploadPost: {
    configured: boolean;
    apiKeyPresent: boolean;
    profilesConfigured: boolean;
    profileCount: number;
  };
  googleOAuth: {
    configured: boolean;
    clientIdPresent: boolean;
    clientSecretPresent: boolean;
    redirectUriPresent: boolean;
    tokenEncryptionKeyPresent: boolean;
  };
  safety: {
    dryRun: boolean;
    requireApproval: boolean;
    autoApprove: boolean;
    autoPublish: boolean;
  };
};

function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function getLocalIntegrationHealth(): LocalIntegrationHealth {
  const profiles = (process.env.CORTIFREE_UPLOAD_POST_PROFILES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const telegram = {
    botTokenPresent: present("TELEGRAM_BOT_TOKEN"),
    chatIdPresent: present("TELEGRAM_CHAT_ID"),
    webhookSecretPresent: present("TELEGRAM_WEBHOOK_SECRET"),
  };
  const uploadPost = {
    apiKeyPresent: present("UPLOAD_POST_API_KEY"),
    profilesConfigured: profiles.length > 0,
    profileCount: profiles.length,
  };
  const googleOAuth = {
    clientIdPresent: present("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecretPresent: present("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirectUriPresent: present("GOOGLE_OAUTH_REDIRECT_URI"),
    tokenEncryptionKeyPresent: present("TOKEN_ENCRYPTION_KEY"),
  };

  return {
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      dataBackend: process.env.DATA_BACKEND?.trim() || "supabase",
      workerOpsRefreshMs: Math.max(300_000, Number(process.env.WORKER_OPS_REFRESH_MS ?? 3_600_000)),
    },
    telegram: {
      ...telegram,
      configured: telegram.botTokenPresent && telegram.chatIdPresent && telegram.webhookSecretPresent,
    },
    uploadPost: {
      ...uploadPost,
      configured: uploadPost.apiKeyPresent && uploadPost.profilesConfigured,
    },
    googleOAuth: {
      ...googleOAuth,
      configured: googleOAuth.clientIdPresent
        && googleOAuth.clientSecretPresent
        && googleOAuth.redirectUriPresent
        && googleOAuth.tokenEncryptionKeyPresent,
    },
    safety: {
      dryRun: process.env.DRY_RUN !== "false",
      requireApproval: process.env.REQUIRE_APPROVAL !== "false",
      autoApprove: process.env.AUTONOMY_AUTO_APPROVE === "true",
      autoPublish: process.env.AUTONOMY_AUTO_PUBLISH === "true",
    },
  };
}

export function formatIntegrationHealth(health = getLocalIntegrationHealth()) {
  const icon = (value: boolean) => value ? "✅" : "❌";
  return [
    "🔌 CortiFree integrations",
    `Telegram: ${icon(health.telegram.configured)} token ${icon(health.telegram.botTokenPresent)} · chat ${icon(health.telegram.chatIdPresent)} · webhook secret ${icon(health.telegram.webhookSecretPresent)}`,
    `Upload-Post: ${icon(health.uploadPost.configured)} API key ${icon(health.uploadPost.apiKeyPresent)} · profiles ${health.uploadPost.profileCount}`,
    `Google OAuth: ${icon(health.googleOAuth.configured)} client ${icon(health.googleOAuth.clientIdPresent)} · secret ${icon(health.googleOAuth.clientSecretPresent)} · redirect ${icon(health.googleOAuth.redirectUriPresent)} · encryption ${icon(health.googleOAuth.tokenEncryptionKeyPresent)}`,
    `Safety: dry-run ${health.safety.dryRun ? "ON" : "OFF"} · approval ${health.safety.requireApproval ? "REQUIRED" : "NOT REQUIRED"} · auto-approve ${health.safety.autoApprove ? "ON" : "OFF"} · auto-publish ${health.safety.autoPublish ? "ON" : "OFF"}`,
    `Backend: ${health.runtime.dataBackend} · ops refresh: ${Math.round(health.runtime.workerOpsRefreshMs / 60_000)} min`,
  ].join("\n");
}
