const Role = require('../models/Role.model');

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

module.exports = { getSkillGap };