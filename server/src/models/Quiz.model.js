const mongoose = require('mongoose');

const quizQuestionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },

    question: {
      type: String,
      required: true,
    },

    options: {
      type: [String],
      required: true,
      validate: {
        validator: (val) =>
          Array.isArray(val) && val.length === 4,
        message: 'Every question must contain exactly 4 options.',
      },
    },

    correctOptionIndex: {
      type: Number,
      required: true,
      min: 0,
      max: 3,
    },

    // Optional for compatibility with existing cached quizzes.
    explanation: {
      type: String,
      required: false,
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const quizSchema = new mongoose.Schema(
  {
    topicId: {
      type: String,
      required: true,
    },

    roleId: {
      type: String,
      required: true,
      default: 'general',
    },

    roleName: {
      type: String,
    },

    questions: {
      type: [quizQuestionSchema],
      required: true,
      validate: {
        validator: (val) =>
          Array.isArray(val) &&
          val.length >= 15 &&
          val.length <= 20,
        message: 'Quiz questionCount must be between 15 and 20.',
      },
    },

    questionCount: {
      type: Number,
      required: true,
    },

    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// One cached quiz per topic and role context.
quizSchema.index(
  {
    topicId: 1,
    roleId: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model('Quiz', quizSchema);