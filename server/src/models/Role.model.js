const mongoose = require('mongoose');

const outlinePointSchema = new mongoose.Schema({
  point: { type: String, required: true },
  estimatedMinutes: { type: Number, required: true },
  type: { type: String, enum: ['practical', 'conceptual'], required: true },
  source: { type: String, enum: ['docs', 'interview-questions'], required: true },
  practicePrompt: { type: String, required: true },
}, { _id: false });

const topicSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  track: { type: String, enum: ['DSA', 'Core CS', 'Aptitude', 'Tools/Libraries'], required: true },
  priority: { type: String, enum: ['core', 'supplementary'], required: true },
  prerequisiteTopicIds: [{ type: String }],
  outline: [outlinePointSchema],
}, { _id: false });

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  topics: [topicSchema],
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);