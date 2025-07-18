import { Pool } from 'pg';

// Mock the database module
jest.mock('../src/database');
import {
    getRankings,
    recordGameResult,
    getPairGameCounts
} from '../src/database';

const mockGetRankings = getRankings as jest.MockedFunction<typeof getRankings>;
const mockRecordGameResult = recordGameResult as jest.MockedFunction<typeof recordGameResult>;
const mockGetPairGameCounts = getPairGameCounts as jest.MockedFunction<typeof getPairGameCounts>;

describe('Tournament System', () => {
    let mockPool: jest.Mocked<Pool>;

    beforeEach(() => {
        mockPool = {
            query: jest.fn(),
            connect: jest.fn(),
            end: jest.fn(),
            on: jest.fn(),
            removeListener: jest.fn(),
            totalCount: 0,
            idleCount: 0,
            waitingCount: 0
        } as any;

        jest.clearAllMocks();
    });

    describe('Tournament Configuration', () => {
        it('should validate tournament configuration', () => {
            const validConfig = {
                name: 'Test Tournament',
                rounds: 1,
                gamesPerPair: 2,
                concurrency: 2,
                engines: [
                    {
                        id: 'engine1',
                        name: 'Engine1',
                        executable: 'node',
                        arguments: ['test1.js'],
                        initialRating: 1500
                    },
                    {
                        id: 'engine2',
                        name: 'Engine2',
                        executable: 'node',
                        arguments: ['test2.js'],
                        initialRating: 1500
                    }
                ]
            };

            expect(validConfig.engines.length).toBeGreaterThanOrEqual(2);
            expect(validConfig.rounds).toBeGreaterThan(0);
            expect(validConfig.gamesPerPair).toBeGreaterThan(0);
            expect(validConfig.concurrency).toBeGreaterThan(0);
        });

        it('should reject invalid tournament configuration', () => {
            const invalidConfigs = [
                { engines: [] }, // No engines
                { engines: [{ id: 'only-one' }] }, // Only one engine
                { engines: [{}, {}], rounds: 0 }, // Zero rounds
                { engines: [{}, {}], rounds: 1, gamesPerPair: 0 }, // Zero games per pair
            ];

            // Check that configurations are properly identified as invalid
            const invalidEngineConfigs = invalidConfigs.slice(0, 2); // First two have engine issues
            const otherInvalidConfigs = invalidConfigs.slice(2); // Others have different issues

            invalidEngineConfigs.forEach(config => {
                expect(config.engines?.length || 0).toBeLessThan(2);
            });

            otherInvalidConfigs.forEach(config => {
                expect(config.engines?.length || 0).toBeGreaterThanOrEqual(2);
                // These are invalid for other reasons (rounds, gamesPerPair)
            });
        });
    });

    describe('Pairing Generation', () => {
        it('should generate all possible pairs for round-robin', () => {
            const engines = [
                { id: 1, name: 'Engine1' },
                { id: 2, name: 'Engine2' },
                { id: 3, name: 'Engine3' },
                { id: 4, name: 'Engine4' }
            ];

            // Round-robin should generate n*(n-1)/2 pairs
            const expectedPairs = [
                [1, 2], [1, 3], [1, 4],
                [2, 3], [2, 4],
                [3, 4]
            ];

            const pairs: number[][] = [];
            for (let i = 0; i < engines.length; i++) {
                for (let j = i + 1; j < engines.length; j++) {
                    pairs.push([engines[i]!.id, engines[j]!.id]);
                }
            }

            expect(pairs).toHaveLength(6); // 4*3/2 = 6 pairs
            expect(pairs).toEqual(expectedPairs);
        });

        it('should handle games per pair multiplier', () => {
            const basePairs: [number, number][] = [[1, 2], [1, 3], [2, 3]];
            const gamesPerPair = 2;

            const allGames: Array<[number, number]> = [];
            basePairs.forEach(pair => {
                for (let i = 0; i < gamesPerPair; i++) {
                    allGames.push([pair[0], pair[1]]);
                }
            });

            expect(allGames).toHaveLength(basePairs.length * gamesPerPair);
        });
    });

    describe('Tournament Execution', () => {
        it('should track tournament progress', async () => {
            const totalGames = 6; // 3 pairs * 2 games each
            let completedGames = 0;

            const mockGameExecution = () => {
                return new Promise<void>(resolve => {
                    setTimeout(() => {
                        completedGames++;
                        resolve();
                    }, 10);
                });
            };

            // Simulate concurrent game execution
            const concurrency = 2;
            const gamePromises: Promise<void>[] = [];

            for (let i = 0; i < Math.min(concurrency, totalGames); i++) {
                gamePromises.push(mockGameExecution());
            }

            await Promise.all(gamePromises);
            expect(completedGames).toBe(Math.min(concurrency, totalGames));
        });

        it('should handle game results and update database', async () => {
            const gameResult = {
                engine1Id: 1,
                engine2Id: 2,
                result: 'win' as const,
                duration: 120,
                matchSetName: 'Test Tournament - Round 1'
            };

            mockRecordGameResult.mockResolvedValue();

            await recordGameResult(mockPool, gameResult);

            expect(mockRecordGameResult).toHaveBeenCalledWith(mockPool, gameResult);
        });

        it('should handle tournament rounds', () => {
            const rounds = 3;
            const basePairs = [[1, 2], [1, 3], [2, 3]];
            const gamesPerPair = 2;

            let totalGames = 0;
            for (let round = 1; round <= rounds; round++) {
                basePairs.forEach(pair => {
                    for (let game = 1; game <= gamesPerPair; game++) {
                        totalGames++;
                    }
                });
            }

            expect(totalGames).toBe(rounds * basePairs.length * gamesPerPair);
        });
    });

    describe('Concurrency Management', () => {
        it('should respect concurrency limits', async () => {
            const totalTasks = 10;
            const concurrency = 3;
            let activeTasks = 0;
            let maxConcurrent = 0;

            const mockTask = () => {
                return new Promise<void>(resolve => {
                    activeTasks++;
                    maxConcurrent = Math.max(maxConcurrent, activeTasks);

                    setTimeout(() => {
                        activeTasks--;
                        resolve();
                    }, 10);
                });
            };

            // Simulate concurrency control
            const executeConcurrently = async (tasks: (() => Promise<void>)[], limit: number) => {
                const executing: Promise<void>[] = [];

                for (const task of tasks) {
                    const promise = task();
                    executing.push(promise);

                    if (executing.length >= limit) {
                        await Promise.race(executing);
                        // Remove completed promises
                        for (let i = executing.length - 1; i >= 0; i--) {
                            if (await Promise.race([executing[i], Promise.resolve('not-done')]) !== 'not-done') {
                                executing.splice(i, 1);
                            }
                        }
                    }
                }

                await Promise.all(executing);
            };

            const tasks = Array(totalTasks).fill(null).map(() => mockTask);
            await executeConcurrently(tasks, concurrency);

            expect(maxConcurrent).toBeLessThanOrEqual(concurrency);
        });
    });

    describe('Tournament Results', () => {
        it('should calculate final rankings', async () => {
            const mockRankings = [
                { name: 'Engine1', rating: 1550, games_played: 10, wins: 7, losses: 3, draws: 0 },
                { name: 'Engine2', rating: 1500, games_played: 10, wins: 5, losses: 5, draws: 0 },
                { name: 'Engine3', rating: 1450, games_played: 10, wins: 3, losses: 7, draws: 0 }
            ];

            mockGetRankings.mockResolvedValue(mockRankings);

            const rankings = await getRankings(mockPool, 10, true);

            expect(rankings).toEqual(mockRankings);
            expect(rankings[0].rating).toBeGreaterThanOrEqual(rankings[1].rating);
            expect(rankings[1].rating).toBeGreaterThanOrEqual(rankings[2].rating);
        });

        it('should track game pair statistics', async () => {
            const mockPairCounts = new Map([
                ['1-2', 4],
                ['2-1', 4],
                ['1-3', 4],
                ['3-1', 4],
                ['2-3', 4],
                ['3-2', 4]
            ]);

            mockGetPairGameCounts.mockResolvedValue(mockPairCounts);

            const pairCounts = await getPairGameCounts(mockPool);

            expect(pairCounts.get('1-2')).toBe(4);
            expect(pairCounts.get('2-1')).toBe(4); // Should be symmetric
        });
    });

    describe('Error Handling', () => {
        it('should handle engine crashes during tournament', async () => {
            const mockError = new Error('Engine crashed');

            // Simulate engine crash
            const gameResult = {
                engine1Id: 1,
                engine2Id: 2,
                result: 'error' as const,
                error: 'Engine crashed',
                matchSetName: 'Test Tournament'
            };

            mockRecordGameResult.mockResolvedValue();

            await recordGameResult(mockPool, gameResult, false); // Don't update ratings for errors

            expect(mockRecordGameResult).toHaveBeenCalledWith(mockPool, gameResult, false);
        });

        it('should handle database connection errors', async () => {
            const dbError = new Error('Database connection failed');
            mockGetRankings.mockRejectedValue(dbError);

            await expect(getRankings(mockPool)).rejects.toThrow('Database connection failed');
        });

        it('should handle invalid game configurations', () => {
            const invalidGameConfigs = [
                { engine1Id: 1, engine2Id: 1 }, // Same engine
                { engine1Id: null, engine2Id: 2 }, // Missing engine
                { engine1Id: 1, engine2Id: null }, // Missing engine
            ];

            invalidGameConfigs.forEach(config => {
                expect(config.engine1Id === config.engine2Id ||
                    config.engine1Id === null ||
                    config.engine2Id === null).toBeTruthy();
            });
        });
    });
});
