// server/src/services/quiz.service.js

const Quiz = require('../models/Quiz.model');
const QuizAttempt = require('../models/QuizAttempt.model');
const Role = require('../models/Role.model');
const Roadmap = require('../models/Roadmap.model');
const {
  FundamentalsTopic,
  FundamentalsProgress,
} = require('../models/Fundamentals.model');
const { DEFAULT_CURRICULUM } = require('./fundamentals.service');
const llmService = require('./llm.service');
const integrationService = require('./integration.service');

const COOLDOWN_HOURS = 10;
const PASSING_SCORE = 80;
const MAX_ATTEMPTS = 3;

/**
 * Resolves role context for a user or topic.
 */
async function resolveRoleContext({
  userId = 'dev-user-1',
  roleId,
  roleName,
  topicId,
}) {
  const toIdString = (role) =>
    role._id ? role._id.toString() : role.id || 'general';

  if (roleId) {
    const role = await Role.findById(roleId)
      .lean()
      .catch(() => null);

    if (role) {
      return {
        role,
        roleId: toIdString(role),
        roleName: role.name,
      };
    }
  }

  if (roleName) {
    const role = await Role.findOne({
      name: new RegExp(`^${roleName.trim()}$`, 'i'),
    })
      .lean()
      .catch(() => null);

    if (role) {
      return {
        role,
        roleId: toIdString(role),
        roleName: role.name,
      };
    }
  }

  if (userId) {
    const roadmap = await Roadmap.findOne({ userId })
      .lean()
      .catch(() => null);

    if (roadmap && roadmap.targetRoleId) {
      const role = await Role.findById(roadmap.targetRoleId)
        .lean()
        .catch(() => null);

      if (role) {
        return {
          role,
          roleId: toIdString(role),
          roleName: role.name,
        };
      }
    }
  }

  if (topicId) {
    const matchingRoles = await Role.find({
      'topics.id': topicId,
    })
      .lean()
      .catch(() => []);

    if (Array.isArray(matchingRoles) && matchingRoles.length >= 1) {
      const role = matchingRoles[0];

      return {
        role,
        roleId: toIdString(role),
        roleName: role.name,
      };
    }
  }

  return {
    role: null,
    roleId: 'general',
    roleName: 'General CS',
  };
}

/**
 * Finds topic definition from either Role topics or Fundamentals topics.
 */
async function resolveTopic({ topicId, role }) {
  if (role && Array.isArray(role.topics)) {
    const topic = role.topics.find((item) => item.id === topicId);

    if (topic) {
      return {
        topic,
        source: 'role',
      };
    }
  }

  const otherRole = await Role.findOne({
    'topics.id': topicId,
  })
    .lean()
    .catch(() => null);

  if (otherRole && Array.isArray(otherRole.topics)) {
    const topic = otherRole.topics.find((item) => item.id === topicId);

    if (topic) {
      return {
        topic,
        source: 'role',
        actualRole: otherRole,
      };
    }
  }

  const fundTopic = await FundamentalsTopic.findOne({
    id: topicId,
  })
    .lean()
    .catch(() => null);

  if (fundTopic) {
    return {
      topic: fundTopic,
      source: 'fundamentals',
    };
  }

  const defaultTopic = DEFAULT_CURRICULUM.find(
    (item) => item.id === topicId
  );

  if (defaultTopic) {
    return {
      topic: defaultTopic,
      source: 'fundamentals',
    };
  }

  return {
    topic: null,
    source: null,
  };
}

/**
 * Computes question count scaled to topic size between 15 and 20.
 */
function scaleQuestionCount(topic) {
  if (!topic) return 15;

  const outline = topic.outline || [];

  const totalMinutes = outline.reduce(
    (sum, point) => sum + (point.estimatedMinutes || 30),
    0
  );

  if (totalMinutes >= 240 || outline.length >= 8) {
    return 20;
  }

  if (totalMinutes <= 180 || outline.length <= 6) {
    return 15;
  }

  const scaled = Math.round(
    15 + ((totalMinutes - 180) / 60) * 5
  );

  return Math.min(20, Math.max(15, scaled));
}

/**
 * Builds a role-personalized prompt grounded in topic.outline.
 */
function buildQuizPrompt({
  topic = {},
  role = null,
  roleId = null,
  roleName = 'Software Developer',
  roleDescription = '',
  questionCount = 15,
}) {
  const targetCount =
    questionCount && questionCount >= 15 && questionCount <= 20
      ? questionCount
      : 15;

  const outline = topic?.outline || [];
  const outlineLength = outline.length || 1;

  const questionsPerPoint = Math.max(
    1,
    Math.ceil(targetCount / outlineLength)
  );

  const nativeTopic = role?.topics?.find(
    (item) => item.id === topic.id
  );

  const topicTrack =
    nativeTopic?.track ||
    topic.track ||
    'Tools/Libraries';

  const topicPriority =
    nativeTopic?.priority ||
    topic.priority ||
    'core';

  const prerequisites =
    nativeTopic?.prerequisiteTopicIds ||
    topic.prerequisiteTopicIds ||
    [];

  const prerequisitesText =
    prerequisites.length > 0
      ? prerequisites.join(', ')
      : 'None (foundational module)';

  const outlineText = outline
    .map((point, index) => {
      let line =
        `  ${index + 1}. ${point.point} ` +
        `[type: ${point.type || 'conceptual'}, ` +
        `source: ${point.source || 'docs'}]`;

      if (point.practicePrompt) {
        line +=
          `\n     Curriculum practice scenario: ` +
          `"${point.practicePrompt}"`;
      }

      return line;
    })
    .join('\n');

  let roleCurriculumSummary = '';

  if (role && Array.isArray(role.topics) && role.topics.length > 0) {
    const trackCounts = {};

    role.topics.forEach((item) => {
      trackCounts[item.track] =
        (trackCounts[item.track] || 0) + 1;
    });

    const trackSummary = Object.entries(trackCounts)
      .map(([track, count]) => `${count} ${track}`)
      .join(', ');

    const sampleTopics = role.topics
      .slice(0, 5)
      .map((item) => item.name)
      .join(', ');

    roleCurriculumSummary =
      `Candidate is enrolled in the "${role.name}" curriculum ` +
      `(${trackSummary}), covering core areas such as: ${sampleTopics}.`;
  }

  let roleSpecificContext = '';

  if (nativeTopic) {
    roleSpecificContext =
      `This topic is a native "${topicPriority.toUpperCase()}" ` +
      `requirement within the "${topicTrack}" track of the ` +
      `${roleName} curriculum.`;
  } else {
    roleSpecificContext =
      `This topic is an elective / cross-functional assessment ` +
      `module for the ${roleName} career track. It must be evaluated ` +
      `through the operational lens and technical responsibilities ` +
      `of a ${roleName}.`;
  }

  if (roleCurriculumSummary) {
    roleSpecificContext += `\n${roleCurriculumSummary}`;
  }

  const lowerRole = roleName.toLowerCase();

  let roleEmphasis = '';
  let roleLens = '';
  let roleQuestionMix = '';

  if (lowerRole.includes('data analyst')) {
    roleEmphasis =
      'EMPHASIS: Ground scenarios in data analytics, tabular reporting, ' +
      'SQL queries, metric calculation, data aggregation, data cleaning, ' +
      'and business intelligence decision making.';

    roleLens = `ROLE PERSPECTIVE (Data Analyst):
You are evaluating a Data Analyst who applies models and analytical tools to extract insights, automate reporting, and analyze tabular datasets.
- CORE RESPONSIBILITIES & ASSESSMENT ANGLES:
  * Tabular & Unstructured Data Workflows: Using pre-trained models for text classification, entity extraction from messy columns, and structuring raw text into tabular formats (CSV/JSON/SQL tables).
  * Output Verification & Analytical Factuality: Detecting hallucinations in automated summaries, validating numerical assertions against ground-truth tables, and spot-checking analytical conclusions.
  * Practical Data Automation: Integrating model completions with Python/pandas, SQL workflows, or business intelligence pipelines to accelerate EDA (Exploratory Data Analysis).
  * Data Volume & Token Economics: Estimating token consumption and costs across large tabular batches (e.g. 10,000 feedback rows), and understanding when to use traditional SQL/statistics vs LLM-based approaches.
  * Limitations in Data Context: Understanding what language models cannot do (e.g., precise arithmetic on massive tables without tools, deterministic aggregations).
- ANTI-PATTERNS TO AVOID:
  * Do NOT ask deep backend system architecture, compiler, or low-level ML training questions. Focus on data utility, analytical integrity, and workflow automation.`;

    roleQuestionMix = `RECOMMENDED QUESTION MIX (Data Analyst):
- 4-5 Questions: Real-world data analysis and business scenario questions (tabular extraction, data cleaning, executive summaries).
- 4-5 Questions: Output validation, detecting analytical hallucinations, and cross-referencing model claims with source data.
- 3-4 Questions: Practical prompt/API application in analytical pipelines (token estimation for datasets, formatting outputs as tables).
- 2-3 Questions: Core concepts and model capabilities/limitations relevant to data analysts.`;
  } else if (lowerRole.includes('ai engineer')) {
    roleEmphasis =
      'EMPHASIS: Ground scenarios in machine learning workflows, ' +
      'tensor/vector manipulation, algorithmic pipelines, embeddings, ' +
      'model evaluation, and computational efficiency.';

    roleLens = `ROLE PERSPECTIVE (AI Engineer):
You are evaluating an AI Engineer who designs, optimizes, evaluates, and deploys production AI and generative systems.
- CORE RESPONSIBILITIES & ASSESSMENT ANGLES:
  * Model Inference & Sampling Dynamics: How inference operates under the hood, sampling parameters (temperature, top_p, top_k, frequency/presence penalties), logprobs, and deterministic vs stochastic behavior.
  * Model Architectures & Family Comparisons: Comparing pre-trained model families (open-source vs proprietary, dense vs Mixture-of-Experts, reasoning vs instruction-tuned), context window limits, and capability trade-offs.
  * Tokenization Mechanics & Context Utilization: Subword tokenizers (BPE, WordPiece), token counting, context window utilization, KV-caching implications, and cost per million tokens.
  * Hallucination Mechanics & Mitigation: Root causes of hallucinations in autoregressive decoders, grounding via system prompts and retrieved context (RAG foundations), and factuality evaluation.
  * Production AI Engineering: Model evaluation metrics, prompt engineering patterns, safety and system steering, and latency vs quality trade-offs.
- ANTI-PATTERNS TO AVOID:
  * Do NOT ask generic web development or non-AI software questions. Focus deeply on model behavior, inference mechanics, parameter tuning, and AI system design.`;

    roleQuestionMix = `RECOMMENDED QUESTION MIX (AI Engineer):
- 4-5 Questions: Model inference dynamics, sampling parameters (temperature, top_p), and tokenizer mechanics.
- 4-5 Questions: Model family comparisons, architecture trade-offs, and context window management.
- 3-4 Questions: Hallucination causes, mitigation strategies, and AI evaluation metrics.
- 2-3 Questions: Production AI application engineering and chat completions integration.`;
  } else {
    roleEmphasis =
      'EMPHASIS: Ground scenarios in robust software development, ' +
      'application architecture, algorithmic edge cases, system design, ' +
      'performance/complexity trade-offs, and clean maintainable code.';

    roleLens = `ROLE PERSPECTIVE (Software Developer):
You are evaluating a Software Developer who integrates LLMs and external APIs into resilient, production-grade applications and distributed systems.
- CORE RESPONSIBILITIES & ASSESSMENT ANGLES:
  * API Integration & Client Resilience: Structuring HTTP requests, setting headers, handling status codes (401, 404, 429 rate limits, 500, 503), timeouts, retries with exponential backoff, and circuit breakers.
  * Application Architecture: Encapsulating LLM API calls in clean service wrappers, dependency injection, keeping secrets out of code, and decoupling third-party SDK dependencies.
  * Practical Code & Debugging: Parsing JSON responses, schema validation to prevent downstream crashes, streaming tokens vs blocking HTTP calls, and managing API response payloads.
  * Performance, Latency & Cost: Minimizing API round-trip latency, connection pooling, tracking token budgets in backend services, and handling rate limits under concurrent traffic.
  * Defensive Programming: Graceful degradation when the AI service is unreachable, input validation, and sanitizing outputs before writing to databases or presenting to clients.
- ANTI-PATTERNS TO AVOID:
  * Do NOT ask deep theoretical ML math or model training equations. Focus on software engineering, API resilience, error handling, clean architecture, and debugging.`;

    roleQuestionMix = `RECOMMENDED QUESTION MIX (Software Developer):
- 4-5 Questions: API integration, client resilience, handling HTTP error codes (especially 429 rate limits), timeouts, and retry logic.
- 4-5 Questions: Application architecture, parsing/validating JSON payloads, defensive error handling, and debugging code snippets.
- 3-4 Questions: Performance trade-offs (streaming vs blocking, latency, connection management, token budget monitoring).
- 2-3 Questions: Core concepts and Chat Completions API patterns.`;
  }

  const system = `You are a strict technical assessment evaluator generating a rigorous, role-tailored multiple-choice quiz for students.
CRITICAL ROLE DIFFERENTIATION DIRECTIVE:
1. PERSONALIZED ROLE ASSESSMENT:
   - This quiz is strictly tailored for a candidate pursuing the "${roleName}" role.
   - The questions must assess the topic through the specific operational lens, technical responsibilities, and practical challenges of a ${roleName}.
2. NO GENERIC QUIZZES:
   - DO NOT generate generic, one-size-fits-all questions that could apply equally to any tech job.
   - Avoid generic trivia (e.g., asking "What company created Claude?").
   - If two different candidates (e.g., a Software Developer and an AI Engineer) take a quiz on this same topic, their quizzes MUST distinctly reflect their respective roles.
   - Prioritize concepts, challenges, and scenarios that are most relevant to this specific role. Avoid repeating generic questions across roles when the role context supports a role-specific alternative.
STRICT GROUNDING RULES:
- Base all questions strictly on the provided TOPIC OUTLINE.
- Do NOT invent external, trivia, or unrelated knowledge outside the supplied outline.
- For each outline point, apply the ${roleName} lens to generate questions on that specific concept.
MANDATORY ASSESSMENT RULES:
- Generate exactly ${targetCount} questions, or otherwise a valid number between 15 and 20.
- Prefer exactly 15 for predictable generation.
- Never return fewer than 15.
- Never return more than 20.
- Return exactly 4 options for every question.
- Return EXACTLY 4 plausible strings in the options array for every question.
- correctOptionIndex must be an integer from 0 to 3.
- Every question must include an explanation string explaining briefly why the correct option is correct, grounded in the supplied outline.
- Do not refer to option letters in explanations because options may be shuffled.
- Return only the expected JSON structure.
- Do not add explanations or markdown outside the JSON.
Outline Distribution:
- The provided outline contains ${outlineLength} points.
- To reach ${targetCount} questions without inventing external topics, you MUST generate approximately ${questionsPerPoint} to ${questionsPerPoint + 1} distinct questions per outline point, thoroughly testing different dimensions of each point.
- Include a balanced variety across:
  a) Theory & Core Concepts (from the ${roleName} perspective)
  b) Real-World Scenario Analysis (tailored to the target role)
  c) Technical Interview Questions
  d) Practical Application & Debugging
  e) Code / Pseudocode analysis (only where appropriate for the topic and role)
Output MUST be valid JSON in this exact shape:
{"questions": [{"id": "q1", "question": "...", "options": ["...", "...", "...", "..."], "correctOptionIndex": 0, "explanation": "Briefly explain why the correct option is correct."}]}`;

  const prompt = `ROLE:
${roleName}
TARGET ROLE: ${roleName}
ROLE DESCRIPTION: ${roleDescription || 'Career readiness pathway'}
TOPIC:
${topic.id || 'topic'}
TOPIC NAME:
${topic.name || 'Technical Assessment'}
TRACK:
${topicTrack}
ROLE PRIORITY:
${topicPriority}
PREREQUISITE TOPICS:
${prerequisitesText}
ROLE-SPECIFIC TOPIC CONTEXT:
${roleSpecificContext}
ROLE PERSPECTIVE & ASSESSMENT LENS:
${roleLens}
${roleEmphasis}
${roleQuestionMix}
TOPIC OUTLINE (${outlineLength} points):
${outlineText}
TASK:
Generate a rigorous, role-personalized multiple-choice assessment of exactly ${targetCount} questions grounded strictly in the topic outline above.
STRICT INSTRUCTIONS:
- Generate exactly ${targetCount} questions, or otherwise a valid number between 15 and 20.
- Prefer exactly 15 for predictable generation.
- Never return fewer than 15.
- Never return more than 20.
- Return exactly 4 options for every question.
- Return EXACTLY 4 plausible strings in the options array for every question.
- correctOptionIndex must be an integer from 0 to 3.
- Every question must include a non-empty explanation string explaining why the correct option is correct, grounded in the supplied outline.
- Do not refer to option letters in explanations because options will be shuffled.
- ROLE DIFFERENTIATION: Strongly tailor the questions, scenarios, and options to the ${roleName} role as described above. Do NOT generate generic questions that could belong to any other role.
- OUTLINE DISTRIBUTION: The outline contains ${outlineLength} points. You MUST produce multiple distinct questions (approximately ${questionsPerPoint} to ${questionsPerPoint + 1} distinct questions per outline point) covering the specific angles detailed in the role lens.
- GROUNDING: Base every question strictly on the outline points above. Do not invent external frameworks or unrelated concepts.
- Return only the expected JSON structure.
- Do not add explanations or markdown outside the JSON.`;

  return {
    system,
    prompt,
  };
}

/**
 * Validates the parsed LLM quiz output.
 */
function validateQuizData(parsed, expectedCount = 15) {
  if (!parsed || !Array.isArray(parsed.questions)) {
    throw new Error(
      'LLM output missing top-level "questions" array.'
    );
  }

  const { questions } = parsed;

  if (questions.length < 15 || questions.length > 20) {
    throw new Error(
      `Quiz questions count must be between 15 and 20. ` +
      `Received ${questions.length}.`
    );
  }

  const seenIds = new Set();

  questions.forEach((question, index) => {
    if (!question || typeof question !== 'object') {
      throw new Error(
        `Question at index ${index} is not an object.`
      );
    }

    if (!question.id || typeof question.id !== 'string') {
      throw new Error(
        `Question at index ${index} is missing a valid string "id".`
      );
    }

    if (seenIds.has(question.id)) {
      throw new Error(
        `Duplicate question id "${question.id}" detected at index ${index}.`
      );
    }

    seenIds.add(question.id);

    if (
      !question.question ||
      typeof question.question !== 'string' ||
      question.question.trim().length < 5
    ) {
      throw new Error(
        `Question at index ${index} has invalid or empty question text.`
      );
    }

    if (
      !Array.isArray(question.options) ||
      question.options.length !== 4
    ) {
      throw new Error(
        `Question at index ${index} must contain exactly 4 options.`
      );
    }

    for (const option of question.options) {
      if (
        typeof option !== 'string' ||
        option.trim().length === 0
      ) {
        throw new Error(
          `Question at index ${index} contains an empty option string.`
        );
      }
    }

    if (
      typeof question.correctOptionIndex !== 'number' ||
      question.correctOptionIndex < 0 ||
      question.correctOptionIndex > 3 ||
      !Number.isInteger(question.correctOptionIndex)
    ) {
      throw new Error(
        `Question at index ${index} has invalid correctOptionIndex: ` +
        `${question.correctOptionIndex}. Must be 0, 1, 2, or 3.`
      );
    }

    // Explanations are requested from the LLM, but optional for older
    // quizzes and test fixtures. Submission feedback uses a safe fallback.
    question.explanation =
      typeof question.explanation === 'string'
        ? question.explanation.trim()
        : '';
  });

  return questions;
}

/**
 * Randomizes a question's options while preserving the correct answer index.
 */
function shuffleQuestionOptions(question) {
  const options = question.options.map((text, originalIndex) => ({
    text,
    originalIndex,
  }));

  // Fisher-Yates shuffle
  for (let index = options.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(
      Math.random() * (index + 1)
    );

    [options[index], options[randomIndex]] = [
      options[randomIndex],
      options[index],
    ];
  }

  const correctOptionIndex = options.findIndex(
    (option) =>
      option.originalIndex === question.correctOptionIndex
  );

  return {
    ...question,
    options: options.map((option) => option.text),
    correctOptionIndex,
  };
}

/**
 * Parses an LLM response into a JSON object.
 */
function parseQuizResponse(rawResponse) {
  if (
    rawResponse &&
    typeof rawResponse === 'object' &&
    !Array.isArray(rawResponse)
  ) {
    return rawResponse;
  }

  if (typeof rawResponse !== 'string') {
    throw new Error('LLM response must be a JSON string or object.');
  }

  let text = rawResponse.trim();

  text = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  return JSON.parse(text);
}

/**
 * Checks whether generated questions and answers are supported by
 * the topic outline. This screening step is not a guarantee of accuracy.
 */
async function verifyQuizGrounding({ topic, questions }) {
  const provider = (
    process.env.LLM_PROVIDER || 'mock'
  ).toLowerCase();

  if (provider === 'mock') {
    return {
      verified: false,
      skipped: true,
      issues: [],
    };
  }

  const outline = Array.isArray(topic.outline)
    ? topic.outline
    : [];

  if (outline.length === 0) {
    throw new Error(
      'Cannot verify quiz grounding because the topic outline is empty.'
    );
  }

  const outlineText = outline
    .map((point, index) => `${index + 1}. ${point.point}`)
    .join('\n');

  const questionsForReview = questions.map((question) => ({
    id: question.id,
    question: question.question,
    options: question.options,
    correctOptionIndex: question.correctOptionIndex,
    explanation: question.explanation,
  }));

  const system = `
You are a strict technical quiz reviewer.
Check every question against the supplied topic outline.
Determine whether:
1. The question is answerable using the outline.
2. The correctOptionIndex points to an option supported by the outline.
3. The explanation agrees with the outline and selected correct answer.
4. The question does not require unrelated knowledge absent from the outline.
Do not assume a question is supported merely because it mentions a keyword
from the outline. Flag unsupported claims, ambiguous questions, incorrect
answer keys, and explanations that are not supported.
Return only valid JSON in this exact shape:
{
  "supported": true,
  "issues": [
    {
      "questionId": "q1",
      "reason": "Brief description of the unsupported or incorrect content."
    }
  ]
}
If all questions pass, return supported=true and an empty issues array.
If any question fails, return supported=false and list each failed question.
`;

  const prompt = `
TOPIC:
${topic.name || topic.id || 'Unnamed topic'}
TOPIC OUTLINE:
${outlineText}
QUESTIONS TO REVIEW:
${JSON.stringify(questionsForReview)}
Review every question and return only the required JSON object.
`;

  const rawResponse = await llmService.callLLM({
    system,
    prompt,
    mockKind: 'generic',
    temperature: 0.1,
  });

  const result = parseQuizResponse(rawResponse);

  if (
    !result ||
    typeof result.supported !== 'boolean' ||
    !Array.isArray(result.issues)
  ) {
    throw new Error(
      'Grounding verifier returned an invalid response structure.'
    );
  }

  for (const issue of result.issues) {
    if (
      !issue ||
      typeof issue.questionId !== 'string' ||
      typeof issue.reason !== 'string'
    ) {
      throw new Error(
        'Grounding verifier returned an invalid issue entry.'
      );
    }
  }

  if (result.supported && result.issues.length > 0) {
    throw new Error(
      'Grounding verifier returned conflicting results.'
    );
  }

  if (!result.supported && result.issues.length === 0) {
    throw new Error(
      'Grounding verifier rejected the quiz without identifying any issues.'
    );
  }

  return {
    verified: result.supported,
    skipped: false,
    issues: result.issues,
  };
}

/**
 * Generates and validates a quiz.
 * Allows one repair attempt if the first output fails validation.
 */
async function generateValidatedQuizQuestions({
  system,
  prompt,
  topic,
  targetQuestionCount,
}) {
  let previousResponse = '';
  let previousError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    let requestPrompt = prompt;

    if (attempt === 1) {
      requestPrompt += `
REPAIR REQUEST:
Your previous quiz response did not pass validation.
Problems to correct:
${previousError}
Previous response:
${previousResponse}
Return a complete corrected quiz JSON object.
Keep the questions grounded in the supplied topic outline.
Follow every required schema rule, including exactly four options
per question, a valid correctOptionIndex, and a non-empty explanation
for each question. Do not include Markdown or text outside the JSON.
`;
    }

    let rawResponse;

    try {
      rawResponse = await llmService.callLLM({
        system,
        prompt: requestPrompt,
        mockKind: 'quiz',
        temperature: 0.2,
      });
    } catch (error) {
      throw new Error(
        `LLM service call failed: ${error.message}`
      );
    }

    try {
      const parsed = parseQuizResponse(rawResponse);

      const validatedQuestions = validateQuizData(
        parsed,
        targetQuestionCount
      );

      const grounding = await verifyQuizGrounding({
        topic,
        questions: validatedQuestions,
      });

      if (!grounding.skipped && !grounding.verified) {
        const issueSummary = grounding.issues
          .map(
            (issue) =>
              `${issue.questionId}: ${issue.reason}`
          )
          .join('\n');

        throw new Error(
          `Grounding verification failed:\n${issueSummary}`
        );
      }

      return validatedQuestions;
    } catch (error) {
      previousResponse =
        typeof rawResponse === 'string'
          ? rawResponse
          : JSON.stringify(rawResponse);

      previousError =
        error.message || 'Unknown validation error';

      if (attempt === 1) {
        throw new Error(
          `Generated quiz failed structure validation: ${previousError}`
        );
      }
    }
  }

  throw new Error('Quiz generation failed.');
}

/**
 * Generates a quiz for a topic or returns the cached quiz.
 */
async function generateOrGetQuiz({
  topicId,
  userId = 'dev-user-1',
  roleId,
  roleName,
}) {
  if (!topicId) {
    throw {
      statusCode: 400,
      code: 'INVALID_INPUT',
      message: 'topicId is required.',
    };
  }

  const resolvedRole = await resolveRoleContext({
    userId,
    roleId,
    roleName,
    topicId,
  });

  const activeRoleId = resolvedRole.roleId;
  const activeRoleName = resolvedRole.roleName;
  const activeRole = resolvedRole.role;

  const { topic } = await resolveTopic({
    topicId,
    role: activeRole,
  });

  if (!topic) {
    throw {
      statusCode: 404,
      code: 'TOPIC_NOT_FOUND',
      message:
        `Topic with ID "${topicId}" was not found in the curriculum.`,
    };
  }

  if (topic.quizEligible === false) {
    throw {
      statusCode: 400,
      code: 'TOPIC_NOT_QUIZ_ELIGIBLE',
      message:
        `Topic "${topic.name || topicId}" is not designated as quiz-eligible.`,
    };
  }

  // Cache is isolated by topic and role.
  const cachedQuiz = await Quiz.findOne({
    topicId,
    roleId: activeRoleId,
  }).lean();

  if (cachedQuiz) {
    return {
      quiz: cachedQuiz,
      cached: true,
    };
  }

  const targetQuestionCount = scaleQuestionCount(topic);

  const { system, prompt } = buildQuizPrompt({
    topic,
    role: activeRole,
    roleId: activeRoleId,
    roleName: activeRoleName,
    roleDescription: activeRole ? activeRole.description : '',
    questionCount: targetQuestionCount,
  });

  // Generate, validate, and check grounding. One repair attempt maximum.
  let validatedQuestions;

  try {
    validatedQuestions = await generateValidatedQuizQuestions({
      system,
      prompt,
      topic,
      targetQuestionCount,
    });

    // Shuffle only after validation and grounding checks.
    // The correct answer index is remapped automatically.
    validatedQuestions = validatedQuestions.map(
      shuffleQuestionOptions
    );
  } catch (error) {
    throw {
      statusCode: 502,
      code: 'QUIZ_GENERATION_FAILED',
      message: error.message || 'Unable to generate a valid quiz.',
    };
  }

  // Save the shuffled quiz. Cached quizzes retain their saved option order.
  const createdQuiz = await Quiz.create({
    topicId,
    roleId: activeRoleId,
    roleName: activeRoleName,
    questions: validatedQuestions,
    questionCount: validatedQuestions.length,
    generatedAt: new Date(),
  });

  return {
    quiz: createdQuiz.toObject(),
    cached: false,
  };
}

/**
 * Evaluates cooldown and attempt constraints.
 */
async function checkAttemptEligibility({ userId, topicId }) {
  const lastAttempt = await QuizAttempt.findOne({
    userId,
    topicId,
  })
    .sort({ attemptedAt: -1 })
    .lean();

  if (!lastAttempt) {
    return {
      canAttempt: true,
      nextAttemptNumber: 1,
    };
  }

  if (
    lastAttempt.attemptNumber >= MAX_ATTEMPTS &&
    lastAttempt.passed === false
  ) {
    throw {
      statusCode: 400,
      code: 'MAX_ATTEMPTS_REACHED',
      message: 'Maximum quiz attempts reached for this topic.',
    };
  }

  if (lastAttempt.passed === false) {
    const cooldownMs =
      COOLDOWN_HOURS * 60 * 60 * 1000;

    const elapsed =
      Date.now() -
      new Date(lastAttempt.attemptedAt).getTime();

    if (elapsed < cooldownMs) {
      const remainingHours = Math.ceil(
        (cooldownMs - elapsed) / (60 * 60 * 1000)
      );

      throw {
        statusCode: 400,
        code: 'COOLDOWN_ACTIVE',
        message:
          `Please wait ${remainingHours} more hour(s) before retrying.`,
      };
    }
  }

  const nextAttemptNumber =
    lastAttempt.attemptNumber + 1;

  if (nextAttemptNumber > MAX_ATTEMPTS) {
    throw {
      statusCode: 400,
      code: 'MAX_ATTEMPTS_REACHED',
      message: 'Maximum quiz attempts reached for this topic.',
    };
  }

  return {
    canAttempt: true,
    nextAttemptNumber,
  };
}

/**
 * Scores a submitted quiz, checks attempts/cooldown, saves the attempt,
 * and triggers integrations on a passing score.
 */
async function submitQuizAttempt({
  userId = 'dev-user-1',
  quizId,
  topicId,
  answers,
}) {
  if (!quizId || !topicId || !Array.isArray(answers)) {
    throw {
      statusCode: 400,
      code: 'INVALID_INPUT',
      message:
        'quizId, topicId, and an array of numeric answers are required.',
    };
  }

  const quiz = await Quiz.findById(quizId)
    .lean()
    .catch(() => null);

  if (!quiz) {
    throw {
      statusCode: 404,
      code: 'QUIZ_NOT_FOUND',
      message: `No quiz found with ID: ${quizId}`,
    };
  }

  if (quiz.topicId !== topicId) {
    throw {
      statusCode: 400,
      code: 'TOPIC_MISMATCH',
      message:
        `Submitted topicId "${topicId}" does not match ` +
        `quiz topicId "${quiz.topicId}".`,
    };
  }

  if (answers.length !== quiz.questions.length) {
    throw {
      statusCode: 400,
      code: 'INVALID_ANSWERS',
      message:
        `Expected ${quiz.questions.length} answers, ` +
        `but received ${answers.length}.`,
    };
  }

  for (let index = 0; index < answers.length; index++) {
    const answer = answers[index];

    if (
      typeof answer !== 'number' ||
      answer < 0 ||
      answer > 3 ||
      !Number.isInteger(answer)
    ) {
      throw {
        statusCode: 400,
        code: 'INVALID_ANSWERS',
        message:
          `Answer at index ${index} is invalid (${answer}). ` +
          'Must be an integer between 0 and 3.',
      };
    }
  }

  const { nextAttemptNumber } =
    await checkAttemptEligibility({
      userId,
      topicId,
    });

  let correctCount = 0;
  const wrongQuestionIndices = [];

  quiz.questions.forEach((question, index) => {
    if (answers[index] === question.correctOptionIndex) {
      correctCount++;
    } else {
      wrongQuestionIndices.push(index);
    }
  });

  // Correct answers and explanations are included only after submission.
  const feedback = quiz.questions.map((question, index) => {
    const selectedOptionIndex = answers[index];

    const isCorrect =
      selectedOptionIndex === question.correctOptionIndex;

    return {
      questionId: question.id,
      question: question.question,
      selectedOptionIndex,
      selectedOption: question.options[selectedOptionIndex],
      correctOptionIndex: question.correctOptionIndex,
      correctOption: question.options[question.correctOptionIndex],
      isCorrect,
      explanation:
        question.explanation ||
        'No explanation is available for this question.',
    };
  });

  const score = Math.round(
    (correctCount / quiz.questions.length) * 100
  );

  const passed = score >= PASSING_SCORE;

  const attempt = await QuizAttempt.create({
    userId,
    quizId,
    topicId,
    roleId: quiz.roleId,
    answers,
    score,
    passed,
    attemptNumber: nextAttemptNumber,
    attemptedAt: new Date(),
  });

  let integrationResults = {
    skillVerified: false,
    badgeIssued: false,
  };

  if (passed) {
    const { topic } = await resolveTopic({
      topicId,
    });

    const topicTitle = topic
      ? topic.name
      : topicId;

    const skillRes =
      await integrationService.verifySkillWithPersonA({
        userId,
        topicId,
      });

    integrationResults.skillVerified =
      skillRes.success;

    const badgeRes =
      await integrationService.issueBadgeWithPersonC({
        userId,
        topicId,
        title: topicTitle,
        quizScore: score,
      });

    integrationResults.badgeIssued =
      badgeRes.success;
  }

  return {
    attempt: attempt.toObject(),
    score,
    passed,
    correctCount,
    totalQuestions: quiz.questions.length,
    wrongQuestionIndices,
    feedback,
    integrationResults,
  };
}

/**
 * Checks whether a topic has been fully completed by the user.
 */
async function isTopicFullyCompleted(userId, topicId) {
  const roadmap = await Roadmap.findOne({
    userId,
  }).lean();

  if (!roadmap) return false;

  const role = await Role.findById(roadmap.targetRoleId)
    .lean()
    .catch(() => null);

  if (!role) return false;

  const roleTopics = Array.isArray(role.topics)
    ? role.topics
    : [];

  const topic = roleTopics.find(
    (item) => item.id === topicId
  );

  if (!topic || !Array.isArray(topic.outline)) {
    return false;
  }

  const requiredOutlineCount = topic.outline.length;

  if (requiredOutlineCount === 0) {
    return true;
  }

  let completedCount = 0;
  const completedChunkIndices = new Set();

  (roadmap.days || []).forEach((day) => {
    (day.tasks || []).forEach((task) => {
      const isMatchingTopic =
        task.topicId === topicId ||
        (
          task.id &&
          task.id.startsWith(`${topicId}::`)
        );

      if (
        isMatchingTopic &&
        (
          task.status === 'completed' ||
          task.status === 'verified'
        )
      ) {
        if (task.id && task.id.includes('::')) {
          const parts = task.id.split('::');
          const index = parseInt(parts[1], 10);

          if (!Number.isNaN(index)) {
            completedChunkIndices.add(index);
          }
        }

        completedCount++;
      }
    });
  });

  return (
    completedChunkIndices.size >= requiredOutlineCount ||
    completedCount >= requiredOutlineCount
  );
}

module.exports = {
  COOLDOWN_HOURS,
  PASSING_SCORE,
  MAX_ATTEMPTS,
  resolveRoleContext,
  resolveTopic,
  scaleQuestionCount,
  buildQuizPrompt,
  validateQuizData,
  shuffleQuestionOptions,
  generateOrGetQuiz,
  checkAttemptEligibility,
  submitQuizAttempt,
  isTopicFullyCompleted,
};