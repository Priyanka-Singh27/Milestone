const mongoose = require('mongoose');

const fundamentalsTopicSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  area: {
    type: String,
    enum: ['DSA', 'OOP', 'OS', 'DBMS', 'CN'],
    required: true,
  },
  name: { type: String, required: true },
  description: { type: String },
  quizEligible: { type: Boolean, default: true },
  capstoneProjectSuggestion: { type: String },
  outline: [{
    point: { type: String, required: true },
    estimatedMinutes: { type: Number, default: 30 },
    type: { type: String, enum: ['practical', 'conceptual'], default: 'conceptual' },
    source: { type: String, default: 'docs' },
    practicePrompt: { type: String },
  }],
}, { timestamps: true });

const fundamentalsProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  topicId: { type: String, required: true },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed', 'verified'],
    default: 'not_started',
  },
}, { timestamps: true });

fundamentalsProgressSchema.index({ userId: 1, topicId: 1 }, { unique: true });

const FundamentalsTopic = mongoose.model('FundamentalsTopic', fundamentalsTopicSchema);
const FundamentalsProgress = mongoose.model('FundamentalsProgress', fundamentalsProgressSchema);

module.exports = {
  FundamentalsTopic,
  FundamentalsProgress,
};
