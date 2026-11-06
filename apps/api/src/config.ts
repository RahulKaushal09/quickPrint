function req(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`Missing env ${name} (see .env.example)`);
  return v;
}

const env = process.env;

export const config = {
  port: Number(env.PORT || 4100),
  mongoUri: req('MONGO_URI', 'mongodb://127.0.0.1:27017/quickprint'),
  jwtSecret: req('JWT_SECRET', env.NODE_ENV === 'production' ? undefined : 'dev-only-secret'),
  webUrl: (env.WEB_URL || 'http://localhost:3100').replace(/\/$/, ''),
  apiUrl: (env.API_URL || 'http://localhost:4100').replace(/\/$/, ''),
  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  s3: env.S3_BUCKET
    ? {
        bucket: env.S3_BUCKET,
        region: env.S3_REGION || 'auto',
        endpoint: env.S3_ENDPOINT || undefined,
        accessKeyId: req('S3_ACCESS_KEY_ID'),
        secretAccessKey: req('S3_SECRET_ACCESS_KEY'),
      }
    : null,
  storageDir: env.STORAGE_DIR || new URL('../storage', import.meta.url).pathname,
  fileRetentionHours: Number(env.FILE_RETENTION_HOURS || 24),
  sofficePath: env.SOFFICE_PATH || '',
  /** Unpaid drafts are expired (and their files deleted) after this long. */
  draftTtlMinutes: 60,
  /** A job handed to a PC that hasn't confirmed it within this time goes back to the queue. */
  ackTimeoutSeconds: 45,
};

export const paymentsLive = Boolean(config.razorpay.keyId && config.razorpay.keySecret);
