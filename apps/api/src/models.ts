import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { JOB_STATUSES } from '@seedhaprint/shared';

// ---------------------------------------------------------------- Shop
// One row per print shop. `code` is what the QR points at: WEB_URL/s/<code>.

const sub = { _id: false } as const;
const ratesSchema = new Schema(
  {
    bwPerPage: { type: Number, required: true, default: 200 },
    colorPerPage: { type: Number, required: true, default: 1000 },
    colorEnabled: { type: Boolean, required: true, default: true },
    duplexEnabled: { type: Boolean, required: true, default: true },
  },
  sub,
);
/** Printers allowed for each print type, so a shop can spread work and survive one going down. Empty = the PC's default printer. */
const printersSchema = new Schema(
  {
    bw: { type: [String], default: [] },
    color: { type: [String], default: [] },
    /** Printers allowed to print both sides. Empty = whichever ones Windows reports can do it. */
    duplex: { type: [String], default: [] },
  },
  sub,
);
const cashSchema = new Schema(
  {
    enabled: { type: Boolean, required: true, default: true },
    /** Print cash jobs at once instead of waiting for the shop to accept the money. */
    autoPrint: { type: Boolean, required: true, default: false },
  },
  sub,
);
/** The shop's own Razorpay account. Secrets are encrypted (see secrets.ts) and never loaded unless asked for. */
const razorpaySchema = new Schema(
  {
    keyId: { type: String, default: '' },
    keySecret: { type: String, default: '', select: false },
    webhookSecret: { type: String, default: '', select: false },
    verifiedAt: Date,
    webhookSeenAt: Date,
  },
  sub,
);

const shopSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    area: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true }, // admin switch (e.g. subscription lapsed)
    accepting: { type: Boolean, default: true }, // shop owner's pause button
    rates: { type: ratesSchema, default: () => ({}) },
    printers: { type: printersSchema, default: () => ({}) },
    razorpay: { type: razorpaySchema, default: () => ({}) },
    cash: { type: cashSchema, default: () => ({}) },
  },
  { timestamps: true },
);

// ---------------------------------------------------------------- User
// Admins run the platform; owners see only their own shop.

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'owner'], required: true },
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', index: true },
  },
  { timestamps: true },
);

// ---------------------------------------------------------------- Device
// A shop PC running the agent. Its token is stored only as a hash.

const deviceSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    name: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    os: { type: String, default: '' },
    version: { type: String, default: '' },
    printers: [
      {
        _id: false,
        name: String,
        status: String,
        isDefault: Boolean,
        duplex: Boolean,
      },
    ],
    online: { type: Boolean, default: false },
    lastSeenAt: { type: Date },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const pairCodeSchema = new Schema({
  code: { type: String, required: true, unique: true },
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
  expiresAt: { type: Date, required: true, expires: 0 }, // Mongo deletes it when it expires
});

// ---------------------------------------------------------------- Job

const fileSchema = new Schema(
  {
    key: { type: String, default: '' }, // storage key of the print-ready PDF ('' once deleted)
    name: { type: String, required: true },
    bytes: Number,
    pages: { type: Number, required: true },
    deletedAt: Date,
  },
  sub,
);

const jobSchema = new Schema(
  {
    /** Public id used in the customer's tracking link. Long and random. */
    ref: { type: String, required: true, unique: true },
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    /** Short code the customer says at the counter. */
    pickupCode: { type: String, required: true },
    status: { type: String, enum: JOB_STATUSES, default: 'draft' },
    file: { type: fileSchema, required: true },
    mode: { type: String, enum: ['bw', 'color'], required: true },
    copies: { type: Number, required: true },
    sides: { type: String, enum: ['single', 'double'], default: 'single' },
    /** Chosen pages in print order, each with its turn on the upright A4 sheet. Empty = every page as uploaded. */
    pageList: [{ _id: false, p: Number, r: Number }],
    printPages: Number,
    rate: { type: Number, required: true },
    total: { type: Number, required: true },
    payment: {
      method: { type: String, enum: ['online', 'cash'], default: 'online' },
      orderId: { type: String, index: true },
      paymentId: String,
      refundId: String,
      mock: Boolean,
      paidAt: Date,
    },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device' },
    printer: { type: String, default: '' },
    sentAt: Date,
    acceptedAt: Date,
    printedAt: Date,
    error: { type: String, default: '' },
    events: [{ _id: false, at: { type: Date, default: Date.now }, status: String, note: String }],
  },
  { timestamps: true },
);

// The dispatcher looks for queued work of connected shops; the dashboard lists a shop's jobs newest first.
jobSchema.index({ status: 1, shopId: 1, createdAt: 1 });
jobSchema.index({ shopId: 1, createdAt: -1 });
jobSchema.index({ 'file.key': 1, updatedAt: 1 });

export const Shop = mongoose.model('Shop', shopSchema);
export const User = mongoose.model('User', userSchema);
export const Device = mongoose.model('Device', deviceSchema);
export const PairCode = mongoose.model('PairCode', pairCodeSchema);
export const Job = mongoose.model('Job', jobSchema);

export type ShopDoc = HydratedDocument<InferSchemaType<typeof shopSchema>>;
export type JobDoc = HydratedDocument<InferSchemaType<typeof jobSchema>>;
export type DeviceDoc = HydratedDocument<InferSchemaType<typeof deviceSchema>>;
