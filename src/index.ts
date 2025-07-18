import { Pool } from 'pg';
import dotenv from 'dotenv';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import {
    createDatabasePool,
    initializeDatabase,
    addEngine,
    updateRatings,
    getRankings,
    listEngines,
    recordGameResult,
    getRecentGames,
    getPairGameCounts
} from './database';

// Types
interface EngineConfig {
    name: string;
    executable: string;
    workingDirectory: string;
    arguments: string[];
    initialRating: number;
    description?: string;
    enabled?: boolean;
    options?: { [key: string]: string | number | boolean };
    env?: { [key: string]: string };
}

interface StartingPosition {
    name: string;
    description?: string;
    moves: string[];
    fen?: string; // Optional FEN string for non-standard starting positions
}

interface MatchSet {
    name: string;
    description?: string;
    startingPositions: StartingPosition[];
    gamesPerPosition: number; // Number of games per starting position (must be even for color balance)
}

interface TournamentConfig {
    tournament: {
        name: string;
        description?: string;
        timeControl?: string;
        rounds?: number;
        gamesPerPair?: number;
        concurrency?: number;
        matchSets?: MatchSet[];
        defaultMatchSet?: string; // Name of default match set to use
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
    startingPosition?: string;
    matchSetName?: string;
    engine1Color: 'white' | 'black';
    engine2Color: 'white' | 'black';
}

interface MatchSetResult {
    engine1Id: number;
    engine2Id: number;
    matchSetName: string;
    games: GameResult[];
    engine1Score: number; // Total score for engine1 (wins = 1, draws = 0.5, losses = 0)
    engine2Score: number; // Total score for engine2
    totalGames: number;
    completed: boolean;
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
const pool = createDatabasePool();

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
            await initializeDatabase(pool);
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
        } catch (error) {
            console.error('❌ Failed to load engines from config:', error);
            process.exit(1);
        }
    });

// Run tournament command
program
    .command('run-tournament')
    .description('Run continuous tournament with intelligent pairing selection')
    .option('-r, --rounds <rounds>', 'Target rounds per engine pair (for weighting)', '1')
    .option('-p, --pairs <pairs>', 'Target games per engine pair (for weighting)', '1')
    .option('-c, --concurrency <concurrency>', 'Number of concurrent games', '1')
    .option('--time-control <time>', 'Time control (e.g., "60+1" for 60s + 1s increment)', '10+0.1')
    .action(async (options) => {
        try {
            console.log('🏁 Starting continuous tournament...');
            console.log('Press Ctrl+C to stop gracefully');
            const result = await runTournament({
                rounds: parseInt(options.rounds),
                gamesPerPair: parseInt(options.pairs),
                concurrency: parseInt(options.concurrency),
                timeControl: options.timeControl
            });
            console.log(`✅ Tournament stopped: ${result.totalGames} games played`);
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
            await recordGameResult(pool, result);
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
            const rankings = await getRankings(pool, parseInt(options.limit), options.detailed);
            console.log('\n🏆 Current Rankings:');

            if (options.detailed) {
                console.log('Rank | Engine Name        | Rating | Games | W/L/D | Description');
                console.log('-----|-------------------|--------|-------|-------|------------------');
                rankings.forEach((engine, index) => {
                    const wld = `${engine.wins}/${engine.losses}/${engine.draws}`;
                    const description = engine.description || 'N/A';
                    console.log(`${(index + 1).toString().padStart(4)} | ${engine.name.padEnd(17)} | ${engine.rating.toString().padStart(6)} | ${engine.games_played.toString().padStart(5)} | ${wld.padEnd(5)} | ${description}`);
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
    .action(async (options) => {
        try {
            const engines = await listEngines(pool);
            console.log('\n🔧 Engine Configuration:');
            console.log('');

            engines.forEach((engine, index) => {
                console.log(`${index + 1}. ${engine.name}`);
                console.log(`   Rating: ${engine.rating} | Games: ${engine.games_played}`);
                const wld = `${engine.wins}/${engine.losses}/${engine.draws}`;
                console.log(`   Record: ${wld}`);
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

// Load engine configuration and merge with database info
async function getEngineWithConfig(engineDbRow: any): Promise<any> {
    try {
        const configFile = path.resolve(DEFAULT_CONFIG_FILE);
        if (!fs.existsSync(configFile)) {
            throw new Error(`Configuration file not found: ${configFile}`);
        }

        const configData = fs.readFileSync(configFile, 'utf8');
        const config: TournamentConfig = JSON.parse(configData);

        const engineConfig = config.engines.find(e => e.name === engineDbRow.name);
        if (!engineConfig) {
            throw new Error(`Engine configuration not found for: ${engineDbRow.name}`);
        }

        // Merge database info with configuration
        return {
            ...engineDbRow,
            executable: engineConfig.executable,
            workingDirectory: engineConfig.workingDirectory,
            arguments: engineConfig.arguments,
            options: engineConfig.options || {},
            env: engineConfig.env || {},
            enabled: engineConfig.enabled,
            working_directory: engineConfig.workingDirectory // For backward compatibility
        };
    } catch (error) {
        console.error(`❌ Failed to load configuration for engine ${engineDbRow.name}:`, error);
        throw error;
    }
}

async function loadEnginesFromConfig(configPath: string, replace: boolean = false): Promise<{ loaded: number; skipped: number }> {
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

    console.log(`📋 Tournament: ${config.tournament.name}`);
    if (config.tournament.description) {
        console.log(`📝 Description: ${config.tournament.description}`);
    }

    for (const engineConfig of config.engines) {
        try {
            // Check if engine already exists
            const existing = await pool.query('SELECT id FROM engines WHERE name = $1', [engineConfig.name]);

            if (existing.rows.length > 0) {
                if (replace) {
                    // Update existing engine
                    await pool.query(
                        'UPDATE engines SET description = $1, rating = $2 WHERE name = $3',
                        [
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
                    pool,
                    engineConfig.name,
                    engineConfig.initialRating,
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

    return { loaded, skipped };
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

        // Show total engine count
        const totalEngines = await pool.query('SELECT COUNT(*) as count FROM engines');
        console.log(`🎮 Total engines: ${totalEngines.rows[0].count}`);

    } catch (error) {
        console.warn(`⚠️  Failed to auto-load engines: ${error}`);
        console.log('ℹ️  You can manually load engines using the load-config command');
    }
}

async function playMatchSet(
    engine1Id: number,
    engine2Id: number,
    timeControl: string,
    matchSet: MatchSet
): Promise<MatchSetResult> {
    console.log(`🎯 Starting match set: ${matchSet.name}`);
    console.log(`   ${matchSet.startingPositions.length} positions × 2 games each = ${matchSet.startingPositions.length * 2} total games`);

    const games: GameResult[] = [];
    let engine1Score = 0;
    let engine2Score = 0;

    try {
        // Play each starting position with both color assignments
        for (const startingPosition of matchSet.startingPositions) {
            console.log(`🎮 Playing position: ${startingPosition.name}`);

            // Game 1: engine1 as white, engine2 as black
            console.log(`   Game 1/2: Engine ${engine1Id} (white) vs Engine ${engine2Id} (black)`);
            const game1 = await playGame(
                engine1Id,
                engine2Id,
                timeControl,
                startingPosition,
                matchSet.name,
                'white'
            );
            games.push(game1);

            // Update scores based on game1 result
            if (game1.result === 'win') {
                engine1Score += 1;
            } else if (game1.result === 'loss') {
                engine2Score += 1;
            } else if (game1.result === 'draw') {
                engine1Score += 0.5;
                engine2Score += 0.5;
            }

            // Small delay between games
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Game 2: engine1 as black, engine2 as white
            console.log(`   Game 2/2: Engine ${engine1Id} (black) vs Engine ${engine2Id} (white)`);
            const game2 = await playGame(
                engine1Id,
                engine2Id,
                timeControl,
                startingPosition,
                matchSet.name,
                'black'
            );
            games.push(game2);

            // Update scores based on game2 result
            if (game2.result === 'win') {
                engine1Score += 1;
            } else if (game2.result === 'loss') {
                engine2Score += 1;
            } else if (game2.result === 'draw') {
                engine1Score += 0.5;
                engine2Score += 0.5;
            }

            console.log(`   Position complete. Running score: ${engine1Score}-${engine2Score}`);

            // Small delay between positions
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const totalGames = games.length;
        console.log(`✅ Match set complete: ${matchSet.name}`);
        console.log(`   Final score: ${engine1Score}-${engine2Score} (${totalGames} games)`);

        return {
            engine1Id,
            engine2Id,
            matchSetName: matchSet.name,
            games,
            engine1Score,
            engine2Score,
            totalGames,
            completed: true
        };

    } catch (error) {
        console.error(`❌ Match set failed: ${error}`);

        return {
            engine1Id,
            engine2Id,
            matchSetName: matchSet.name,
            games,
            engine1Score,
            engine2Score,
            totalGames: games.length,
            completed: false
        };
    }
}

async function recordMatchSetResult(pool: Pool, matchSetResult: MatchSetResult): Promise<void> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Record each individual game
        for (const game of matchSetResult.games) {
            await recordGameResult(pool, game, false); // Don't update ratings yet
        }

        // Calculate rating changes based on match set aggregate score
        const engine1Query = await client.query('SELECT rating FROM engines WHERE id = $1', [matchSetResult.engine1Id]);
        const engine2Query = await client.query('SELECT rating FROM engines WHERE id = $1', [matchSetResult.engine2Id]);

        if (engine1Query.rows.length === 0 || engine2Query.rows.length === 0) {
            throw new Error('Engine not found for rating update');
        }

        const engine1Rating = engine1Query.rows[0].rating;
        const engine2Rating = engine2Query.rows[0].rating;

        // Calculate expected scores using Elo formula
        const expectedScore1 = 1 / (1 + Math.pow(10, (engine2Rating - engine1Rating) / 400));
        const expectedScore2 = 1 - expectedScore1;

        // Actual scores as percentages
        const actualScore1 = matchSetResult.engine1Score / matchSetResult.totalGames;
        const actualScore2 = matchSetResult.engine2Score / matchSetResult.totalGames;

        // K-factor (rating volatility)
        const K = 32;

        // Calculate rating changes
        const ratingChange1 = Math.round(K * (actualScore1 - expectedScore1));
        const ratingChange2 = Math.round(K * (actualScore2 - expectedScore2));

        const newRating1 = engine1Rating + ratingChange1;
        const newRating2 = engine2Rating + ratingChange2;

        // Update ratings
        await client.query('UPDATE engines SET rating = $1 WHERE id = $2', [newRating1, matchSetResult.engine1Id]);
        await client.query('UPDATE engines SET rating = $1 WHERE id = $2', [newRating2, matchSetResult.engine2Id]);

        await client.query('COMMIT');

        console.log(`📈 Ratings updated:`);
        console.log(`   Engine ${matchSetResult.engine1Id}: ${engine1Rating} → ${newRating1} (${ratingChange1 >= 0 ? '+' : ''}${ratingChange1})`);
        console.log(`   Engine ${matchSetResult.engine2Id}: ${engine2Rating} → ${newRating2} (${ratingChange2 >= 0 ? '+' : ''}${ratingChange2})`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Failed to record match set result:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function playGame(
    engine1Id: number,
    engine2Id: number,
    timeControl: string,
    startingPosition?: StartingPosition,
    matchSetName?: string,
    engine1Color: 'white' | 'black' = 'white'
): Promise<GameResult> {
    // Get engine details
    const engine1Query = await pool.query('SELECT * FROM engines WHERE id = $1', [engine1Id]);
    const engine2Query = await pool.query('SELECT * FROM engines WHERE id = $1', [engine2Id]);

    if (engine1Query.rows.length === 0 || engine2Query.rows.length === 0) {
        throw new Error('One or both engines not found');
    }

    const engine1 = engine1Query.rows[0];
    const engine2 = engine2Query.rows[0];

    console.log(`🎯 ${engine1.name} vs ${engine2.name}`);

    try {
        // Run the actual game between engines
        const result = await runEngineGame(engine1, engine2, timeControl, startingPosition, matchSetName, engine1Color);

        console.log(`🏁 Game result: ${result.result}`);
        return result;
    } catch (error) {
        console.error(`❌ Game error: ${error}`);
        return {
            engine1Id,
            engine2Id,
            result: 'error',
            error: error instanceof Error ? error.message : String(error),
            engine1Color,
            engine2Color: engine1Color === 'white' ? 'black' : 'white',
            ...(startingPosition && { startingPosition: startingPosition.name }),
            ...(matchSetName && { matchSetName })
        };
    }
}

async function runEngineGame(
    engine1: any,
    engine2: any,
    timeControl: string,
    startingPosition?: StartingPosition,
    matchSetName?: string,
    engine1Color: 'white' | 'black' = 'white'
): Promise<GameResult> {
    console.log(`⏱️  Time control: ${timeControl}`);
    console.log(`� Starting engines...`);

    const startTime = Date.now();
    let engineProcesses: EngineProcess[] = [];
    let moves: string[] = [];

    try {
        // Get engine configurations
        const engine1Config = await getEngineWithConfig(engine1);
        const engine2Config = await getEngineWithConfig(engine2);

        // Start both engine processes
        const engine1Process = await startEngine(engine1Config, startingPosition ? {} : undefined);
        const engine2Process = await startEngine(engine2Config, startingPosition ? {} : undefined);

        engineProcesses = [engine1Process, engine2Process];

        console.log(`✅ Both engines started`);

        // Set up starting position if provided
        if (startingPosition) {
            console.log(`🎯 Using starting position: ${startingPosition.name}`);

            // Send starting moves to both engines
            if (startingPosition.moves && startingPosition.moves.length > 0) {
                for (const move of startingPosition.moves) {
                    await sendMoveToEngine(engine1Process, move);
                    await sendMoveToEngine(engine2Process, move);
                }
                console.log(`📋 Applied ${startingPosition.moves.length} starting moves`);
            }
        }

        // Play the game
        let gameStatus: GameStatus = { inProgress: true, playerToMove: 1 };
        let moveCount = startingPosition?.moves?.length || 0;
        const maxMoves = 500; // Prevent infinite games

        while (gameStatus.inProgress && moveCount < maxMoves) {
            const currentPlayer = gameStatus.playerToMove;

            // Determine which engine plays based on color assignment
            // Player 1 is white, Player 2 is black
            let currentEngine: EngineProcess;
            if (currentPlayer === 1) {
                // White's turn
                currentEngine = engine1Color === 'white' ? engine1Process : engine2Process;
            } else {
                // Black's turn
                currentEngine = engine1Color === 'black' ? engine1Process : engine2Process;
            }

            console.log(`🎮 Move ${moveCount + 1}: ${currentEngine.name} (${currentPlayer === 1 ? 'white' : 'black'}) to play`);

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
            finalStatus: JSON.stringify(gameStatus),
            engine1Color,
            engine2Color: engine1Color === 'white' ? 'black' : 'white',
            ...(startingPosition && { startingPosition: startingPosition.name }),
            ...(matchSetName && { matchSetName })
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

async function startEngine(engineConfig: any, options?: { [key: string]: string | number | boolean }): Promise<EngineProcess> {
    return new Promise((resolve, reject) => {
        const args = engineConfig.arguments ? JSON.parse(engineConfig.arguments) : [];
        
        // Merge system environment with engine-specific environment variables
        const processEnv = {
            ...process.env,
            ...engineConfig.env
        };

        // Log environment variables if any are set
        if (engineConfig.env && Object.keys(engineConfig.env).length > 0) {
            console.log(`Setting environment variables for ${engineConfig.name}:`, engineConfig.env);
        }

        const engineProcess = spawn(engineConfig.executable, args, {
            cwd: engineConfig.working_directory || process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: processEnv
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
            if (output.includes('ugiok')) {
                // Send engine options if provided
                const allOptions = { ...engineConfig.options, ...options };
                if (allOptions && Object.keys(allOptions).length > 0) {
                    console.log(`Setting options for ${engineConfig.name}:`, allOptions);
                    for (const [name, value] of Object.entries(allOptions)) {
                        engineProcess.stdin?.write(`setoption name ${name} value ${value}\n`);
                    }
                }

                // Send isready after options
                engineProcess.stdin?.write('isready\n');
            } else if (output.includes('readyok')) {
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

        // Send initial UGI command
        engineProcess.stdin?.write('ugi\n');
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
    console.log(`🏆 Continuous Tournament settings:`);
    console.log(`   Target games: ${options.rounds * options.gamesPerPair} per engine pair`);
    console.log(`   Concurrent games: ${options.concurrency}`);
    console.log(`   Time control: ${options.timeControl}`);

    // Get tournament configuration if available
    let tournamentConfig: TournamentConfig | undefined;
    try {
        if (fs.existsSync(DEFAULT_CONFIG_FILE)) {
            const configData = fs.readFileSync(DEFAULT_CONFIG_FILE, 'utf8');
            tournamentConfig = JSON.parse(configData);
        }
    } catch (error) {
        console.warn('⚠️  Could not load tournament configuration for match sets');
    }

    // Get all engines
    const enginesQuery = await pool.query('SELECT id, name, rating, games_played FROM engines ORDER BY id');
    const engines = enginesQuery.rows;

    if (engines.length < 2) {
        throw new Error('Need at least 2 engines to run a tournament');
    }

    console.log(`🎮 ${engines.length} engines participating:`);
    engines.forEach(engine => console.log(`   - ${engine.name} (ID: ${engine.id}, Rating: ${engine.rating})`));

    let totalGames = 0;
    let wins = 0;
    let draws = 0;
    let errors = 0;
    let shouldContinue = true;

    // Graceful shutdown handler
    const handleShutdown = () => {
        console.log('\n🛑 Graceful shutdown requested...');
        shouldContinue = false;
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    // Track running games to maintain concurrency
    const runningGames = new Set<Promise<any>>();

    console.log(`\n🚀 Starting continuous tournament with ${options.concurrency} concurrent games...`);
    console.log('Press Ctrl+C to stop gracefully\n');

    try {
        while (shouldContinue) {
            // Remove completed games from tracking
            for (const gamePromise of runningGames) {
                if (await isPromiseSettled(gamePromise)) {
                    runningGames.delete(gamePromise);
                }
            }

            // Start new games up to concurrency limit
            while (runningGames.size < options.concurrency && shouldContinue) {
                // Select optimal pairing using weighted sampling
                const pairing = await selectOptimalPairing(engines, tournamentConfig);
                if (!pairing) {
                    console.log('⚠️  No suitable pairings found, waiting...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }

                const { engine1Id, engine2Id, matchSet } = pairing;

                // Start the match set asynchronously
                const gamePromise = (async () => {
                    try {
                        const matchSetResult = await playMatchSet(
                            engine1Id,
                            engine2Id,
                            options.timeControl,
                            matchSet
                        );
                        await recordMatchSetResult(pool, matchSetResult);

                        totalGames += matchSetResult.totalGames;
                        const wins = matchSetResult.games.filter(g => g.result === 'win' || g.result === 'loss').length;
                        const draws = matchSetResult.games.filter(g => g.result === 'draw').length;
                        const gameErrors = matchSetResult.games.filter(g => g.error).length;

                        totalGames += wins;
                        totalGames += draws;
                        if (gameErrors > 0) errors += gameErrors;

                        // Update our local engine data
                        const updatedEngines = await pool.query('SELECT id, name, rating, games_played FROM engines ORDER BY id');
                        engines.length = 0;
                        engines.push(...updatedEngines.rows);

                        console.log(`📈 Match set completed: ${totalGames} total games | Running: ${runningGames.size}/${options.concurrency}`);
                        return matchSetResult;
                    } catch (error) {
                        errors++;
                        console.error(`❌ Match set failed: ${error}`);
                        return null;
                    }
                })();

                runningGames.add(gamePromise);
            }

            // Small delay to prevent busy waiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Wait for all running games to complete
        console.log(`\n⏳ Waiting for ${runningGames.size} remaining games to complete...`);
        await Promise.all(runningGames);

    } finally {
        // Remove shutdown handlers
        process.off('SIGINT', handleShutdown);
        process.off('SIGTERM', handleShutdown);
    }

    console.log(`\n✅ Tournament stopped gracefully`);
    return { totalGames, wins, draws, errors };
}

// Helper function to check if a promise is settled
async function isPromiseSettled(promise: Promise<any>): Promise<boolean> {
    try {
        const result = await Promise.race([
            promise,
            new Promise(resolve => setTimeout(() => resolve(Symbol('timeout')), 0))
        ]);
        return result !== Symbol('timeout');
    } catch {
        return true; // Promise rejected, so it's settled
    }
}

// Calculate uncertainty for an engine based on games played and rating volatility
function calculateUncertainty(engine: any, recentGames: any[]): number {
    const baseUncertainty = Math.max(0.1, 1.0 - (engine.games_played / 100)); // Decreases with more games

    // Add volatility based on recent rating changes
    if (recentGames.length >= 2) {
        const ratingChanges = recentGames.slice(-10).map((game: any) =>
            Math.abs((game.engine1_rating_after || game.engine1_rating_before) - game.engine1_rating_before)
        );
        const avgChange = ratingChanges.reduce((a: number, b: number) => a + b, 0) / ratingChanges.length;
        const volatility = Math.min(0.5, avgChange / 100); // Normalize to 0-0.5
        return Math.min(1.0, baseUncertainty + volatility);
    }

    return baseUncertainty;
}

// Select optimal pairing using weighted sampling
async function selectOptimalPairing(engines: any[], tournamentConfig?: TournamentConfig): Promise<{
    engine1Id: number;
    engine2Id: number;
    matchSet: MatchSet;
} | null> {
    if (engines.length < 2) return null;

    // Get recent games for uncertainty calculation
    const recentGames = await getRecentGames(pool, 24);

    // Get game counts between each pair
    const pairCounts = await getPairGameCounts(pool);

    // Get match set configuration
    let matchSet: MatchSet | undefined;
    if (tournamentConfig?.tournament.matchSets && tournamentConfig.tournament.matchSets.length > 0) {
        const defaultMatchSetName = tournamentConfig.tournament.defaultMatchSet;
        if (defaultMatchSetName) {
            matchSet = tournamentConfig.tournament.matchSets.find(ms => ms.name === defaultMatchSetName);
        }
        if (!matchSet) {
            matchSet = tournamentConfig.tournament.matchSets[0]; // Use first match set as fallback
        }
    }

    // If no match set is configured, create a default one
    if (!matchSet) {
        matchSet = {
            name: "Standard",
            description: "Standard starting position",
            startingPositions: [{
                name: "Initial Position",
                description: "Standard chess starting position",
                moves: []
            }],
            gamesPerPosition: 2
        };
    }

    // Calculate weights for all possible pairings
    const pairings: Array<{
        engines: [number, number],
        weight: number
    }> = [];

    for (let i = 0; i < engines.length; i++) {
        for (let j = i + 1; j < engines.length; j++) {
            const engine1 = engines[i];
            const engine2 = engines[j];

            // Calculate individual uncertainties
            const uncertainty1 = calculateUncertainty(engine1, recentGames.filter(g =>
                g.engine1_id === engine1.id || g.engine2_id === engine1.id));
            const uncertainty2 = calculateUncertainty(engine2, recentGames.filter(g =>
                g.engine1_id === engine2.id || g.engine2_id === engine2.id));

            // Rating difference factor (prefer closer ratings)
            const ratingDiff = Math.abs(engine1.rating - engine2.rating);
            const ratingProximity = 1.0 / (1.0 + ratingDiff / 200); // Normalize by rating scale

            // High rating preference (prefer higher rated engines)
            const avgRating = (engine1.rating + engine2.rating) / 2;
            const ratingPreference = Math.min(1.0, avgRating / 2000); // Normalize to typical rating range

            // Game count factor (prefer pairs with fewer games)
            const pairKey = `${engine1.id}-${engine2.id}`;
            const gameCount = pairCounts.get(pairKey) || 0;
            const gameFrequency = Math.max(0.1, 1.0 - (gameCount / 50)); // Decreases with more games

            // Combined weight
            const uncertaintyWeight = (uncertainty1 + uncertainty2) / 2;
            const weight = uncertaintyWeight * 0.4 +
                ratingProximity * 0.3 +
                ratingPreference * 0.2 +
                gameFrequency * 0.1;

            pairings.push({
                engines: [engine1.id, engine2.id],
                weight
            });
        }
    }

    if (pairings.length === 0) return null;

    // Sort by weight and add some randomness to prevent always picking the same pairing
    pairings.sort((a, b) => b.weight - a.weight);

    // Use weighted random selection from top candidates
    const topCandidates = pairings.slice(0, Math.min(5, pairings.length));
    const totalWeight = topCandidates.reduce((sum, p) => sum + p.weight, 0);

    if (totalWeight === 0 || topCandidates.length === 0) {
        // Fallback to random selection
        if (pairings.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * pairings.length);
        const randomPair = pairings[randomIndex];
        return randomPair ? {
            engine1Id: randomPair.engines[0],
            engine2Id: randomPair.engines[1],
            matchSet
        } : null;
    }

    let random = Math.random() * totalWeight;
    for (const pairing of topCandidates) {
        random -= pairing.weight;
        if (random <= 0) {
            return {
                engine1Id: pairing.engines[0],
                engine2Id: pairing.engines[1],
                matchSet
            };
        }
    }

    // Fallback
    const fallback = topCandidates[0];
    return fallback ? {
        engine1Id: fallback.engines[0],
        engine2Id: fallback.engines[1],
        matchSet
    } : null;
}

// Main execution
async function main() {
    console.log('🎮 UGI Rankings System');

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
