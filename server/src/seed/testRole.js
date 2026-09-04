require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../models/Role.model');

mongoose.connect(process.env.DATABASE_URL).then(async () => {
  const role = await Role.create({
    name: 'AI/ML Engineer',
    description: 'Test role',
    topics: [
      { id: 't1', name: 'Python Basics', track: 'Tools/Libraries', prerequisiteTopicIds: [], estimatedHours: 5, quizEligible: false },
    ],
  });
  console.log('✅ Created role:', role);
  process.exit(0);
});