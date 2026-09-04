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

const roadmapDaySchema = new mongoose.Schema({
  dayNumber: { type: Number, required: true },
  date: { type: Date, required: true },
  tasks: [roadmapTaskSchema],
}, { _id: false });

const roadmapSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  targetRoleId: { type: String, required: true },
  startDate: { type: Date, required: true },
  totalDays: { type: Number, required: true },
  daysPerWeek: { type: Number, required: true },
  hoursPerDay: { type: Number, required: true },
  days: [roadmapDaySchema],
}, { timestamps: true });

module.exports = mongoose.model('Roadmap', roadmapSchema);