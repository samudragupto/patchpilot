/**
 * Jest Setup File
 * 
 * This file runs before each test suite to configure the testing environment
 */

// Import Jest DOM matchers
import '@testing-library/jest-dom'

// Mock environment variables
process.env.WATSONX_API_KEY = 'test-api-key'
process.env.WATSONX_PROJECT_ID = 'test-project-id'
process.env.WATSONX_REGION = 'us-south'
process.env.WATSONX_MODEL = 'ibm/granite-13b-chat-v2'

// Mock fetch globally
global.fetch = jest.fn()

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
}

// Reset all mocks after each test
afterEach(() => {
  jest.clearAllMocks()
})

// Provide mock plain objects to prevent next/server from throwing ReferenceError
if (typeof global.Request === 'undefined') {
  global.Request = class Request {};
}
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    static json(data, init) {
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map([['content-type', 'application/json']]),
        ok: (init?.status || 200) < 300
      };
    }
  };
}
if (typeof global.Headers === 'undefined') {
  global.Headers = class Headers {};
}

// Made with Bob
