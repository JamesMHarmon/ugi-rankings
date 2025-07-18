// Global test timeout
jest.setTimeout(30000);

// Setup environment variables for testing
process.env.NODE_ENV = 'test';
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_DB = 'test_ugi_rankings';
process.env.POSTGRES_USER = 'test';
process.env.POSTGRES_PASSWORD = 'test';

// Mock console to reduce noise during tests
global.console = {
    ...console,
    // Suppress info logs during tests
    log: jest.fn(),
    info: jest.fn(),
    // Keep error and warn for debugging
    error: console.error,
    warn: console.warn,
};
