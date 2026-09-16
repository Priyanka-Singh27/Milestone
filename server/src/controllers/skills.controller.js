// server/src/controllers/skills.controller.js

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Role = require('../models/Role.model');
const SkillProfile = require('../models/SkillProfile.model');
const { callLLM } = require('../services/llm.service');

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

// ---------------------------------------------------------------------------
// Text extraction — pure file-parsing, NOT the LLM. Separate from the LLM
// call so each piece can be tested/debugged independently.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// LLM-calling logic — given raw resume text and a Role document, ask the LLM
// to extract skills matched against that role's known topic IDs. Separated
// out from the controller so it's testable without needing an actual upload.
// ---------------------------------------------------------------------------
async function extractSkillsFromText(resumeText, role) {
  const knownTopics = role.topics.map(t => ({ id: t.id, name: t.name }));

  const system = `You extract technical skills from resume text and match them against a fixed list of known topic IDs. Only use topic IDs from the provided list — never invent new ones. Respond with ONLY valid JSON, no other text, in this exact shape: {"skills": [{"topicId": "...", "name": "...", "confidence": "high"|"medium"|"low"}]}`;

  const prompt = `Known topics for this role (only match against these — do not invent topic IDs):\n${JSON.stringify(knownTopics, null, 2)}\n\nResume text:\n${resumeText.slice(0, 8000)}\n\nExtract every skill from the resume that matches one of the known topics above. Assign a confidence level based on how clearly the resume demonstrates that skill (e.g., a listed skill with no context = lower confidence; a skill backed by a described project = higher confidence).`;

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

  // Defensive filter: drop any topicId the LLM hallucinated that isn't
  // actually one of this role's real topics.
  const validTopicIds = new Set(knownTopics.map(t => t.id));
  const filteredSkills = parsed.skills.filter(s => validTopicIds.has(s.topicId));

  return filteredSkills;
}

// ---------------------------------------------------------------------------
// POST /api/v1/skills/extract
// Multipart upload: file field name "resume", plus a "targetRoleId" field.
// ---------------------------------------------------------------------------
const extractSkills = async (req, res) => {
  try {
    const { targetRoleId } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FILE', message: 'No resume file was uploaded (expected form field "resume").' },
      });
    }
    if (!targetRoleId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'targetRoleId is required.' },
      });
    }

    const role = await Role.findById(targetRoleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        error: { code: 'ROLE_NOT_FOUND', message: 'No role found with that ID.' },
      });
    }

    let resumeText;
    try {
      resumeText = await extractTextFromFile(req.file.buffer, req.file.mimetype);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: { code: 'FILE_PARSE_ERROR', message: `Could not read the uploaded file: ${err.message}` },
      });
    }

    if (!resumeText || resumeText.trim().length < 20) {
      return res.status(400).json({
        success: false,
        error: { code: 'EMPTY_RESUME_TEXT', message: 'Could not extract meaningful text from this file — it may be a scanned image rather than text-based.' },
      });
    }

    const skills = await extractSkillsFromText(resumeText, role);

    // NOTE: per the design in PROJECT_TASKS.md, this does NOT save anything —
    // the frontend shows this list to the student to review/edit before they
    // confirm it, which is a separate save step (not yet built).
    res.status(200).json({ success: true, data: { skills } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
};

module.exports = {
  getSkillGap,
  verifySkill,
  extractSkills,
  // exported for testing
  extractTextFromFile,
  extractSkillsFromText,
};