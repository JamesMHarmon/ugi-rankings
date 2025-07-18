import { Pool } from 'pg';

// Database initialization
export async function initializeDatabase(pool: Pool): Promise<void> {
    const createTables = `
        CREATE TABLE IF NOT EXISTS engines (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            description TEXT,
            rating INTEGER DEFAULT 1500,
            games_played INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS games (
            id SERIAL PRIMARY KEY,
            engine1_id INTEGER REFERENCES engines(id),
            engine2_id INTEGER REFERENCES engines(id),
            winner_id INTEGER REFERENCES engines(id),
            is_draw BOOLEAN DEFAULT FALSE,
            engine1_rating_before INTEGER,
            engine2_rating_before INTEGER,
            engine1_rating_after INTEGER,
            engine2_rating_after INTEGER,
            moves TEXT,
            duration INTEGER,
            error_message TEXT,
            final_status TEXT,
            starting_position VARCHAR(255),
            match_set_name VARCHAR(255),
            engine1_color VARCHAR(10),
            engine2_color VARCHAR(10),
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_engines_rating ON engines(rating DESC);
        CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at);
        CREATE INDEX IF NOT EXISTS idx_games_match_set ON games(match_set_name);
        CREATE INDEX IF NOT EXISTS idx_games_starting_position ON games(starting_position);
    `;

    await pool.query(createTables);
}

// Add engine to database
export async function addEngine(
    pool: Pool,
    name: string,
    rating: number = 1500,
    description?: string
): Promise<number> {
    const result = await pool.query(
        'INSERT INTO engines (name, rating, description) VALUES ($1, $2, $3) RETURNING id',
        [name, rating, description]
    );
    return result.rows[0].id;
}

// Update ratings using ELO algorithm
export async function updateRatings(pool: Pool, engine1Id: number, engine2Id: number, isDraw: boolean = false): Promise<void> {
    // Simple ELO rating calculation (K-factor = 32)
    const K = 32;

    const engine1 = await pool.query('SELECT rating FROM engines WHERE id = $1', [engine1Id]);
    const engine2 = await pool.query('SELECT rating FROM engines WHERE id = $1', [engine2Id]);

    const rating1 = engine1.rows[0].rating;
    const rating2 = engine2.rows[0].rating;

    const expected1 = 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));
    const expected2 = 1 / (1 + Math.pow(10, (rating1 - rating2) / 400));

    const score1 = isDraw ? 0.5 : 1;
    const score2 = isDraw ? 0.5 : 0;

    const newRating1 = Math.round(rating1 + K * (score1 - expected1));
    const newRating2 = Math.round(rating2 + K * (score2 - expected2));

    await pool.query('UPDATE engines SET rating = $1, games_played = games_played + 1 WHERE id = $2', [newRating1, engine1Id]);
    await pool.query('UPDATE engines SET rating = $1, games_played = games_played + 1 WHERE id = $2', [newRating2, engine2Id]);

    // Update win/loss/draw counts
    if (isDraw) {
        await pool.query('UPDATE engines SET draws = draws + 1 WHERE id = $1 OR id = $2', [engine1Id, engine2Id]);
    } else {
        await pool.query('UPDATE engines SET wins = wins + 1 WHERE id = $1', [engine1Id]);
        await pool.query('UPDATE engines SET losses = losses + 1 WHERE id = $1', [engine2Id]);
    }
}

// Get engine rankings
export async function getRankings(pool: Pool, limit: number = 10, detailed: boolean = false): Promise<any[]> {
    const fields = detailed
        ? 'name, rating, games_played, wins, losses, draws, description'
        : 'name, rating, games_played, wins, losses, draws';

    const result = await pool.query(
        `SELECT ${fields} FROM engines ORDER BY rating DESC LIMIT $1`,
        [limit]
    );
    return result.rows;
}

// List all engines
export async function listEngines(pool: Pool): Promise<any[]> {
    const result = await pool.query(
        `SELECT name, rating, games_played, wins, losses, draws, description 
         FROM engines ORDER BY name`
    );
    return result.rows;
}

// Record a game result
export async function recordGameResult(pool: Pool, gameResult: {
    engine1Id: number;
    engine2Id: number;
    result: 'win' | 'loss' | 'draw' | 'error';
    moves?: string[];
    duration?: number;
    error?: string;
    finalStatus?: string;
    startingPosition?: string;
    matchSetName?: string;
    engine1Color?: 'white' | 'black';
    engine2Color?: 'white' | 'black';
}, shouldUpdateRatings: boolean = true): Promise<void> {
    const isDraw = gameResult.result === 'draw';
    const winnerId = isDraw ? null : (gameResult.result === 'win' ? gameResult.engine1Id : gameResult.engine2Id);

    // Get current ratings
    const engine1 = await pool.query('SELECT rating FROM engines WHERE id = $1', [gameResult.engine1Id]);
    const engine2 = await pool.query('SELECT rating FROM engines WHERE id = $1', [gameResult.engine2Id]);

    if (engine1.rows.length === 0 || engine2.rows.length === 0) {
        throw new Error('One or both engines not found');
    }

    const rating1Before = engine1.rows[0].rating;
    const rating2Before = engine2.rows[0].rating;

    // Record the game with additional fields
    await pool.query(
        `INSERT INTO games 
         (engine1_id, engine2_id, winner_id, is_draw, engine1_rating_before, engine2_rating_before, 
          moves, duration, error_message, final_status, starting_position, match_set_name, 
          engine1_color, engine2_color) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
            gameResult.engine1Id,
            gameResult.engine2Id,
            winnerId,
            isDraw,
            rating1Before,
            rating2Before,
            gameResult.moves ? JSON.stringify(gameResult.moves) : null,
            gameResult.duration,
            gameResult.error,
            gameResult.finalStatus,
            gameResult.startingPosition,
            gameResult.matchSetName,
            gameResult.engine1Color,
            gameResult.engine2Color
        ]
    );

    // Update ratings only if requested and not an error
    if (shouldUpdateRatings && gameResult.result !== 'error') {
        await updateRatings(pool, gameResult.engine1Id, gameResult.engine2Id, isDraw);
    }
}

// Get recent games for uncertainty calculation
export async function getRecentGames(pool: Pool, hours: number = 24): Promise<any[]> {
    const result = await pool.query(`
        SELECT engine1_id, engine2_id, engine1_rating_before, engine1_rating_after, 
               engine2_rating_before, engine2_rating_after, played_at
        FROM games 
        WHERE played_at > NOW() - INTERVAL '${hours} hours'
        ORDER BY played_at DESC
    `);
    return result.rows;
}

// Get game counts between engine pairs
export async function getPairGameCounts(pool: Pool): Promise<Map<string, number>> {
    const result = await pool.query(`
        SELECT engine1_id, engine2_id, COUNT(*) as game_count
        FROM games
        GROUP BY engine1_id, engine2_id
    `);

    const pairCounts = new Map<string, number>();
    result.rows.forEach(row => {
        pairCounts.set(`${row.engine1_id}-${row.engine2_id}`, parseInt(row.game_count));
        pairCounts.set(`${row.engine2_id}-${row.engine1_id}`, parseInt(row.game_count));
    });

    return pairCounts;
}

// Create database connection pool
export function createDatabasePool(): Pool {
    return new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'ugi_rankings',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'password',
    });
}
