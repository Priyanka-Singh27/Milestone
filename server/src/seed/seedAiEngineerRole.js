require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/Role.model');
const topics = require('./ai-engineer-curriculum.json');

mongoose.connect(process.env.DATABASE_URL).then(async () => {
  const existing = await Role.findOne({ name: 'AI Engineer' });
  if (existing) {
    console.log('⚠️ AI Engineer role already exists — skipping.');
    process.exit(0);
  }

  const role = await Role.create({
    name: 'AI Engineer',
    description: 'Role curriculum researched from job postings, roadmap.sh, and interview-question sources.',
    topics,
  });

  console.log(`✅ Created AI Engineer role with ${role.topics.length} topics`);
  process.exit(0);
});