// server/src/services/llm.service.js
//
// Provider-agnostic LLM wrapper.
// Provider SDKs should only be imported inside this file.
//
// MOCK MODE:
// If LLM_PROVIDER is unset or set to "mock", canned responses are returned
// so that features can be tested without a real API key.

const PROVIDER = (process.env.LLM_PROVIDER || 'mock').toLowerCase();

/**
 * Calls the configured LLM provider.
 *
 * @param {string} system - System prompt and instructions.
 * @param {string} prompt - User-turn content.
 * @param {string} mockKind - Which canned response to return in mock mode.
 * @param {number} temperature - Optional generation temperature.
 * @returns {Promise<string>} Raw model response.
 */
async function callLLM({
  system,
  prompt,
  mockKind = 'generic',
  temperature,
}) {
  switch (PROVIDER) {
    case 'anthropic':
      return callAnthropic({
        system,
        prompt,
      });

    case 'groq':
      return callGroq({
        system,
        prompt,
        temperature,
      });

    case 'mock':
    default:
      return callMock({
        system,
        prompt,
        mockKind,
      });
  }
}

/**
 * Anthropic implementation.
 *
 * This provider is intentionally not implemented in the current codebase.
 * Use LLM_PROVIDER=mock for development or implement this function when
 * the team decides to configure Anthropic.
 */
async function callAnthropic({ system, prompt }) {
  // Example implementation, when the team is ready:
  //
  // const Anthropic = require('@anthropic-ai/sdk');
  // const client = new Anthropic({
  //   apiKey: process.env.LLM_API_KEY,
  // });
  //
  // const response = await client.messages.create({
  //   model: 'claude-sonnet-4-6',
  //   max_tokens: 2000,
  //   system,
  //   messages: [
  //     {
  //       role: 'user',
  //       content: prompt,
  //     },
  //   ],
  // });
  //
  // return response.content
  //   .map((block) => block.text || '')
  //   .join('\n');

  throw new Error(
    'Anthropic provider not yet implemented. ' +
      'Set LLM_PROVIDER=mock for development, or implement callAnthropic().'
  );
}

/**
 * Groq implementation.
 * Requires the groq-sdk package and LLM_API_KEY in the environment.
 */
async function callGroq({ system, prompt, temperature }) {
  const Groq = require('groq-sdk');

  const client = new Groq({
    apiKey: process.env.LLM_API_KEY,
  });

  const request = {
    model: 'openai/gpt-oss-120b',

    messages: [
      {
        role: 'system',
        content: system,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],

    response_format: {
      type: 'json_object',
    },
  };

  // Only include temperature when the caller explicitly provides it.
  if (typeof temperature === 'number') {
    request.temperature = temperature;
  }

  const response = await client.chat.completions.create(request);

  return response.choices[0].message.content;
}

/**
 * Canned mock responses used when LLM_PROVIDER=mock.
 *
 * These responses are for structural testing only.
 * They are not intended to be used as real educational content.
 */
const MOCK_RESPONSES = {
  resumeSkills: JSON.stringify({
    skills: [
      {
        topicId: 'python-fundamentals',
        name: 'Python',
        confidence: 'high',
      },
      {
        topicId: 'sql-fundamentals',
        name: 'SQL',
        confidence: 'medium',
      },
    ],
  }),

  dailyTasks: JSON.stringify({
    tasks: [
      {
        taskName: '[MOCK] Sample task for this subtopic',
        description:
          '[MOCK] This is placeholder text from llm.service mock mode.',
      },
    ],
  }),

  quiz: JSON.stringify({
    questions: Array.from({ length: 15 }, (_, i) => ({
      id: `q${i + 1}`,

      question:
        `[MOCK] Sample Question ${i + 1} — ` +
        'replace once a real provider is configured.',

      options: [
        `Option A for Q${i + 1}`,
        `Option B for Q${i + 1}`,
        `Option C for Q${i + 1}`,
        `Option D for Q${i + 1}`,
      ],

      correctOptionIndex: i % 4,

      explanation:
        'This is a placeholder explanation for testing the quiz response structure.',
    })),
  }),

  generic: JSON.stringify({
    note:
      '[MOCK] llm.service is running in mock mode. ' +
      'Set LLM_PROVIDER in .env to use a real provider.',
  }),
};

/**
 * Returns the canned response for the requested feature.
 */
async function callMock({ system, prompt, mockKind }) {
  console.warn(
    `[llm.service] LLM_PROVIDER is "${PROVIDER}". ` +
      `Returning MOCK response (kind: "${mockKind}"). ` +
      'Set LLM_PROVIDER in your .env to use a real provider.'
  );

  return MOCK_RESPONSES[mockKind] || MOCK_RESPONSES.generic;
}

module.exports = {
  callLLM,
};