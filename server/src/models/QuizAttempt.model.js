const mongoose = require('mongoose');

const quizAttemptSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  quizId: { type: String, required: true },
  topicId: { type: String, required: true },
  roleId: { type: String },
  answers: {
    type: [Number],
    required: true,
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  passed: {
    type: Boolean,
    required: true,
  },
  attemptNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 3,
  },
  attemptedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Compound index for querying a user's attempts on a topic sorted by time
quizAttemptSchema.index({ userId: 1, topicId: 1, attemptedAt: -1 });

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);

