// server/src/controllers/skills.controller.js

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Role = require('../models/Role.model');
const SkillProfile = require('../models/SkillProfile.model');
const { callLLM } = require('../services/llm.service');
const mongoose = require('mongoose');
const Roadmap = require('../models/Roadmap.model');
const { FundamentalsProgress, FundamentalsTopic } = require('../models/Fundamentals.model');
const { safeMessage } = require('../utils/safeError');

function isConsideredKnown(entry) {
  return Boolean(entry) && (entry.verified || entry.proficiency === 'intermediate' || entry.proficiency === 'advanced');
}

const getSkillGap = async (req, res) => {
  try {
    const { targetRoleId, currentSkills } = req.body;

    if (typeof targetRoleId !== 'string' || !targetRoleId || !Array.isArray(currentSkills) || currentSkills.length > 300) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'targetRoleId and currentSkills (an array of { topicId, proficiency }) are required.' },
      });
    }

    const role = mongoose.isValidObjectId(targetRoleId) ? await Role.findById(targetRoleId) : null;
    if (!role) {
      return res.status(404).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'No role found with that ID.' } });
    }

    // "verified" is decided by the server (a passed quiz), never by the client.
    const profile = await SkillProfile.findOne({ userId: req.user.userId }).lean();
    const verifiedIds = new Set((profile?.skills || []).filter((x) => x.verified).map((x) => x.topicId));

    const PROFICIENCIES = ['beginner', 'intermediate', 'advanced'];
    const skillsMap = new Map();
    currentSkills.forEach(s => {
      if (s && typeof s.topicId === 'string') {
        skillsMap.set(s.topicId, {
          proficiency: PROFICIENCIES.includes(s.proficiency) ? s.proficiency : 'beginner',
          verified: verifiedIds.has(s.topicId),
        });
      }
    });
    verifiedIds.forEach((id) => {
      if (!skillsMap.has(id)) skillsMap.set(id, { proficiency: 'intermediate', verified: true });
    });

    const allTopicIds = role.topics.map(t => t.id);
    const gapTopicIds = allTopicIds.filter(id => !isConsideredKnown(skillsMap.get(id)));

    const inconsistencies = [];
    role.topics.forEach(topic => {
      const entry = skillsMap.get(topic.id);
      if (!isConsideredKnown(entry)) return;
      topic.prerequisiteTopicIds.forEach(prereqId => {
        if (!isConsideredKnown(skillsMap.get(prereqId))) {
          inconsistencies.push({ topicId: topic.id, missingPrerequisiteId: prereqId });
        }
      });
    });

    res.status(200).json({ success: true, data: { gapTopicIds, inconsistencies } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
};

const verifySkill = async (req, res) => {
  try {
    const { userId, topicId } = req.body;

    if (typeof userId !== 'string' || !userId || typeof topicId !== 'string' || !topicId) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'userId and topicId are required.' } });
    }

    let skillProfile = await SkillProfile.findOne({ userId });
    if (!skillProfile) {
      skillProfile = await SkillProfile.create({
        userId,
        skills: [{ topicId, verified: true, proficiency: 'intermediate', source: 'quiz' }],
      });
    } else {
      const existingSkill = skillProfile.skills.find(s => s.topicId === topicId);
      if (existingSkill) {
        existingSkill.verified = true;
      } else {
        skillProfile.skills.push({ topicId, verified: true, proficiency: 'intermediate', source: 'quiz' });
      }
      await skillProfile.save();
    }

    // Reflect the pass everywhere the student can see it:
    //  1. every roadmap task of this topic becomes 'verified'
    //  2. a CS-fundamentals topic's progress becomes 'verified'
    const roadmap = await Roadmap.findOne({ userId });
    if (roadmap) {
      let changed = false;
      roadmap.days.forEach((day) => {
        (day.tasks || []).forEach((task) => {
          const mine = task.topicId === topicId || String(task.id).startsWith(`${topicId}::`);
          if (mine && task.status !== 'verified') {
            task.status = 'verified';
            changed = true;
          }
        });
      });
      if (changed) await roadmap.save();
    }

    if (await FundamentalsTopic.exists({ id: topicId })) {
      await FundamentalsProgress.findOneAndUpdate(
        { userId, topicId },
        { $set: { status: 'verified' } },
        { upsert: true }
      );
    }

    res.status(200).json({ success: true, data: { skillProfile } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
};

/** GET /skills/verified — topic ids the logged-in student has verified by quiz. */
const getVerifiedSkills = async (req, res) => {
  try {
    const profile = await SkillProfile.findOne({ userId: req.user.userId }).lean();
    const verifiedTopicIds = (profile?.skills || []).filter((x) => x.verified).map((x) => x.topicId);
    res.status(200).json({ success: true, data: { verifiedTopicIds } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
};

async function extractTextFromFile(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new Error(`Unsupported file type: ${mimetype}`);
}

async function extractSkillsFromText(resumeText, role) {
  const knownTopics = role.topics.map(t => ({ id: t.id, name: t.name }));

  const system = `You extract technical skills from resume text and match them against a fixed list of known topic IDs. Only use topic IDs from the provided list — never invent new ones. Respond with ONLY valid JSON, no other text, in this exact shape: {"skills": [{"topicId": "...", "name": "...", "confidence": "high"|"medium"|"low"}]}`;

  const prompt = `Known topics for this role (only match against these — do not invent topic IDs):\n${JSON.stringify(knownTopics, null, 2)}\n\nResume text:\n${resumeText.slice(0, 8000)}\n\nExtract every skill from the resume that matches one of the known topics above. Assign a confidence level based on how clearly the resume demonstrates that skill.`;

  const raw = await callLLM({ system, prompt, mockKind: 'resumeSkills' });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('LLM_PARSE_ERROR: model did not return valid JSON');
  }

  if (!parsed.skills || !Array.isArray(parsed.skills)) {
    throw new Error('LLM_PARSE_ERROR: response missing expected "skills" array');
  }

  // Trust nothing from the model except which known topic ids it matched.
  const byId = new Map(knownTopics.map(t => [t.id, t]));
  const CONFIDENCE = ['high', 'medium', 'low'];
  const seen = new Set();
  const result = [];
  parsed.skills.forEach((s) => {
    if (!s || typeof s.topicId !== 'string' || !byId.has(s.topicId) || seen.has(s.topicId)) return;
    seen.add(s.topicId);
    result.push({
      topicId: s.topicId,
      name: byId.get(s.topicId).name,
      confidence: CONFIDENCE.includes(s.confidence) ? s.confidence : 'low',
    });
  });
  return result;
}

const extractSkills = async (req, res) => {
  try {
    const { targetRoleId } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FILE', message: 'No resume file was uploaded (expected form field "resume").' } });
    }
    if (typeof targetRoleId !== 'string' || !targetRoleId) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'targetRoleId is required.' } });
    }

    const role = mongoose.isValidObjectId(targetRoleId) ? await Role.findById(targetRoleId) : null;
    if (!role) {
      return res.status(404).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'No role found with that ID.' } });
    }

    let resumeText;
    try {
      resumeText = await extractTextFromFile(req.file.buffer, req.file.mimetype);
    } catch (err) {
      return res.status(400).json({ success: false, error: { code: 'FILE_PARSE_ERROR', message: 'Could not read the uploaded file. Try a different PDF or DOCX, or enter your skills manually.' } });
    }

    if (!resumeText || resumeText.trim().length < 20) {
      return res.status(400).json({ success: false, error: { code: 'EMPTY_RESUME_TEXT', message: 'Could not extract meaningful text from this file — it may be a scanned image rather than text-based.' } });
    }

    const skills = await extractSkillsFromText(resumeText, role);
    res.status(200).json({ success: true, data: { skills } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
};

module.exports = {
  getSkillGap,
  verifySkill,
  getVerifiedSkills,
  extractSkills,
  extractTextFromFile,
  extractSkillsFromText,
  isConsideredKnown,
};