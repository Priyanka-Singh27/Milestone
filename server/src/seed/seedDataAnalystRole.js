require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/Role.model');
const topics = require('./data-analyst-curriculum.json'); // place the JSON file here

mongoose.connect(process.env.DATABASE_URL).then(async () => {
  const existing = await Role.findOne({ name: 'Data Analyst' });
  if (existing) {
    console.log('⚠️ Data Analyst role already exists — skipping. Delete it manually first if you want to reseed.');
    process.exit(0);
  }

  const role = await Role.create({
    name: 'Data Analyst',
    description: 'Role curriculum researched from job postings, roadmap.sh, and interview-question sources.',
    topics,
  });

  console.log(`✅ Created Data Analyst role with ${role.topics.length} topics`);
  process.exit(0);
});