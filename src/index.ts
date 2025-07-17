import { Pool } from 'pg';
import * as tf from '@tensorflow/tfjs-node';
import dotenv from 'dotenv';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

// Types
interface EngineConfig {
    name: string;
    executable: string;
    workingDirectory: string;
    arguments: string[];
    initialRating: number;
    enabled: boolean;
    description?: string;
}

interface TournamentConfig {
    tournament: {
        name: string;
        description?: string;
        timeControl?: string;
        rounds?: number;
        gamesPerPair?: number;
        concurrency?: number;
    };
    engines: EngineConfig[];
}

interface GameResult {
    engine1Id: number;
    engine2Id: number;
    result: 'win' | 'loss' | 'draw' | 'error';
    moves?: string[];
    duration?: number;
    error?: string;
    finalStatus?: string;
}

interface EngineProcess {
    process: ChildProcess;
    name: string;
    id: number;
}

interface GameStatus {
    inProgress: boolean;
    playerToMove: number;
    player1Result?: string;
    player2Result?: string;
    player1Score?: string;
    player2Score?: string;
}

// Load environment variables
dotenv.config();

// Configuration
const DEFAULT_CONFIG_FILE = process.env.ENGINES_CONFIG || './engines.json';

// PostgreSQL connection
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'ugi_rankings',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
});

// CLI program setup
const program = new Command();

program
    .name('ugi-rankings')
    .description('UGI Rankings Console Application')
    .version('1.0.0');

// Database initialization command
program
    .command('init-db')
    .description('Initialize the rankings database')
    .action(async () => {
        try {
            console.log('🔧 Initializing database...');
            await initializeDatabase();
            console.log('✅ Database initialized successfully');
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            process.exit(1);
        }
    });

// Load engines from config command
program
    .command('load-config')
    .description('Load engines from a configuration file')
    .option('-f, --file <file>', 'Configuration file path', DEFAULT_CONFIG_FILE)
    .option('--replace', 'Replace existing engines (default: skip duplicates)')
    .action(async (options) => {
        try {
            console.log(`🔧 Loading engines from ${options.file}...`);
            const result = await loadEnginesFromConfig(options.file, options.replace);
            console.log(`✅ Successfully loaded ${result.loaded} engines`);
            if (result.skipped > 0) {
                console.log(`⚠️  Skipped ${result.skipped} engines (already exist)`);
            }
            if (result.disabled > 0) {
                console.log(`ℹ️  Skipped ${result.disabled} disabled engines`);
            }
        } catch (error) {
            console.error('❌ Failed to load engines from config:', error);
            process.exit(1);
        }
    });

// Run tournament command
program
    .command('run-tournament')
    .description('Run games between engines automatically')
    .option('-r, --rounds <rounds>', 'Number of rounds to play', '1')
    .option('-p, --pairs <pairs>', 'Number of games per engine pair', '1')
    .option('-c, --concurrency <concurrency>', 'Number of concurrent games', '1')
    .option('--time-control <time>', 'Time control (e.g., "60+1" for 60s + 1s increment)', '10+0.1')
    .action(async (options) => {
        try {
            console.log('🏁 Starting tournament...');
            const result = await runTournament({
                rounds: parseInt(options.rounds),
                gamesPerPair: parseInt(options.pairs),
                concurrency: parseInt(options.concurrency),
                timeControl: options.timeControl
            });
            console.log(`✅ Tournament completed: ${result.totalGames} games played`);
            console.log(`🏆 Wins: ${result.wins}, Draws: ${result.draws}, Errors: ${result.errors}`);
        } catch (error) {
            console.error('❌ Tournament failed:', error);
            process.exit(1);
        }
    });

// Play single game command
program
    .command('play-game')
    .description('Play a single game between two engines')
    .requiredOption('-1, --engine1 <id>', 'First engine ID')
    .requiredOption('-2, --engine2 <id>', 'Second engine ID')
    .option('--time-control <time>', 'Time control (e.g., "60+1")', '10+0.1')
    .action(async (options) => {
        try {
            console.log(`🎮 Playing game between engines ${options.engine1} and ${options.engine2}...`);
            const result = await playGame(parseInt(options.engine1), parseInt(options.engine2), options.timeControl);
            console.log(`✅ Game completed: ${result.result}`);
            await recordGameResult(result);
            console.log('✅ Game result recorded and ratings updated');
        } catch (error) {
            console.error('❌ Game failed:', error);
            process.exit(1);
        }
    });

// Show rankings command
program
    .command('rankings')
    .description('Show current engine rankings')
    .option('-l, --limit <limit>', 'Number of engines to show', '10')
    .option('--detailed', 'Show detailed engine information')
    .action(async (options) => {
        try {
            const rankings = await getRankings(parseInt(options.limit), options.detailed);
            console.log('\n🏆 Current Rankings:');

            if (options.detailed) {
                console.log('Rank | Engine Name        | Rating | Games | W/L/D | Executable');
                console.log('-----|-------------------|--------|-------|-------|------------------');
                rankings.forEach((engine, index) => {
                    const wld = `${engine.wins}/${engine.losses}/${engine.draws}`;
                    const executableShort = engine.executable ? path.basename(engine.executable) : 'N/A';
                    console.log(`${(index + 1).toString().padStart(4)} | ${engine.name.padEnd(17)} | ${engine.rating.toString().padStart(6)} | ${engine.games_played.toString().padStart(5)} | ${wld.padEnd(5)} | ${executableShort}`);
                });
            } else {
                console.log('Rank | Engine Name        | Rating | Games');
                console.log('-----|-------------------|--------|-------');
                rankings.forEach((engine, index) => {
                    console.log(`${(index + 1).toString().padStart(4)} | ${engine.name.padEnd(17)} | ${engine.rating.toString().padStart(6)} | ${engine.games_played.toString().padStart(5)}`);
                });
            }
        } catch (error) {
            console.error('❌ Failed to get rankings:', error);
            process.exit(1);
        }
    });

// List engines command
program
    .command('list-engines')
    .description('List all engines with their configuration')
    .option('--enabled-only', 'Show only enabled engines')
    .action(async (options) => {
        try {
            const engines = await listEngines(options.enabledOnly);
            console.log('\n🔧 Engine Configuration:');
            console.log('');

            engines.forEach((engine, index) => {
                console.log(`${index + 1}. ${engine.name} ${engine.enabled ? '✅' : '❌'}`);
                console.log(`   Rating: ${engine.rating} | Games: ${engine.games_played}`);
                if (engine.executable) {
                    console.log(`   Executable: ${engine.executable}`);
                }
                if (engine.working_directory) {
                    console.log(`   Working Dir: ${engine.working_directory}`);
                }
                if (engine.arguments) {
                    const args = JSON.parse(engine.arguments);
                    if (args.length > 0) {
                        console.log(`   Arguments: ${args.join(' ')}`);
                    }
                }
                if (engine.description) {
                    console.log(`   Description: ${engine.description}`);
                }
                console.log('');
            });

            console.log(`Total: ${engines.length} engines`);
        } catch (error) {
            console.error('❌ Failed to list engines:', error);
            process.exit(1);
        }
    });

// Test database connection
program
    .command('test-db')
    .description('Test database connection')
    .action(async () => {
        try {
            const result = await pool.query('SELECT NOW() as current_time');
            console.log('✅ Database connection successful');
            console.log(`Current time: ${result.rows[0]?.current_time}`);
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            process.exit(1);
        }
    });

// Test TensorFlow
program
    .command('test-tf')
    .description('Test TensorFlow.js setup')
    .action(() => {
        console.log('✅ TensorFlow.js is loaded');
        console.log(`Version: ${tf.version.tfjs}`);
        console.log(`Backend: ${tf.getBackend()}`);
    });

// Database functions
async function initializeDatabase(): Promise<void> {
    const createTables = `
        CREATE TABLE IF NOT EXISTS engines (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            executable VARCHAR(500),
            working_directory VARCHAR(500),
            arguments TEXT,
            description TEXT,
            rating INTEGER DEFAULT 1500,
            games_played INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            enabled BOOLEAN DEFAULT true,
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
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_engines_rating ON engines(rating DESC);
        CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at);
    `;

    await pool.query(createTables);
}

async function addEngine(
    name: string,
    rating: number = 1500,
    executable?: string,
    workingDirectory?: string,
    args?: string[],
    description?: string
): Promise<number> {
    const result = await pool.query(
        'INSERT INTO engines (name, rating, executable, working_directory, arguments, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [name, rating, executable, workingDirectory, args ? JSON.stringify(args) : null, description]
    );
    return result.rows[0].id;
}

async function loadEnginesFromConfig(configPath: string, replace: boolean = false): Promise<{ loaded: number; skipped: number; disabled: number }> {
    // Read and parse config file
    const configFile = path.resolve(configPath);
    if (!fs.existsSync(configFile)) {
        throw new Error(`Configuration file not found: ${configFile}`);
    }

    const configData = fs.readFileSync(configFile, 'utf8');
    const config: TournamentConfig = JSON.parse(configData);

    if (!config.engines || !Array.isArray(config.engines)) {
        throw new Error('Invalid configuration: engines array not found');
    }

    let loaded = 0;
    let skipped = 0;
    let disabled = 0;

    console.log(`📋 Tournament: ${config.tournament.name}`);
    if (config.tournament.description) {
        console.log(`📝 Description: ${config.tournament.description}`);
    }

    for (const engineConfig of config.engines) {
        // Skip disabled engines
        if (!engineConfig.enabled) {
            console.log(`⏭️  Skipping disabled engine: ${engineConfig.name}`);
            disabled++;
            continue;
        }

        try {
            // Check if engine already exists
            const existing = await pool.query('SELECT id FROM engines WHERE name = $1', [engineConfig.name]);

            if (existing.rows.length > 0) {
                if (replace) {
                    // Update existing engine
                    await pool.query(
                        'UPDATE engines SET executable = $1, working_directory = $2, arguments = $3, description = $4, rating = $5 WHERE name = $6',
                        [
                            engineConfig.executable,
                            engineConfig.workingDirectory,
                            JSON.stringify(engineConfig.arguments),
                            engineConfig.description,
                            engineConfig.initialRating,
                            engineConfig.name
                        ]
                    );
                    console.log(`🔄 Updated engine: ${engineConfig.name}`);
                    loaded++;
                } else {
                    console.log(`⚠️  Engine already exists: ${engineConfig.name} (use --replace to update)`);
                    skipped++;
                }
            } else {
                // Add new engine
                await addEngine(
                    engineConfig.name,
                    engineConfig.initialRating,
                    engineConfig.executable,
                    engineConfig.workingDirectory,
                    engineConfig.arguments,
                    engineConfig.description
                );
                console.log(`➕ Added engine: ${engineConfig.name} (${engineConfig.initialRating} rating)`);
                loaded++;
            }
        } catch (error) {
            console.error(`❌ Failed to process engine ${engineConfig.name}:`, error);
            throw error;
        }
    }

    return { loaded, skipped, disabled };
}

async function autoLoadEngines(): Promise<void> {
    // Check if config file exists
    if (!fs.existsSync(DEFAULT_CONFIG_FILE)) {
        console.log(`ℹ️  No config file found at ${DEFAULT_CONFIG_FILE}`);
        console.log('ℹ️  Create an engines.json file or use load-config command to add engines');
        return;
    }

    try {
        console.log(`🔄 Auto-loading engines from ${DEFAULT_CONFIG_FILE}...`);
        const result = await loadEnginesFromConfig(DEFAULT_CONFIG_FILE, false);

        if (result.loaded > 0) {
            console.log(`✅ Auto-loaded ${result.loaded} new engines`);
        }
        if (result.skipped > 0) {
            console.log(`ℹ️  ${result.skipped} engines already exist`);
        }
        if (result.disabled > 0) {
            console.log(`ℹ️  ${result.disabled} engines are disabled`);
        }

        // Show total engine count
        const totalEngines = await pool.query('SELECT COUNT(*) as count FROM engines WHERE enabled = true');
        console.log(`🎮 Total active engines: ${totalEngines.rows[0].count}`);

    } catch (error) {
        console.warn(`⚠️  Failed to auto-load engines: ${error}`);
        console.log('ℹ️  You can manually load engines using the load-config command');
    }
}

async function recordGame(engine1Id: number, engine2Id: number, isDraw: boolean = false): Promise<void> {
    const winnerId = isDraw ? null : engine1Id;

    // Get current ratings
    const engine1 = await pool.query('SELECT rating FROM engines WHERE id = $1', [engine1Id]);
    const engine2 = await pool.query('SELECT rating FROM engines WHERE id = $1', [engine2Id]);

    const rating1Before = engine1.rows[0].rating;
    const rating2Before = engine2.rows[0].rating;

    await pool.query(
        'INSERT INTO games (engine1_id, engine2_id, winner_id, is_draw, engine1_rating_before, engine2_rating_before) VALUES ($1, $2, $3, $4, $5, $6)',
        [engine1Id, engine2Id, winnerId, isDraw, rating1Before, rating2Before]
    );
}

async function recordGameResult(gameResult: GameResult): Promise<void> {
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

    // Record the game
    await pool.query(
        'INSERT INTO games (engine1_id, engine2_id, winner_id, is_draw, engine1_rating_before, engine2_rating_before) VALUES ($1, $2, $3, $4, $5, $6)',
        [gameResult.engine1Id, gameResult.engine2Id, winnerId, isDraw, rating1Before, rating2Before]
    );

    // Update ratings
    if (gameResult.result !== 'error') {
        await updateRatings(gameResult.engine1Id, gameResult.engine2Id, isDraw);
    }
}

async function playGame(engine1Id: number, engine2Id: number, timeControl: string): Promise<GameResult> {
    // Get engine details
    const engine1Query = await pool.query('SELECT * FROM engines WHERE id = $1 AND enabled = true', [engine1Id]);
    const engine2Query = await pool.query('SELECT * FROM engines WHERE id = $1 AND enabled = true', [engine2Id]);

    if (engine1Query.rows.length === 0 || engine2Query.rows.length === 0) {
        throw new Error('One or both engines not found or disabled');
    }

    const engine1 = engine1Query.rows[0];
    const engine2 = engine2Query.rows[0];

    console.log(`🎯 ${engine1.name} vs ${engine2.name}`);

    try {
        // Run the actual game between engines
        const result = await runEngineGame(engine1, engine2, timeControl);

        console.log(`🏁 Game result: ${result.result}`);
        return result;
    } catch (error) {
        console.error(`❌ Game error: ${error}`);
        return {
            engine1Id,
            engine2Id,
            result: 'error',
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

async function runEngineGame(engine1: any, engine2: any, timeControl: string): Promise<GameResult> {
    console.log(`⏱️  Time control: ${timeControl}`);
    console.log(`� Starting engines...`);

    const startTime = Date.now();
    let engineProcesses: EngineProcess[] = [];
    let moves: string[] = [];

    try {
        // Start both engine processes
        const engine1Process = await startEngine(engine1);
        const engine2Process = await startEngine(engine2);

        engineProcesses = [engine1Process, engine2Process];

        console.log(`✅ Both engines started`);

        // Play the game
        let gameStatus: GameStatus = { inProgress: true, playerToMove: 1 };
        let moveCount = 0;
        const maxMoves = 500; // Prevent infinite games

        while (gameStatus.inProgress && moveCount < maxMoves) {
            const currentPlayer = gameStatus.playerToMove;
            const currentEngine = currentPlayer === 1 ? engine1Process : engine2Process;

            console.log(`🎮 Move ${moveCount + 1}: ${currentEngine.name} to play`);

            // Request move from current player
            const move = await getEngineMove(currentEngine, timeControl);
            if (!move) {
                throw new Error(`Engine ${currentEngine.name} failed to provide a move`);
            }

            moves.push(move);
            console.log(`📝 Move: ${move}`);

            // Send move to both engines
            await sendMoveToEngine(engine1Process, move);
            await sendMoveToEngine(engine2Process, move);

            // Check game status
            gameStatus = await getGameStatus(engine1Process);
            moveCount++;

            // Small delay to prevent overwhelming the engines
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Determine winner based on final status
        const duration = Date.now() - startTime;
        let result: 'win' | 'loss' | 'draw' | 'error';

        if (!gameStatus.inProgress) {
            // Game finished normally
            if (gameStatus.player1Result === 'win') {
                result = 'win';
            } else if (gameStatus.player2Result === 'win') {
                result = 'loss';
            } else {
                result = 'draw';
            }
        } else {
            // Game exceeded max moves
            console.log(`⚠️  Game exceeded ${maxMoves} moves, declaring draw`);
            result = 'draw';
        }

        return {
            engine1Id: engine1.id,
            engine2Id: engine2.id,
            result,
            moves,
            duration,
            finalStatus: JSON.stringify(gameStatus)
        };

    } finally {
        // Clean up engine processes
        engineProcesses.forEach(engineProc => {
            if (engineProc.process && !engineProc.process.killed) {
                engineProc.process.kill();
            }
        });
    }
}

async function startEngine(engineConfig: any): Promise<EngineProcess> {
    return new Promise((resolve, reject) => {
        const args = engineConfig.arguments ? JSON.parse(engineConfig.arguments) : [];
        const engineProcess = spawn(engineConfig.executable, args, {
            cwd: engineConfig.working_directory || process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let isReady = false;

        const timeout = setTimeout(() => {
            if (!isReady) {
                engineProcess.kill();
                reject(new Error(`Engine ${engineConfig.name} failed to start within timeout`));
            }
        }, 10000); // 10 second timeout

        engineProcess.stdout?.on('data', (data: Buffer) => {
            const output = data.toString().trim();
            if (output.includes('ugiok') || output.includes('ready')) {
                if (!isReady) {
                    isReady = true;
                    clearTimeout(timeout);
                    resolve({
                        process: engineProcess,
                        name: engineConfig.name,
                        id: engineConfig.id
                    });
                }
            }
        });

        engineProcess.stderr?.on('data', (data: Buffer) => {
            console.error(`Engine ${engineConfig.name} stderr: ${data.toString().trim()}`);
        });

        engineProcess.on('error', (error: Error) => {
            clearTimeout(timeout);
            reject(new Error(`Failed to start engine ${engineConfig.name}: ${error.message}`));
        });

        engineProcess.on('exit', (code: number | null) => {
            if (!isReady) {
                clearTimeout(timeout);
                reject(new Error(`Engine ${engineConfig.name} exited with code ${code}`));
            }
        });

        // Send initial UGI commands
        engineProcess.stdin?.write('ugi\n');
        engineProcess.stdin?.write('isready\n');
    });
}

async function getEngineMove(engineProc: EngineProcess, timeControl: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve(null);
            }
        }, 30000); // 30 second timeout for move

        const onData = (data: Buffer) => {
            const output = data.toString().trim();
            const lines = output.split('\n');

            for (const line of lines) {
                if (line.startsWith('bestmove ')) {
                    const parts = line.split(' ');
                    const move = parts.length > 1 ? parts[1] : null;
                    if (!resolved && move) {
                        resolved = true;
                        clearTimeout(timeout);
                        engineProc.process.stdout?.off('data', onData);
                        resolve(move);
                    }
                    return;
                }
            }
        };

        engineProc.process.stdout?.on('data', onData);

        // Send go command
        engineProc.process.stdin?.write(`go\n`);
    });
}

async function sendMoveToEngine(engineProc: EngineProcess, move: string): Promise<void> {
    engineProc.process.stdin?.write(`makemove ${move}\n`);
    // Small delay to ensure command is processed
    await new Promise(resolve => setTimeout(resolve, 50));
}

async function getGameStatus(engineProc: EngineProcess): Promise<GameStatus> {
    return new Promise((resolve, reject) => {
        let resolved = false;
        let gameStatus: GameStatus = { inProgress: true, playerToMove: 1 };

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve(gameStatus);
            }
        }, 5000); // 5 second timeout

        const onData = (data: Buffer) => {
            const output = data.toString().trim();
            const lines = output.split('\n');

            for (const line of lines) {
                if (line.includes('info gamestatus')) {
                    const parts = line.split(' ');
                    const statusIndex = parts.indexOf('gamestatus') + 1;
                    const playerToMoveIndex = parts.indexOf('playertomove') + 1;

                    if (statusIndex > 0 && statusIndex < parts.length) {
                        gameStatus.inProgress = parts[statusIndex] === 'inprogress';
                    }
                    if (playerToMoveIndex > 0 && playerToMoveIndex < parts.length) {
                        const playerToMoveStr = parts[playerToMoveIndex];
                        if (playerToMoveStr) {
                            gameStatus.playerToMove = parseInt(playerToMoveStr);
                        }
                    }
                } else if (line.includes('info player')) {
                    const parts = line.split(' ');
                    const playerIndex = parts.indexOf('player') + 1;
                    const resultIndex = parts.indexOf('result') + 1;
                    const scoreIndex = parts.indexOf('score') + 1;

                    if (playerIndex > 0 && playerIndex < parts.length && resultIndex > 0) {
                        const playerNumStr = parts[playerIndex];
                        if (playerNumStr) {
                            const playerNum = parseInt(playerNumStr);
                            const result = resultIndex < parts.length ? parts[resultIndex] : undefined;
                            const score = scoreIndex < parts.length ? parts[scoreIndex] : undefined;

                            if (playerNum === 1) {
                                if (result) gameStatus.player1Result = result;
                                if (score) gameStatus.player1Score = score;
                            } else if (playerNum === 2) {
                                if (result) gameStatus.player2Result = result;
                                if (score) gameStatus.player2Score = score;
                            }
                        }
                    }
                }
            }

            // If we have all the info we need, resolve
            if (!resolved && gameStatus.player1Result !== undefined && gameStatus.player2Result !== undefined) {
                resolved = true;
                clearTimeout(timeout);
                engineProc.process.stdout?.off('data', onData);
                resolve(gameStatus);
            }
        };

        engineProc.process.stdout?.on('data', onData);

        // Send status command
        engineProc.process.stdin?.write('status\n');
    });
} async function runTournament(options: {
    rounds: number;
    gamesPerPair: number;
    concurrency: number;
    timeControl: string;
}): Promise<{ totalGames: number; wins: number; draws: number; errors: number }> {
    console.log(`🏆 Tournament settings:`);
    console.log(`   Rounds: ${options.rounds}`);
    console.log(`   Games per pair: ${options.gamesPerPair}`);
    console.log(`   Concurrency: ${options.concurrency}`);
    console.log(`   Time control: ${options.timeControl}`);

    // Get all enabled engines
    const enginesQuery = await pool.query('SELECT id, name FROM engines WHERE enabled = true ORDER BY id');
    const engines = enginesQuery.rows;

    if (engines.length < 2) {
        throw new Error('Need at least 2 enabled engines to run a tournament');
    }

    console.log(`🎮 ${engines.length} engines participating:`);
    engines.forEach(engine => console.log(`   - ${engine.name} (ID: ${engine.id})`));

    let totalGames = 0;
    let wins = 0;
    let draws = 0;
    let errors = 0;

    // Generate all pairings
    const pairings: Array<[number, number]> = [];
    for (let i = 0; i < engines.length; i++) {
        for (let j = i + 1; j < engines.length; j++) {
            for (let round = 0; round < options.rounds; round++) {
                for (let game = 0; game < options.gamesPerPair; game++) {
                    // Alternate colors for fairness
                    if (game % 2 === 0) {
                        pairings.push([engines[i].id, engines[j].id]);
                    } else {
                        pairings.push([engines[j].id, engines[i].id]);
                    }
                }
            }
        }
    }

    console.log(`📊 Total games to play: ${pairings.length}`);

    // Play games with limited concurrency
    const semaphore = new Array(options.concurrency).fill(null);
    let gameIndex = 0;

    while (gameIndex < pairings.length) {
        const batch = pairings.slice(gameIndex, gameIndex + options.concurrency);
        gameIndex += batch.length;

        const gamePromises = batch.map(async ([engine1Id, engine2Id]) => {
            try {
                const result = await playGame(engine1Id, engine2Id, options.timeControl);
                await recordGameResult(result);

                totalGames++;
                if (result.result === 'win' || result.result === 'loss') wins++;
                if (result.result === 'draw') draws++;
                if (result.error) errors++;

                console.log(`📈 Progress: ${totalGames}/${pairings.length} games completed`);
                return result;
            } catch (error) {
                errors++;
                console.error(`❌ Game failed: ${error}`);
                return null;
            }
        });

        await Promise.all(gamePromises);
    }

    return { totalGames, wins, draws, errors };
}

async function updateRatings(engine1Id: number, engine2Id: number, isDraw: boolean = false): Promise<void> {
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

async function getRankings(limit: number = 10, detailed: boolean = false): Promise<any[]> {
    const fields = detailed
        ? 'name, rating, games_played, wins, losses, draws, executable, description'
        : 'name, rating, games_played, wins, losses, draws';

    const result = await pool.query(
        `SELECT ${fields} FROM engines WHERE enabled = true ORDER BY rating DESC LIMIT $1`,
        [limit]
    );
    return result.rows;
}

async function listEngines(enabledOnly: boolean = false): Promise<any[]> {
    const whereClause = enabledOnly ? 'WHERE enabled = true' : '';
    const result = await pool.query(
        `SELECT name, rating, games_played, wins, losses, draws, executable, working_directory, arguments, description, enabled 
         FROM engines ${whereClause} ORDER BY name`
    );
    return result.rows;
}

// Main execution
async function main() {
    console.log('🎮 UGI Rankings System');
    console.log(`📊 TensorFlow.js version: ${tf.version.tfjs}`);

    // Auto-load engines from config file on startup
    await autoLoadEngines();

    try {
        await program.parseAsync();
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🔄 Shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🔄 Shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

main().catch(console.error);
