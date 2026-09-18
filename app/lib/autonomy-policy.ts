export type AutonomyPolicy = {
  topicCooldownDays: number;
  hookCooldownDays: number;
  visualRefCooldownDays: number;
  networkTopicCooldownHours: number;
  networkHookCooldownHours: number;
  networkVisualRefCooldownHours: number;
  personaCacheMin: number;
  personaCacheTarget: number;
  targetReadyBufferDays: number;
  provenRatio: number;
  adjacentRatio: number;
  experimentRatio: number;
};

export const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = {
  topicCooldownDays: 14,
  hookCooldownDays: 7,
  visualRefCooldownDays: 21,
  networkTopicCooldownHours: 48,
  networkHookCooldownHours: 48,
  networkVisualRefCooldownHours: 72,
  personaCacheMin: 12,
  personaCacheTarget: 20,
  targetReadyBufferDays: 3,
  provenRatio: 0.70,
  adjacentRatio: 0.20,
  experimentRatio: 0.10,
};

export function isWithinCooldown(lastUsedAt: string | null | undefined, cooldownMs: number, now = Date.now()) {
  if (!lastUsedAt) return false;
  const timestamp = new Date(lastUsedAt).getTime();
  return Number.isFinite(timestamp) && now - timestamp < cooldownMs;
}

export function noveltyPenalty(lastUsedAt: string | null | undefined, useCount: number | undefined, cooldownDays: number, now = Date.now()) {
  let penalty = Math.min(Math.max(useCount ?? 0, 0), 20) * 1.5;
  if (isWithinCooldown(lastUsedAt, cooldownDays * 86_400_000, now)) penalty += 40;
  return penalty;
}

export function shouldRefillPersonaCache(currentCount: number, policy = DEFAULT_AUTONOMY_POLICY) {
  return currentCount < policy.personaCacheMin;
}

export function personaRefillCount(currentCount: number, policy = DEFAULT_AUTONOMY_POLICY) {
  return shouldRefillPersonaCache(currentCount, policy) ? Math.max(0, policy.personaCacheTarget - currentCount) : 0;
}

export function chooseExplorationBucket(randomValue: number, policy = DEFAULT_AUTONOMY_POLICY): "proven" | "adjacent" | "experiment" {
  if (randomValue < 0 || randomValue >= 1) throw new Error("randomValue must be in [0, 1)");
  if (randomValue < policy.provenRatio) return "proven";
  if (randomValue < policy.provenRatio + policy.adjacentRatio) return "adjacent";
  return "experiment";
}

export function assertNetworkNovelty(input: {
  topicUsedAt?: string | null;
  hookUsedAt?: string | null;
  visualRefUsedAt?: string | null;
  now?: number;
  policy?: AutonomyPolicy;
}) {
  const policy = input.policy ?? DEFAULT_AUTONOMY_POLICY;
  const now = input.now ?? Date.now();
  const reasons: string[] = [];
  if (isWithinCooldown(input.topicUsedAt, policy.networkTopicCooldownHours * 3_600_000, now)) reasons.push("topic_network_cooldown");
  if (isWithinCooldown(input.hookUsedAt, policy.networkHookCooldownHours * 3_600_000, now)) reasons.push("hook_network_cooldown");
  if (isWithinCooldown(input.visualRefUsedAt, policy.networkVisualRefCooldownHours * 3_600_000, now)) reasons.push("visual_ref_network_cooldown");
  return { ok: reasons.length === 0, reasons };
}
