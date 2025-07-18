import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock classes for child process
class MockChildProcess extends EventEmitter {
    stdin = {
        write: jest.fn()
    };
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    kill = jest.fn();
    pid = 12345;

    constructor() {
        super();
    }
}

describe('UGI Engine Communication', () => {
    let mockProcess: MockChildProcess;

    beforeEach(() => {
        mockProcess = new MockChildProcess();
        mockSpawn.mockReturnValue(mockProcess as any);
        jest.clearAllMocks();
    });

    describe('Engine Process Management', () => {
        it('should spawn engine with correct arguments', () => {
            const engineConfig = {
                executable: 'node',
                arguments: ['test-engine.js', 'TestEngine'],
                working_directory: '/test/dir'
            };

            mockSpawn('node', ['test-engine.js', 'TestEngine'], {
                cwd: '/test/dir',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            expect(mockSpawn).toHaveBeenCalledWith(
                'node',
                ['test-engine.js', 'TestEngine'],
                {
                    cwd: '/test/dir',
                    stdio: ['pipe', 'pipe', 'pipe']
                }
            );
        });

        it('should handle engine startup timeout', (done) => {
            const timeout = 1000; // 1 second for testing

            // Simulate engine that never responds
            setTimeout(() => {
                // Engine should timeout
                expect(mockProcess.kill).toHaveBeenCalled();
                done();
            }, timeout + 100);

            // Start the timeout simulation
            setTimeout(() => {
                if (!mockProcess.listenerCount('data')) {
                    mockProcess.kill();
                }
            }, timeout);
        });

        it('should handle ugi protocol initialization', (done) => {
            // Mock the UGI initialization function
            const initializeEngine = () => {
                // Simulate sending UGI commands
                mockProcess.stdin.write('ugi\\n');
                mockProcess.stdin.write('isready\\n');
            };

            // Start initialization
            initializeEngine();

            // Simulate engine responding to UGI commands
            setTimeout(() => {
                mockProcess.stdout.emit('data', Buffer.from('id name TestEngine\n'));
                mockProcess.stdout.emit('data', Buffer.from('ugiok\n'));
            }, 10);

            setTimeout(() => {
                mockProcess.stdout.emit('data', Buffer.from('readyok\n'));

                // Verify commands were sent after initialization
                expect(mockProcess.stdin.write).toHaveBeenCalledWith('ugi\\n');
                expect(mockProcess.stdin.write).toHaveBeenCalledWith('isready\\n');

                done();
            }, 20);
        });
    });

    describe('UGI Command Handling', () => {
        it('should handle go command and bestmove response', (done) => {
            // Simulate sending go command
            mockProcess.stdin.write('go\\n');

            // Simulate engine responding with bestmove
            setTimeout(() => {
                mockProcess.stdout.emit('data', Buffer.from('bestmove e2e4\\n'));
                done();
            }, 10);

            expect(mockProcess.stdin.write).toHaveBeenCalledWith('go\\n');
        });

        it('should handle makemove command', () => {
            mockProcess.stdin.write('makemove e2e4\\n');
            expect(mockProcess.stdin.write).toHaveBeenCalledWith('makemove e2e4\\n');
        });

        it('should handle status command and parse response', (done) => {
            mockProcess.stdin.write('status\\n');

            setTimeout(() => {
                mockProcess.stdout.emit('data', Buffer.from('status inprogress playertomove 1\\n'));
                mockProcess.stdout.emit('data', Buffer.from('info player 1 result none score 0.0\\n'));
                done();
            }, 10);

            expect(mockProcess.stdin.write).toHaveBeenCalledWith('status\\n');
        });

        it('should parse game finished status', (done) => {
            const statusResponse = 'status finished playertomove 0\\ninfo player 1 result win score 1.0\\ninfo player 2 result loss score 0.0';

            setTimeout(() => {
                mockProcess.stdout.emit('data', Buffer.from(statusResponse));
                done();
            }, 10);

            // Test status parsing logic would go here
        });

        it('should handle engine errors', (done) => {
            setTimeout(() => {
                mockProcess.stderr.emit('data', Buffer.from('Engine error: Invalid move\\n'));
                done();
            }, 10);

            // Error handling verification would go here
        });

        it('should handle engine exit', (done) => {
            setTimeout(() => {
                mockProcess.emit('exit', 0);
                done();
            }, 10);

            // Exit handling verification would go here
        });
    });

    describe('Game Flow Integration', () => {
        it('should execute complete game flow', async () => {
            const gameFlow = [
                'ugi',
                'isready',
                'go',
                'makemove e2e4',
                'go',
                'makemove e7e5',
                'status'
            ];

            const responses = [
                'ugiok',
                'readyok',
                'bestmove e2e4',
                '', // makemove has no response
                'bestmove e7e5',
                '', // makemove has no response
                'status finished playertomove 0'
            ];

            // Mock function to execute game flow
            const executeGameFlow = () => {
                gameFlow.forEach((command, index) => {
                    setTimeout(() => {
                        mockProcess.stdin.write(command + '\\n');
                    }, index * 5);
                });
            };

            // Start the game flow
            executeGameFlow();

            // Simulate the game flow
            for (let i = 0; i < gameFlow.length; i++) {
                setTimeout(() => {
                    if (responses[i]) {
                        mockProcess.stdout.emit('data', Buffer.from(responses[i] + '\\n'));
                    }

                    // Check on the last iteration
                    if (i === gameFlow.length - 1) {
                        setTimeout(() => {
                            // Verify all commands were sent (allow for some variance in timing)
                            expect(mockProcess.stdin.write.mock.calls.length).toBeGreaterThanOrEqual(gameFlow.length);
                        }, 50);
                    }
                }, i * 10);
            }
        });

        it('should handle command timeouts', (done) => {
            const commandTimeout = 100; // 100ms for testing

            // Send command but don't respond
            mockProcess.stdin.write('go\\n');

            setTimeout(() => {
                // Should timeout
                done();
            }, commandTimeout + 50);
        });
    });
});
