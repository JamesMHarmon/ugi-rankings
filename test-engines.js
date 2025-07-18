#!/usr/bin/env node

// Simple mock UGI engine for testing
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let gameState = 'waiting';
let moveCount = 0;
const engineName = process.argv[2] || 'TestEngine';

console.log(`# ${engineName} starting...`);

rl.on('line', (input) => {
    const command = input.trim();
    const lowerCommand = command.toLowerCase();

    if (lowerCommand === 'ugi') {
        console.log(`id name ${engineName}`);
        console.log(`id author Test`);
        console.log('ugiok');
    } else if (lowerCommand.startsWith('setoption')) {
        // Parse setoption command: setoption name <name> value <value>
        const match = command.match(/setoption name (\w+) value (.+)/i);
        if (match) {
            const optionName = match[1];
            const optionValue = match[2];
            console.log(`# ${engineName} received option: ${optionName} = ${optionValue}`);
        }
    } else if (lowerCommand === 'isready') {
        console.log('readyok');
    } else if (lowerCommand === 'go') {
        // Simulate thinking time
        setTimeout(() => {
            moveCount++;
            // Generate a simple move (in a real game this would be valid)
            const moves = ['a1-a2', 'b1-b2', 'c1-c2', 'd1-d2', 'e1-e2'];
            const move = moves[moveCount % moves.length];
            console.log(`bestmove ${move}`);
        }, 100 + Math.random() * 500); // Random thinking time 100-600ms
    } else if (command.startsWith('makemove ')) {
        const move = command.split(' ')[1];
        console.log(`# Received move: ${move}`);
        moveCount++;
    } else if (command === 'status') {
        // Simulate a game that ends after 10 moves
        if (moveCount >= 10) {
            const winner = Math.random() > 0.5 ? 1 : 2;
            console.log(`status finished playertomove 0`);
            console.log(`info player ${winner} result win score 1.0`);
            console.log(`info player ${winner === 1 ? 2 : 1} result loss score 0.0`);
        } else {
            const playerToMove = (moveCount % 2) + 1;
            console.log(`status inprogress playertomove ${playerToMove}`);
        }
    } else if (command === 'quit') {
        process.exit(0);
    }
});

// Handle process termination
process.on('SIGTERM', () => {
    console.log(`# ${engineName} shutting down...`);
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log(`# ${engineName} shutting down...`);
    process.exit(0);
});
