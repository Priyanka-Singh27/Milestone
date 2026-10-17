// server/src/models/SkillProfile.model.js

const mongoose = require('mongoose');

const skillEntrySchema = new mongoose.Schema({
  topicId: { type: String, required: true },
  verified: { type: Boolean, default: false }, // true only after a quiz pass — this always overrides proficiency for gap purposes
  proficiency: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' }, // NEW — self-reported depth, from resume parsing or manual entry
  source: { type: String, enum: ['resume', 'manual', 'quiz'], required: true },
}, { _id: false });

const skillProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  skills: [skillEntrySchema],
}, { timestamps: true });

module.exports = mongoose.model('SkillProfile', skillProfileSchema);