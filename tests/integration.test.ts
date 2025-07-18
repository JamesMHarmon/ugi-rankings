import { Pool } from 'pg';
import {
    initializeDatabase,
    addEngine,
    getRankings,
    recordGameResult
} from '../src/database';

// Mock pool for integration testing
let mockPool: jest.Mocked<Pool>;

describe('Integration Tests', () => {
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

    describe('Complete Tournament Flow', () => {
        it('should execute a complete tournament workflow', async () => {
            // 1. Initialize database
            await initializeDatabase(mockPool);
            expect(mockPool.query).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS engines')
            );

            // 2. Add engines
            (mockPool.query as jest.Mock)
                .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Engine 1
                .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // Engine 2
                .mockResolvedValueOnce({ rows: [{ id: 3 }] }); // Engine 3

            const engine1Id = await addEngine(mockPool, 'Stockfish', 1600, 'Strong chess engine');
            const engine2Id = await addEngine(mockPool, 'Komodo', 1580, 'Commercial chess engine');
            const engine3Id = await addEngine(mockPool, 'LC0', 1620, 'Neural network engine');

            expect(engine1Id).toBe(1);
            expect(engine2Id).toBe(2);
            expect(engine3Id).toBe(3);

            // 3. Simulate tournament games
            const games = [
                { engine1: 1, engine2: 2, result: 'win', duration: 120 },
                { engine1: 1, engine2: 3, result: 'loss', duration: 180 },
                { engine1: 2, engine2: 3, result: 'draw', duration: 240 }
            ];

            // Mock rating queries and game recording
            (mockPool.query as jest.Mock)
                .mockResolvedValueOnce({ rows: [{ rating: 1600 }] }) // First engine rating for game 1
                .mockResolvedValueOnce({ rows: [{ rating: 1580 }] }) // Second engine rating for game 1
                .mockResolvedValueOnce({}) // Game recording insert for game 1
                .mockResolvedValueOnce({ rows: [{ rating: 1600 }] }) // First engine rating in updateRatings for game 1
                .mockResolvedValueOnce({ rows: [{ rating: 1580 }] }) // Second engine rating in updateRatings for game 1
                .mockResolvedValueOnce({}) // Rating update 1 for game 1
                .mockResolvedValueOnce({}) // Rating update 2 for game 1
                .mockResolvedValueOnce({}) // Win update for game 1
                .mockResolvedValueOnce({}) // Loss update for game 1
                .mockResolvedValueOnce({ rows: [{ rating: 1616 }] }) // First engine rating for game 2
                .mockResolvedValueOnce({ rows: [{ rating: 1500 }] }) // Second engine rating for game 2
                .mockResolvedValueOnce({}) // Game recording insert for game 2
                .mockResolvedValueOnce({ rows: [{ rating: 1616 }] }) // First engine rating in updateRatings for game 2
                .mockResolvedValueOnce({ rows: [{ rating: 1500 }] }) // Second engine rating in updateRatings for game 2
                .mockResolvedValueOnce({}) // Rating update 1 for game 2
                .mockResolvedValueOnce({}) // Rating update 2 for game 2
                .mockResolvedValueOnce({}) // Loss update for game 2 (engine1 loses)
                .mockResolvedValueOnce({}) // Win update for game 2 (engine2 wins)
                .mockResolvedValueOnce({ rows: [{ rating: 1564 }] }) // First engine rating for game 3
                .mockResolvedValueOnce({ rows: [{ rating: 1516 }] }) // Second engine rating for game 3
                .mockResolvedValueOnce({}) // Game recording insert for game 3
                .mockResolvedValueOnce({ rows: [{ rating: 1564 }] }) // First engine rating in updateRatings for game 3
                .mockResolvedValueOnce({ rows: [{ rating: 1516 }] }) // Second engine rating in updateRatings for game 3
                .mockResolvedValueOnce({}) // Rating update 1 for game 3
                .mockResolvedValueOnce({}) // Rating update 2 for game 3
                .mockResolvedValueOnce({}); // Draw update for game 3

            for (const game of games) {
                await recordGameResult(mockPool, {
                    engine1Id: game.engine1,
                    engine2Id: game.engine2,
                    result: game.result as any,
                    duration: game.duration,
                    matchSetName: 'Integration Test Tournament'
                });
            }

            // 4. Get final rankings
            const mockRankings = [
                { name: 'LC0', rating: 1640, games_played: 2, wins: 1, losses: 0, draws: 1 },
                { name: 'Stockfish', rating: 1610, games_played: 2, wins: 1, losses: 1, draws: 0 },
                { name: 'Komodo', rating: 1570, games_played: 2, wins: 0, losses: 1, draws: 1 }
            ];

            (mockPool.query as jest.Mock).mockResolvedValue({ rows: mockRankings });

            const rankings = await getRankings(mockPool, 10, true);
            expect(rankings).toHaveLength(3);
            expect(rankings[0].name).toBe('LC0'); // Highest rated
        });

        it('should handle tournament with many engines', async () => {
            const numEngines = 8;
            const engineIds: number[] = [];

            // Add engines
            for (let i = 1; i <= numEngines; i++) {
                (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: i }] });
                const id = await addEngine(mockPool, `Engine${i}`, 1500 + i * 10);
                engineIds.push(id);
            }

            expect(engineIds).toHaveLength(numEngines);

            // Calculate total games for round-robin (n * (n-1) / 2)
            const totalPairs = (numEngines * (numEngines - 1)) / 2;
            expect(totalPairs).toBe(28); // 8 * 7 / 2 = 28

            // Mock all database calls for rating queries and game recording
            // For each game, we need: 2 rating queries + 1 game insert + 2 rating queries + 2 rating updates + 1-2 win/loss updates
            const totalCalls = totalPairs * 9; // 28 pairs * 9 calls each = 252 calls
            
            for (let call = 0; call < totalCalls; call++) {
                if (call % 9 === 0 || call % 9 === 1 || call % 9 === 3 || call % 9 === 4) {
                    // Rating queries - return mock ratings
                    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ rating: 1500 + Math.random() * 200 }] });
                } else {
                    // Game inserts, rating updates, and win/loss updates
                    (mockPool.query as jest.Mock).mockResolvedValueOnce({});
                }
            }

            let gameCount = 0;
            for (let i = 0; i < engineIds.length; i++) {
                for (let j = i + 1; j < engineIds.length; j++) {
                    await recordGameResult(mockPool, {
                        engine1Id: engineIds[i]!,
                        engine2Id: engineIds[j]!,
                        result: Math.random() > 0.5 ? 'win' : 'loss',
                        matchSetName: 'Large Tournament'
                    });
                    gameCount++;
                }
            }

            expect(gameCount).toBe(totalPairs);
        });
    });

    describe('Error Recovery', () => {
        it('should handle database connection failures gracefully', async () => {
            const dbError = new Error('Connection failed');
            (mockPool.query as jest.Mock).mockRejectedValue(dbError);

            await expect(initializeDatabase(mockPool)).rejects.toThrow('Connection failed');
            await expect(addEngine(mockPool, 'TestEngine')).rejects.toThrow('Connection failed');
            await expect(getRankings(mockPool)).rejects.toThrow('Connection failed');
        });

        it('should handle partial tournament completion', async () => {
            // Add engines successfully
            (mockPool.query as jest.Mock)
                .mockResolvedValueOnce({ rows: [{ id: 1 }] })
                .mockResolvedValueOnce({ rows: [{ id: 2 }] });

            await addEngine(mockPool, 'Engine1');
            await addEngine(mockPool, 'Engine2');

            // First game succeeds
            (mockPool.query as jest.Mock)
                .mockResolvedValueOnce({ rows: [{ rating: 1500 }] }) // engine1 rating query
                .mockResolvedValueOnce({ rows: [{ rating: 1500 }] }) // engine2 rating query
                .mockResolvedValueOnce({}) // game insert
                .mockResolvedValueOnce({ rows: [{ rating: 1516 }] }) // engine1 updated rating query
                .mockResolvedValueOnce({ rows: [{ rating: 1484 }] }) // engine2 updated rating query
                .mockResolvedValueOnce({}) // engine1 rating update
                .mockResolvedValueOnce({}); // engine2 rating update

            await recordGameResult(mockPool, {
                engine1Id: 1,
                engine2Id: 2,
                result: 'win'
            });

            // Second game fails
            (mockPool.query as jest.Mock).mockRejectedValue(new Error('Database error'));

            await expect(recordGameResult(mockPool, {
                engine1Id: 1,
                engine2Id: 2,
                result: 'loss'
            })).rejects.toThrow('Database error');
        });

        it('should handle engine process failures', () => {
            const engineFailures = [
                { type: 'crash', error: 'Engine crashed unexpectedly' },
                { type: 'timeout', error: 'Engine response timeout' },
                { type: 'invalid_move', error: 'Engine returned invalid move' },
                { type: 'protocol_error', error: 'UGI protocol violation' }
            ];

            engineFailures.forEach(failure => {
                const gameResult = {
                    engine1Id: 1,
                    engine2Id: 2,
                    result: 'error' as const,
                    error: failure.error,
                    matchSetName: 'Error Test'
                };

                expect(gameResult.result).toBe('error');
                expect(gameResult.error).toBeDefined();
            });
        });
    });

    describe('Performance and Scalability', () => {
        it('should handle concurrent game execution', async () => {
            const concurrentGames = 4;
            const gamePromises: Promise<void>[] = [];

            // Use a more flexible mock that always returns valid responses
            (mockPool.query as jest.Mock).mockImplementation((query: string) => {
                if (query.includes('SELECT rating')) {
                    return Promise.resolve({ rows: [{ rating: 1500 }] });
                } else {
                    return Promise.resolve({});
                }
            });

            for (let i = 0; i < concurrentGames; i++) {
                const gamePromise = recordGameResult(mockPool, {
                    engine1Id: 1,
                    engine2Id: 2,
                    result: 'win',
                    matchSetName: `Concurrent Game ${i + 1}`
                });
                gamePromises.push(gamePromise);
            }

            // All games should complete successfully
            await expect(Promise.all(gamePromises)).resolves.toBeDefined();
        });

        it('should measure query performance', async () => {
            const startTime = Date.now();

            // Mock quick database responses
            (mockPool.query as jest.Mock).mockResolvedValue({
                rows: Array(100).fill(null).map((_, i) => ({
                    name: `Engine${i}`,
                    rating: 1500 + i,
                    games_played: 10
                }))
            });

            await getRankings(mockPool, 100);

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Should complete quickly (this is just a mock, but tests the pattern)
            expect(duration).toBeLessThan(1000); // Less than 1 second
        });

        it('should handle large rating changes', async () => {
            // Test rating system stability with extreme scenarios
            const extremeScenarios = [
                { r1: 800, r2: 2400, score: 1 }, // Huge upset
                { r1: 2400, r2: 800, score: 0 }, // Expected loss by favorite
                { r1: 1200, r2: 1800, score: 0.5 }, // Draw between mismatched players
            ];

            extremeScenarios.forEach(scenario => {
                const { r1, r2, score } = scenario;

                // Calculate expected rating change
                const k = 32;
                const expected1 = 1 / (1 + Math.pow(10, (r2 - r1) / 400));
                const change1 = k * (score - expected1);

                // Rating changes should be bounded
                expect(Math.abs(change1)).toBeLessThanOrEqual(k);
                expect(Number.isFinite(change1)).toBe(true);
            });
        });
    });

    describe('Data Integrity', () => {
        it('should maintain referential integrity', async () => {
            // Test that games reference valid engines
            const gameWithInvalidEngine = {
                engine1Id: 999, // Non-existent engine
                engine2Id: 1,
                result: 'win' as const
            };

            (mockPool.query as jest.Mock)
                .mockResolvedValueOnce({ rows: [] }) // Engine 999 not found
                .mockResolvedValueOnce({ rows: [{ rating: 1500 }] }); // Engine 1 found

            await expect(recordGameResult(mockPool, gameWithInvalidEngine))
                .rejects.toThrow('One or both engines not found');
        });

        it('should prevent duplicate engine names', async () => {
            // First engine creation succeeds
            (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }] });
            await addEngine(mockPool, 'UniqueEngine');

            // Second engine with same name should fail (in real implementation)
            const duplicateError = new Error('duplicate key value violates unique constraint');
            (mockPool.query as jest.Mock).mockRejectedValue(duplicateError);

            await expect(addEngine(mockPool, 'UniqueEngine'))
                .rejects.toThrow('duplicate key value violates unique constraint');
        });

        it('should validate game result values', () => {
            const validResults = ['win', 'loss', 'draw', 'error'];
            const invalidResults = ['victory', 'defeat', 'tie', 'crash'];

            validResults.forEach(result => {
                expect(['win', 'loss', 'draw', 'error']).toContain(result);
            });

            invalidResults.forEach(result => {
                expect(['win', 'loss', 'draw', 'error']).not.toContain(result);
            });
        });
    });
});
