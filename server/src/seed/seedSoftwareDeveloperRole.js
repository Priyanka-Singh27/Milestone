require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/Role.model');
const topics = require('./software-developer-curriculum.json');

mongoose.connect(process.env.DATABASE_URL).then(async () => {
  const existing = await Role.findOne({ name: 'Software Developer' });
  if (existing) {
    console.log('⚠️ Software Developer role already exists — skipping.');
    process.exit(0);
  }

  const role = await Role.create({
    name: 'Software Developer',
    description: 'Role curriculum researched from job postings, roadmap.sh, and interview-question sources.',
    topics,
  });

  console.log(`✅ Created Software Developer role with ${role.topics.length} topics`);
  process.exit(0);
});