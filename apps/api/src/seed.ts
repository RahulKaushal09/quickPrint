// Creates the admin account and one demo shop with an owner login. Safe to re-run.

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
  await User.create({ name: 'Rakesh Sharma', phone: '9000000001', role: 'owner', shopId: shop._id, passwordHash: await bcrypt.hash('shop123', 10) });
  console.log('shop owner  9000000001 / shop123');
}
console.log(`customer QR ${config.webUrl}/s/${shop.code}`);
await mongoose.disconnect();
