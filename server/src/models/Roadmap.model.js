// server/src/models/Roadmap.model.js

const mongoose = require('mongoose');

const roadmapTaskSchema = new mongoose.Schema({
  id: { type: String, required: true },
  topicId: { type: String, required: true },
  track: { type: String },
  taskName: { type: String, required: true },
  description: { type: String },
  estimatedMinutes: { type: Number },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed', 'verified'],
    default: 'not_started',
  },
}, { _id: false });

const practicePlanSchema = new mongoose.Schema({
  type: { type: String, enum: ['revision', 'standard'] },
  dsaProblemCount: Number,
  aptitudeSetMinutes: Number,
  weeklyMockInterview: Boolean,
}, { _id: false });

const roadmapDaySchema = new mongoose.Schema({
  dayNumber: { type: Number, required: true },
  date: { type: String, required: true }, // stored as ISO date string ("YYYY-MM-DD") for clean string comparison against "today"
  phase: { type: String, enum: ['foundational', 'practice'], required: true },
  isBufferDay: { type: Boolean, default: false },
  tasks: [roadmapTaskSchema],
  practicePlan: practicePlanSchema,
}, { _id: false });

const roadmapSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  targetRoleId: { type: String, required: true },
  gapTopicIds: [{ type: String }], // NEW — the full original topic list, so regeneration never has to guess by scanning stored tasks
  startDate: { type: String, required: true },
  totalDays: { type: Number, required: true },
  daysPerWeek: { type: Number, required: true },
  hoursPerDay: { type: Number, required: true },
  bufferInterval: { type: Number, default: 0 }, // NEW — was used by the controller but never actually persisted before
  days: [roadmapDaySchema],
}, { timestamps: true });

module.exports = mongoose.model('Roadmap', roadmapSchema);