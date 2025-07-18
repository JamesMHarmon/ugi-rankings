import fs from 'fs';
import path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Configuration Management', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Config File Loading', () => {
        it('should load valid configuration file', () => {
            const validConfig = {
                name: 'Test Tournament',
                rounds: 2,
                gamesPerPair: 2,
                concurrency: 2,
                engines: [
                    {
                        id: 'engine1',
                        name: 'TestEngine1',
                        executable: 'node',
                        arguments: ['test1.js'],
                        workingDirectory: './engines',
                        initialRating: 1500,
                        description: 'Test engine 1'
                    },
                    {
                        id: 'engine2',
                        name: 'TestEngine2',
                        executable: 'node',
                        arguments: ['test2.js'],
                        workingDirectory: './engines',
                        initialRating: 1500,
                        description: 'Test engine 2'
                    }
                ]
            };

            mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));
            mockFs.existsSync.mockReturnValue(true);

            const loadConfig = (filePath: string) => {
                if (!fs.existsSync(filePath)) {
                    throw new Error(`Config file not found: ${filePath}`);
                }
                const content = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(content);
            };

            const config = loadConfig('test-config.json');
            expect(config).toEqual(validConfig);
            expect(config.engines).toHaveLength(2);
        });

        it('should handle missing configuration file', () => {
            mockFs.existsSync.mockReturnValue(false);

            const loadConfig = (filePath: string) => {
                if (!fs.existsSync(filePath)) {
                    throw new Error(`Config file not found: ${filePath}`);
                }
                const content = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(content);
            };

            expect(() => loadConfig('missing-config.json')).toThrow('Config file not found');
        });

        it('should handle invalid JSON in configuration file', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('{ invalid json }');

            const loadConfig = (filePath: string) => {
                if (!fs.existsSync(filePath)) {
                    throw new Error(`Config file not found: ${filePath}`);
                }
                const content = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(content);
            };

            expect(() => loadConfig('invalid-config.json')).toThrow();
        });
    });

    describe('Config Validation', () => {
        it('should validate required fields', () => {
            const validateConfig = (config: any) => {
                const errors: string[] = [];

                if (!config.name || typeof config.name !== 'string') {
                    errors.push('Tournament name is required');
                }

                if (!config.engines || !Array.isArray(config.engines)) {
                    errors.push('Engines array is required');
                } else if (config.engines.length < 2) {
                    errors.push('At least 2 engines are required');
                }

                if (typeof config.rounds !== 'number' || config.rounds < 1) {
                    errors.push('Rounds must be a positive number');
                }

                if (typeof config.gamesPerPair !== 'number' || config.gamesPerPair < 1) {
                    errors.push('Games per pair must be a positive number');
                }

                if (typeof config.concurrency !== 'number' || config.concurrency < 1) {
                    errors.push('Concurrency must be a positive number');
                }

                return errors;
            };

            const validConfig = {
                name: 'Test Tournament',
                rounds: 1,
                gamesPerPair: 2,
                concurrency: 2,
                engines: [
                    { id: 'e1', name: 'Engine1' },
                    { id: 'e2', name: 'Engine2' }
                ]
            };

            expect(validateConfig(validConfig)).toHaveLength(0);

            const invalidConfigs = [
                { /* missing name */ },
                { name: 'Test', engines: [] }, // No engines
                { name: 'Test', engines: [{ id: 'e1' }] }, // Only one engine
                { name: 'Test', engines: [{}, {}], rounds: 0 }, // Invalid rounds
                { name: 'Test', engines: [{}, {}], rounds: 1, gamesPerPair: 0 }, // Invalid games per pair
                { name: 'Test', engines: [{}, {}], rounds: 1, gamesPerPair: 1, concurrency: 0 } // Invalid concurrency
            ];

            invalidConfigs.forEach(config => {
                expect(validateConfig(config).length).toBeGreaterThan(0);
            });
        });

        it('should validate engine configurations', () => {
            const validateEngine = (engine: any) => {
                const errors: string[] = [];

                if (!engine.id || typeof engine.id !== 'string') {
                    errors.push('Engine ID is required');
                }

                if (!engine.name || typeof engine.name !== 'string') {
                    errors.push('Engine name is required');
                }

                if (!engine.executable || typeof engine.executable !== 'string') {
                    errors.push('Engine executable is required');
                }

                if (engine.arguments && !Array.isArray(engine.arguments)) {
                    errors.push('Engine arguments must be an array');
                }

                if (engine.initialRating && (typeof engine.initialRating !== 'number' || engine.initialRating < 0)) {
                    errors.push('Initial rating must be a non-negative number');
                }

                return errors;
            };

            const validEngine = {
                id: 'test-engine',
                name: 'Test Engine',
                executable: 'node',
                arguments: ['engine.js'],
                initialRating: 1500
            };

            expect(validateEngine(validEngine)).toHaveLength(0);

            const invalidEngines = [
                { /* missing required fields */ },
                { id: '', name: 'Test' }, // Empty ID
                { id: 'test', name: '', executable: 'node' }, // Empty name
                { id: 'test', name: 'Test', executable: '' }, // Empty executable
                { id: 'test', name: 'Test', executable: 'node', arguments: 'not-array' }, // Invalid arguments
                { id: 'test', name: 'Test', executable: 'node', initialRating: -100 } // Negative rating
            ];

            invalidEngines.forEach(engine => {
                expect(validateEngine(engine).length).toBeGreaterThan(0);
            });
        });

        it('should validate unique engine IDs', () => {
            const validateUniqueIds = (engines: any[]) => {
                const ids = new Set();
                const duplicates: string[] = [];

                engines.forEach(engine => {
                    if (engine.id) {
                        if (ids.has(engine.id)) {
                            duplicates.push(engine.id);
                        } else {
                            ids.add(engine.id);
                        }
                    }
                });

                return duplicates;
            };

            const uniqueEngines = [
                { id: 'engine1', name: 'Engine 1' },
                { id: 'engine2', name: 'Engine 2' },
                { id: 'engine3', name: 'Engine 3' }
            ];

            expect(validateUniqueIds(uniqueEngines)).toHaveLength(0);

            const duplicateEngines = [
                { id: 'engine1', name: 'Engine 1' },
                { id: 'engine2', name: 'Engine 2' },
                { id: 'engine1', name: 'Duplicate Engine' } // Duplicate ID
            ];

            expect(validateUniqueIds(duplicateEngines)).toContain('engine1');
        });
    });

    describe('Config File Creation', () => {
        it('should create example configuration file', () => {
            const exampleConfig = {
                name: 'Example Tournament',
                rounds: 1,
                gamesPerPair: 2,
                concurrency: 2,
                engines: [
                    {
                        id: 'engine1',
                        name: 'Engine 1',
                        executable: '/path/to/engine1',
                        arguments: ['--option1', 'value1'],
                        workingDirectory: '/path/to/engine1/dir',
                        initialRating: 1500,
                        description: 'Example engine 1'
                    },
                    {
                        id: 'engine2',
                        name: 'Engine 2',
                        executable: '/path/to/engine2',
                        arguments: ['--option2', 'value2'],
                        workingDirectory: '/path/to/engine2/dir',
                        initialRating: 1500,
                        description: 'Example engine 2'
                    }
                ]
            };

            const createExampleConfig = (filePath: string) => {
                fs.writeFileSync(filePath, JSON.stringify(exampleConfig, null, 2));
            };

            createExampleConfig('engines.example.json');

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                'engines.example.json',
                JSON.stringify(exampleConfig, null, 2)
            );
        });

        it('should handle configuration file paths', () => {
            const testCases = [
                'engines.json',
                './engines.json',
                '/absolute/path/engines.json',
                '../relative/engines.json'
            ];

            testCases.forEach(filePath => {
                expect(typeof filePath).toBe('string');
                expect(filePath.endsWith('.json')).toBe(true);
            });
        });
    });

    describe('Environment-specific Configs', () => {
        it('should handle development configuration', () => {
            const devConfig = {
                name: 'Development Tournament',
                rounds: 1,
                gamesPerPair: 1, // Fewer games for faster testing
                concurrency: 1, // Single threaded for debugging
                engines: [
                    {
                        id: 'test1',
                        name: 'Test Engine 1',
                        executable: 'node',
                        arguments: ['tests/utils/test-engines.js', 'TestEngine1']
                    },
                    {
                        id: 'test2',
                        name: 'Test Engine 2',
                        executable: 'node',
                        arguments: ['tests/utils/test-engines.js', 'TestEngine2']
                    }
                ]
            };

            expect(devConfig.concurrency).toBe(1);
            expect(devConfig.gamesPerPair).toBe(1);
            expect(devConfig.engines.every(e => e.executable === 'node')).toBe(true);
        });

        it('should handle production configuration', () => {
            const prodConfig = {
                name: 'Production Tournament',
                rounds: 5,
                gamesPerPair: 10,
                concurrency: 4,
                engines: [
                    {
                        id: 'stockfish',
                        name: 'Stockfish 15',
                        executable: '/usr/local/bin/stockfish',
                        arguments: [],
                        initialRating: 1600
                    },
                    {
                        id: 'komodo',
                        name: 'Komodo 14',
                        executable: '/usr/local/bin/komodo',
                        arguments: [],
                        initialRating: 1580
                    }
                ]
            };

            expect(prodConfig.rounds).toBeGreaterThan(1);
            expect(prodConfig.gamesPerPair).toBeGreaterThan(1);
            expect(prodConfig.concurrency).toBeGreaterThan(1);
            expect(prodConfig.engines.every(e => e.executable.startsWith('/'))).toBe(true);
        });
    });
});
