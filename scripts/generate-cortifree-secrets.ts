import crypto from "node:crypto";

function secret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

const values = {
  CORTIFREE_BACKEND_SECRET: secret(48),
  CRON_SECRET: secret(32),
  CORTIFREE_ADMIN_TOKEN: secret(32),
};

console.log("# Copy these values into the appropriate provider secret stores.");
console.log("# They are generated locally and are not persisted by this script.\n");
for (const [key, value] of Object.entries(values)) {
  console.log(`${key}=${value}`);
}
