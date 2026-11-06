function req(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`Missing env ${name} (see .env.example)`);
  return v;
}

const env = process.env;
const prod = env.NODE_ENV === 'production';

export const config = {
  port: Number(env.PORT || 4100),
  mongoUri: req('MONGO_URI', 'mongodb://127.0.0.1:27017/seedhaprint'),
  jwtSecret: req('JWT_SECRET', prod ? undefined : 'dev-only-secret'),
  // The only place these addresses live. Production refuses to start without them,
  // so QR codes can never silently point at localhost.
  webUrl: req('WEB_URL', prod ? undefined : 'http://localhost:3100').replace(/\/$/, ''),
  apiUrl: req('API_URL', prod ? undefined : 'http://localhost:4100').replace(/\/$/, ''),
  /** Encrypts each shop's Razorpay secrets at rest. */
  encryptionKey: req('ENCRYPTION_KEY', prod ? undefined : 'dev-only-encryption-key'),
  razorpayApiUrl: (env.RAZORPAY_API_URL || 'https://api.razorpay.com/v1').replace(/\/$/, ''),
  /** Fake checkout for shops without Razorpay. Prints for free, so production needs an explicit opt-in. */
  allowTestCheckout: env.ALLOW_TEST_CHECKOUT ? env.ALLOW_TEST_CHECKOUT === 'true' : !prod,
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
