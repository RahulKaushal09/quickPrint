// Creates the admin account and one demo shop with an owner login. Safe to re-run.

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from './config';
import { Shop, User } from './models';

await mongoose.connect(config.mongoUri);

const adminPhone = process.env.ADMIN_PHONE || '9999999999';
if (!(await User.exists({ phone: adminPhone }))) {
  await User.create({ name: 'Admin', phone: adminPhone, role: 'admin', passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10) });
  console.log(`admin       ${adminPhone} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
}

let shop = await Shop.findOne({ code: 'DEMO42' });
if (!shop) {
  shop = await Shop.create({
    code: 'DEMO42',
    name: 'Sharma Photostat',
    area: 'Sector 17',
    city: 'Chandigarh',
    phone: '9000000001',
    rates: { bwPerPage: 200, colorPerPage: 1000, colorEnabled: true },
    fee: { type: 'percent', value: 500 },
  });
  // A known demo password must never exist on a public server.
  const password = process.env.NODE_ENV === 'production' ? crypto.randomBytes(12).toString('base64url') : 'shop123';
  await User.create({ name: 'Rakesh Sharma', phone: '9000000001', role: 'owner', shopId: shop._id, passwordHash: await bcrypt.hash(password, 10) });
  console.log(`shop owner  9000000001 / ${password}`);
}
console.log(`customer QR ${config.webUrl}/s/${shop.code}`);
await mongoose.disconnect();
