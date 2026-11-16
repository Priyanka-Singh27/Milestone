// scripts/dedupeRoadmaps.js
//
// One-off cleanup for databases created before "one roadmap per user" was
// enforced. For each user with several roadmaps it keeps ONE and deletes the
// rest. GET /roadmap always returned the OLDEST, so that is what users have been
// seeing and ticking off; keeping the oldest changes nothing for them.
//
//   node scripts/dedupeRoadmaps.js            (dry run, prints what it would do)
//   node scripts/dedupeRoadmaps.js --apply    (actually deletes)
//   node scripts/dedupeRoadmaps.js --apply --keep=newest

require('dotenv').config();
const mongoose = require('mongoose');
const Roadmap = require('../src/models/Roadmap.model');

(async () => {
  const apply = process.argv.includes('--apply');
  const keepNewest = process.argv.includes('--keep=newest');

  await mongoose.connect(process.env.DATABASE_URL);
  const dupes = await Roadmap.aggregate([
    { $group: { _id: '$userId', ids: { $push: { id: '$_id', at: '$createdAt' } }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);

  console.log(`${dupes.length} user(s) have more than one roadmap.`);
  for (const d of dupes) {
    const sorted = d.ids.sort((a, b) => new Date(a.at) - new Date(b.at));
    const keep = keepNewest ? sorted[sorted.length - 1] : sorted[0];
    const remove = sorted.filter((x) => String(x.id) !== String(keep.id)).map((x) => x.id);
    console.log(`user ${d._id}: keep ${keep.id}, delete ${remove.length}`);
    if (apply) await Roadmap.deleteMany({ _id: { $in: remove } });
  }
  if (!apply && dupes.length) console.log('\nDry run only. Re-run with --apply to delete.');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
