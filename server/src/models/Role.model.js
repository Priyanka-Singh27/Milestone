const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  track: { type: String, required: true }, // e.g. "DSA", "Core CS", "Aptitude", "Tools/Libraries"
  prerequisiteTopicIds: [{ type: String }],
  estimatedHours: { type: Number, required: true },
  quizEligible: { type: Boolean, default: false },
}, { _id: false });

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true },      // e.g. "AI/ML Engineer"
  description: { type: String },
  topics: [topicSchema],
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);