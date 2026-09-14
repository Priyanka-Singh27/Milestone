// server/src/controllers/skills.controller.js

const Role = require('../models/Role.model');
const SkillProfile = require('../models/SkillProfile.model');

const getSkillGap = async (req, res) => {
  try {
    const { targetRoleId, currentSkillTopicIds } = req.body;

    if (!targetRoleId || !Array.isArray(currentSkillTopicIds)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'targetRoleId and currentSkillTopicIds are required.' },
      });
    }

    const role = await Role.findById(targetRoleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        error: { code: 'ROLE_NOT_FOUND', message: 'No role found with that ID.' },
      });
    }

    const allTopicIds = role.topics.map(t => t.id);
    const gapTopicIds = allTopicIds.filter(id => !currentSkillTopicIds.includes(id));

    res.status(200).json({ success: true, data: { gapTopicIds } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/v1/skills/verify
// Called by Module B (quiz system) when a student passes a quiz for a topic.
// Marks that skill as verified on the student's SkillProfile — creating the
// profile or the skill entry if either doesn't exist yet.
// ---------------------------------------------------------------------------
const verifySkill = async (req, res) => {
  try {
    const { userId, topicId } = req.body;

    if (!userId || !topicId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'userId and topicId are required.' },
      });
    }

    let skillProfile = await SkillProfile.findOne({ userId });

    if (!skillProfile) {
      skillProfile = await SkillProfile.create({
        userId,
        skills: [{ topicId, verified: true, source: 'quiz' }],
      });
    } else {
      const existingSkill = skillProfile.skills.find(s => s.topicId === topicId);
      if (existingSkill) {
        existingSkill.verified = true;
        // NOTE: source is intentionally left as whatever it originally was
        // (resume/manual) — passing a quiz verifies an existing claim, it
        // doesn't change how the skill was first reported.
      } else {
        skillProfile.skills.push({ topicId, verified: true, source: 'quiz' });
      }
      await skillProfile.save();
    }

    res.status(200).json({ success: true, data: { skillProfile } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
};

module.exports = { getSkillGap, verifySkill };