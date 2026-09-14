// server/src/services/llm.service.js
//
// PROVIDER-AGNOSTIC LLM WRAPPER.
// No other file in this codebase should import an LLM provider SDK directly
// (no `require('@anthropic-ai/sdk')`, no `require('groq-sdk')` outside this
// file). Everything routes through callLLM() below, which picks the actual
// provider based on the LLM_PROVIDER environment variable. This means
// switching providers later is a one-file change, not a codebase-wide one.
//
// MOCK MODE: if LLM_PROVIDER is unset (or set to "mock"), this returns a
// canned, structurally-valid response instead of calling a real API — so
// resume parsing, task-wording, and quiz generation can all be built and
// tested end-to-end before the team finalizes which provider to use.

const PROVIDER = (process.env.LLM_PROVIDER || 'mock').toLowerCase();

// ---------------------------------------------------------------------------
// Low-level entry point. Every feature-level helper (resume parsing, task
// wording, quiz generation) should call this, not a provider SDK directly.
//
// @param {string} system - system prompt / instructions
// @param {string} prompt - the actual user-turn content
// @param {string} mockKind - which canned mock response to return in mock
//   mode (see MOCK_RESPONSES below) — ignored for real providers
// @returns {Promise<string>} raw text response from the model (the caller
//   is responsible for JSON.parse-ing it if a structured response was asked for)
// ---------------------------------------------------------------------------
async function callLLM({ system, prompt, mockKind = 'generic' }) {
  switch (PROVIDER) {
    case 'anthropic':
      return callAnthropic({ system, prompt });
    case 'groq':
      return callGroq({ system, prompt });
    case 'mock':
    default:
      return callMock({ system, prompt, mockKind });
  }
}

// ---------------------------------------------------------------------------
// Anthropic implementation — TODO: fill in once the team confirms this
// provider. Requires `npm install @anthropic-ai/sdk` and ANTHROPIC_API_KEY
// (or whatever LLM_API_KEY maps to) set in the environment.
// ---------------------------------------------------------------------------
async function callAnthropic({ system, prompt }) {
  // const Anthropic = require('@anthropic-ai/sdk');
  // const client = new Anthropic({ apiKey: process.env.LLM_API_KEY });
  // const response = await client.messages.create({
  //   model: 'claude-sonnet-4-6',
  //   max_tokens: 2000,
  //   system,
  //   messages: [{ role: 'user', content: prompt }],
  // });
  // return response.content.map(block => block.text || '').join('\n');
  throw new Error('Anthropic provider not yet implemented — set LLM_PROVIDER=mock for development, or fill in callAnthropic().');
}

// ---------------------------------------------------------------------------
// Groq implementation — TODO: fill in once the team confirms this provider.
// Requires `npm install groq-sdk` and LLM_API_KEY set.
// ---------------------------------------------------------------------------
async function callGroq({ system, prompt }) {
  // const Groq = require('groq-sdk');
  // const client = new Groq({ apiKey: process.env.LLM_API_KEY });
  // const response = await client.chat.completions.create({
  //   model: 'llama-3.3-70b-versatile', // or whichever model the team picks
  //   messages: [
  //     { role: 'system', content: system },
  //     { role: 'user', content: prompt },
  //   ],
  // });
  // return response.choices[0].message.content;
  throw new Error('Groq provider not yet implemented — set LLM_PROVIDER=mock for development, or fill in callGroq().');
}

// ---------------------------------------------------------------------------
// Mock implementation — used automatically when LLM_PROVIDER is unset.
// Returns structurally-valid canned JSON so downstream parsing code can be
// built and tested without a real API key.
// ---------------------------------------------------------------------------
const MOCK_RESPONSES = {
  resumeSkills: JSON.stringify({
    skills: [
      { topicId: 'python-fundamentals', name: 'Python', confidence: 'high' },
      { topicId: 'sql-fundamentals', name: 'SQL', confidence: 'medium' },
    ],
  }),
  dailyTasks: JSON.stringify({
    tasks: [
      {
        taskName: '[MOCK] Sample task for this subtopic',
        description: '[MOCK] This is placeholder text from llm.service mock mode — replace once a real provider is configured.',
      },
    ],
  }),
  quiz: JSON.stringify({
    questions: [
      {
        id: 'q1',
        question: '[MOCK] Sample question — replace once a real provider is configured.',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctOptionIndex: 0,
      },
    ],
  }),
  generic: JSON.stringify({ note: '[MOCK] llm.service is running in mock mode. Set LLM_PROVIDER in .env to use a real provider.' }),
};

async function callMock({ system, prompt, mockKind }) {
  console.warn(`[llm.service] LLM_PROVIDER not set — returning MOCK response (kind: "${mockKind}"). Set LLM_PROVIDER in your .env to use a real provider.`);
  return MOCK_RESPONSES[mockKind] || MOCK_RESPONSES.generic;
}

module.exports = { callLLM };