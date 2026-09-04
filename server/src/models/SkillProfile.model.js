const mongoose = require('mongoose');

const skillEntrySchema = new mongoose.Schema({
  topicId: { type: String, required: true },
  verified: { type: Boolean, default: false },
  source: { type: String, enum: ['resume', 'manual', 'quiz'], required: true },
}, { _id: false });

const skillProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  skills: [skillEntrySchema],
}, { timestamps: true });

module.exports = mongoose.model('SkillProfile', skillProfileSchema);