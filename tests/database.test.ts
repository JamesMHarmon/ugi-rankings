import { Pool } from 'pg';
import {
    initializeDatabase,
    addEngine,
    updateRatings,
    getRankings,
    listEngines,
    recordGameResult,
    getPairGameCounts
} from '../src/database';

// Mock pool for testing
let mockPool: jest.Mocked<Pool>;

describe('Database Functions', () => {
    beforeEach(() => {
        // Create a mock pool
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
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('initializeDatabase', () => {
        it('should create tables with correct schema', async () => {
            await initializeDatabase(mockPool);

            expect(mockPool.query).toHaveBeenCalledTimes(1);
            const createTablesSQL = (mockPool.query as jest.Mock).mock.calls[0][0];

            expect(createTablesSQL).toContain('CREATE TABLE IF NOT EXISTS engines');
            expect(createTablesSQL).toContain('name VARCHAR(255) UNIQUE NOT NULL');
            expect(createTablesSQL).toContain('rating INTEGER DEFAULT 1500');
            expect(createTablesSQL).toContain('CREATE TABLE IF NOT EXISTS games');
            expect(createTablesSQL).not.toContain('enabled'); // Should not have enabled field
            expect(createTablesSQL).not.toContain('executable'); // Should not have executable field
        });
    });

    describe('addEngine', () => {
        it('should add engine with default rating', async () => {
            const mockResult = { rows: [{ id: 1 }] };
            (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

            const result = await addEngine(mockPool, 'TestEngine');

            expect(mockPool.query).toHaveBeenCalledWith(
                'INSERT INTO engines (name, rating, description) VALUES ($1, $2, $3) RETURNING id',
                ['TestEngine', 1500, undefined]
            );
            expect(result).toBe(1);
        });

        it('should add engine with custom rating and description', async () => {
            const mockResult = { rows: [{ id: 2 }] };
            (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

            const result = await addEngine(mockPool, 'AdvancedEngine', 1600, 'Test engine');

            expect(mockPool.query).toHaveBeenCalledWith(
                'INSERT INTO engines (name, rating, description) VALUES ($1, $2, $3) RETURNING id',
                ['AdvancedEngine', 1600, 'Test engine']
            );
            expect(result).toBe(2);
        });
    });

    describe('updateRatings', () => {
        it('should update ratings correctly for a win', async () => {
            // Mock getting current ratings
            (mockPool.query as jest.Mock)
                .mockResolvedValueOnce({ rows: [{ rating: 1500 }] }) // engine1
                .mockResolvedValueOnce({ rows: [{ rating: 1500 }] }) // engine2
                .mockResolvedValueOnce({}) // update engine1 rating
                .mockResolvedValueOnce({}) // update engine2 rating
                .mockResolvedValueOnce({}) // update wins
                .mockResolvedValueOnce({}); // update losses

            await updateRatings(mockPool, 1, 2, false);

            // Check rating updates (engine1 wins, engine2 loses)
            expect(mockPool.query).toHaveBeenCalledWith(
                'UPDATE engines SET rating = $1, games_played = games_played + 1 WHERE id = $2',
                [1516, 1] // engine1 gains rating
            );
            expect(mockPool.query).toHaveBeenCalledWith(
                'UPDATE engines SET rating = $1, games_played = games_played + 1 WHERE id = $2',
                [1484, 2] // engine2 loses rating
            );
        });

        it('should update ratings correctly for a draw', async () => {
            (mockPool.query as jest.Mock)
                .mockResolvedValueOnce({ rows: [{ rating: 1500 }] })
                .mockResolvedValueOnce({ rows: [{ rating: 1500 }] })
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce({});

            await updateRatings(mockPool, 1, 2, true);

            // For equal ratings and draw, ratings should stay the same
            expect(mockPool.query).toHaveBeenCalledWith(
                'UPDATE engines SET rating = $1, games_played = games_played + 1 WHERE id = $2',
                [1500, 1]
            );
            expect(mockPool.query).toHaveBeenCalledWith(
                'UPDATE engines SET rating = $1, games_played = games_played + 1 WHERE id = $2',
                [1500, 2]
            );
            // Check draws are updated
            expect(mockPool.query).toHaveBeenCalledWith(
                'UPDATE engines SET draws = draws + 1 WHERE id = $1 OR id = $2',
                [1, 2]
            );
        });
    });

    describe('getRankings', () => {
        it('should get basic rankings', async () => {
            const mockEngines = [
                { name: 'Engine1', rating: 1600, games_played: 10, wins: 8, losses: 2, draws: 0 },
                { name: 'Engine2', rating: 1500, games_played: 5, wins: 3, losses: 2, draws: 0 }
            ];
            (mockPool.query as jest.Mock).mockResolvedValue({ rows: mockEngines });

            const result = await getRankings(mockPool, 10, false);

            expect(mockPool.query).toHaveBeenCalledWith(
                'SELECT name, rating, games_played, wins, losses, draws FROM engines ORDER BY rating DESC LIMIT $1',
                [10]
            );
            expect(result).toEqual(mockEngines);
        });

        it('should get detailed rankings', async () => {
            const mockEngines = [
                { name: 'Engine1', rating: 1600, games_played: 10, wins: 8, losses: 2, draws: 0, description: 'Test' }
            ];
            (mockPool.query as jest.Mock).mockResolvedValue({ rows: mockEngines });

            await getRankings(mockPool, 5, true);

            expect(mockPool.query).toHaveBeenCalledWith(
                'SELECT name, rating, games_played, wins, losses, draws, description FROM engines ORDER BY rating DESC LIMIT $1',
                [5]
            );
        });
    });

    describe('recordGameResult', () => {
        it('should record a game win correctly', async () => {
            const mockEngines = [
                { rows: [{ rating: 1500 }] },
                { rows: [{ rating: 1400 }] }
            ];
            (mockPool.query as jest.Mock)
                .mockResolvedValueOnce(mockEngines[0])
                .mockResolvedValueOnce(mockEngines[1])
                .mockResolvedValueOnce({}); // insert game

            const gameResult = {
                engine1Id: 1,
                engine2Id: 2,
                result: 'win' as const,
                moves: ['e2e4', 'e7e5'],
                duration: 120,
                matchSetName: 'Test Match'
            };

            await recordGameResult(mockPool, gameResult, false); // Don't update ratings

            expect(mockPool.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO games'),
                expect.arrayContaining([1, 2, 1, false, 1500, 1400])
            );
        });

        it('should record a draw correctly', async () => {
            const mockEngines = [
                { rows: [{ rating: 1500 }] },
                { rows: [{ rating: 1400 }] }
            ];
            (mockPool.query as jest.Mock)
                .mockResolvedValueOnce(mockEngines[0])
                .mockResolvedValueOnce(mockEngines[1])
                .mockResolvedValueOnce({});

            const gameResult = {
                engine1Id: 1,
                engine2Id: 2,
                result: 'draw' as const
            };

            await recordGameResult(mockPool, gameResult, false);

            expect(mockPool.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO games'),
                expect.arrayContaining([1, 2, null, true, 1500, 1400])
            );
        });

        it('should throw error if engine not found', async () => {
            (mockPool.query as jest.Mock)
                .mockResolvedValueOnce({ rows: [] }) // engine1 not found
                .mockResolvedValueOnce({ rows: [{ rating: 1400 }] });

            const gameResult = {
                engine1Id: 999,
                engine2Id: 2,
                result: 'win' as const
            };

            await expect(recordGameResult(mockPool, gameResult)).rejects.toThrow('One or both engines not found');
        });
    });

    describe('getPairGameCounts', () => {
        it('should return game counts for engine pairs', async () => {
            const mockCounts = [
                { engine1_id: 1, engine2_id: 2, game_count: '5' },
                { engine1_id: 2, engine2_id: 3, game_count: '3' }
            ];
            (mockPool.query as jest.Mock).mockResolvedValue({ rows: mockCounts });

            const result = await getPairGameCounts(mockPool);

            expect(result.get('1-2')).toBe(5);
            expect(result.get('2-1')).toBe(5); // Should be bidirectional
            expect(result.get('2-3')).toBe(3);
            expect(result.get('3-2')).toBe(3);
        });
    });
});
