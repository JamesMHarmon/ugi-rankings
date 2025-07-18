describe('ELO Rating System', () => {

    describe('ELO Calculation Formula', () => {
        const calculateEloChange = (
            ratingA: number,
            ratingB: number,
            scoreA: number,
            k: number = 32
        ): [number, number] => {
            const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
            const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

            const scoreB = 1 - scoreA;

            const newRatingA = Math.round(ratingA + k * (scoreA - expectedA));
            const newRatingB = Math.round(ratingB + k * (scoreB - expectedB));

            return [newRatingA, newRatingB];
        };

        it('should calculate correct rating changes for equal players', () => {
            const [newRating1, newRating2] = calculateEloChange(1500, 1500, 1); // Player 1 wins

            expect(newRating1).toBe(1516); // Winner gains 16 points
            expect(newRating2).toBe(1484); // Loser loses 16 points
            expect(newRating1 + newRating2).toBe(3000); // Total rating preserved
        });

        it('should calculate correct rating changes for draws', () => {
            const [newRating1, newRating2] = calculateEloChange(1500, 1500, 0.5); // Draw

            expect(newRating1).toBe(1500); // No change for equal players in draw
            expect(newRating2).toBe(1500);
        });

        it('should favor underdog wins', () => {
            const [newRating1, newRating2] = calculateEloChange(1400, 1600, 1); // Underdog wins

            expect(newRating1 - 1400).toBeGreaterThan(16); // Underdog gains more than 16
            expect(1600 - newRating2).toBeGreaterThan(16); // Favorite loses more than 16
        });

        it('should minimize rating changes for expected wins', () => {
            const [newRating1, newRating2] = calculateEloChange(1600, 1400, 1); // Favorite wins

            expect(newRating1 - 1600).toBeLessThan(16); // Favorite gains less than 16
            expect(1400 - newRating2).toBeLessThan(16); // Underdog loses less than 16
        });

        it('should handle extreme rating differences', () => {
            const [newRating1, newRating2] = calculateEloChange(1000, 2000, 1); // 1000 point difference

            expect(newRating1 - 1000).toBeCloseTo(32, 0); // Underdog gains almost full K-factor
            expect(2000 - newRating2).toBeCloseTo(32, 0); // Favorite loses almost full K-factor due to unexpected loss
        });

        it('should test K-factor variations', () => {
            const ratings = [
                calculateEloChange(1500, 1500, 1, 16), // K=16
                calculateEloChange(1500, 1500, 1, 32), // K=32
                calculateEloChange(1500, 1500, 1, 64)  // K=64
            ];

            // Higher K-factor should result in larger rating changes
            expect(ratings[0]![0] - 1500).toBeLessThan(ratings[1]![0] - 1500);
            expect(ratings[1]![0] - 1500).toBeLessThan(ratings[2]![0] - 1500);
        });
    });

    describe('Rating System Properties', () => {
        it('should conserve total rating points', () => {
            const testCases = [
                { r1: 1500, r2: 1500, score: 1 },
                { r1: 1400, r2: 1600, score: 0.5 },
                { r1: 1200, r2: 1800, score: 0 },
                { r1: 1000, r2: 2000, score: 1 }
            ];

            testCases.forEach(({ r1, r2, score }) => {
                const calculateEloChange = (
                    ratingA: number,
                    ratingB: number,
                    scoreA: number,
                    k: number = 32
                ): [number, number] => {
                    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
                    const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

                    const scoreB = 1 - scoreA;

                    const newRatingA = Math.round(ratingA + k * (scoreA - expectedA));
                    const newRatingB = Math.round(ratingB + k * (scoreB - expectedB));

                    return [newRatingA, newRatingB];
                };

                const [newR1, newR2] = calculateEloChange(r1, r2, score);
                const totalBefore = r1 + r2;
                const totalAfter = newR1 + newR2;

                // Total should be conserved within rounding error
                expect(Math.abs(totalAfter - totalBefore)).toBeLessThanOrEqual(1);
            });
        });

        it('should handle rating boundaries correctly', () => {
            const calculateEloChange = (
                ratingA: number,
                ratingB: number,
                scoreA: number,
                k: number = 32
            ): [number, number] => {
                const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
                const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

                const scoreB = 1 - scoreA;

                const newRatingA = Math.round(ratingA + k * (scoreA - expectedA));
                const newRatingB = Math.round(ratingB + k * (scoreB - expectedB));

                return [newRatingA, newRatingB];
            };

            // Test very low ratings
            const [lowWin1, lowWin2] = calculateEloChange(100, 200, 1);
            expect(lowWin1).toBeGreaterThan(100);
            expect(lowWin2).toBeLessThan(200);

            // Test very high ratings
            const [highWin1, highWin2] = calculateEloChange(2800, 2900, 1);
            expect(highWin1).toBeGreaterThan(2800);
            expect(highWin2).toBeLessThan(2900);
        });

        it('should be symmetric for player positions', () => {
            const calculateEloChange = (
                ratingA: number,
                ratingB: number,
                scoreA: number,
                k: number = 32
            ): [number, number] => {
                const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
                const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

                const scoreB = 1 - scoreA;

                const newRatingA = Math.round(ratingA + k * (scoreA - expectedA));
                const newRatingB = Math.round(ratingB + k * (scoreB - expectedB));

                return [newRatingA, newRatingB];
            };

            // A beats B
            const [newA1, newB1] = calculateEloChange(1500, 1600, 1);
            // B loses to A (equivalent scenario)
            const [newB2, newA2] = calculateEloChange(1600, 1500, 0);

            expect(newA1).toBe(newA2);
            expect(newB1).toBe(newB2);
        });
    });

    describe('Tournament Rating Evolution', () => {
        it('should simulate multi-game rating progression', () => {
            let engine1Rating = 1500;
            let engine2Rating = 1500;

            const calculateEloChange = (
                ratingA: number,
                ratingB: number,
                scoreA: number,
                k: number = 32
            ): [number, number] => {
                const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
                const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

                const scoreB = 1 - scoreA;

                const newRatingA = Math.round(ratingA + k * (scoreA - expectedA));
                const newRatingB = Math.round(ratingB + k * (scoreB - expectedB));

                return [newRatingA, newRatingB];
            };

            // Simulate engine1 winning several games
            const wins = [1, 1, 1, 0, 1, 0.5, 1]; // 5 wins, 1 loss, 1 draw

            wins.forEach(score => {
                [engine1Rating, engine2Rating] = calculateEloChange(engine1Rating, engine2Rating, score);
            });

            expect(engine1Rating).toBeGreaterThan(1500); // Should gain rating
            expect(engine2Rating).toBeLessThan(1500); // Should lose rating
        });

        it('should handle rating convergence', () => {
            let strongEngine = 1800;
            let weakEngine = 1200;

            const calculateEloChange = (
                ratingA: number,
                ratingB: number,
                scoreA: number,
                k: number = 32
            ): [number, number] => {
                const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
                const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

                const scoreB = 1 - scoreA;

                const newRatingA = Math.round(ratingA + k * (scoreA - expectedA));
                const newRatingB = Math.round(ratingB + k * (scoreB - expectedB));

                return [newRatingA, newRatingB];
            };

            const initialDifference = strongEngine - weakEngine; // 600

            // Simulate many games where strong engine wins 90% of the time
            for (let i = 0; i < 100; i++) {
                const score = Math.random() < 0.9 ? 1 : 0; // Strong engine wins 90%
                [strongEngine, weakEngine] = calculateEloChange(strongEngine, weakEngine, score);
            }

            const finalDifference = strongEngine - weakEngine;

            // Rating difference should stabilize (not grow indefinitely)
            // With 90% win rate, the difference may decrease as ratings converge to true skill
            expect(finalDifference).toBeGreaterThan(200); // Should maintain significant difference
            expect(finalDifference).toBeLessThan(initialDifference * 2); // Shouldn't double
        });
    });

    describe('Edge Cases', () => {
        it('should handle identical ratings', () => {
            const calculateEloChange = (
                ratingA: number,
                ratingB: number,
                scoreA: number,
                k: number = 32
            ): [number, number] => {
                const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
                const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

                const scoreB = 1 - scoreA;

                const newRatingA = Math.round(ratingA + k * (scoreA - expectedA));
                const newRatingB = Math.round(ratingB + k * (scoreB - expectedB));

                return [newRatingA, newRatingB];
            };

            const [win1, win2] = calculateEloChange(1500, 1500, 1);
            const [draw1, draw2] = calculateEloChange(1500, 1500, 0.5);
            const [loss1, loss2] = calculateEloChange(1500, 1500, 0);

            expect(win1).toBe(1516);
            expect(win2).toBe(1484);
            expect(draw1).toBe(1500);
            expect(draw2).toBe(1500);
            expect(loss1).toBe(1484);
            expect(loss2).toBe(1516);
        });

        it('should handle minimum and maximum practical ratings', () => {
            const calculateEloChange = (
                ratingA: number,
                ratingB: number,
                scoreA: number,
                k: number = 32
            ): [number, number] => {
                const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
                const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

                const scoreB = 1 - scoreA;

                const newRatingA = Math.round(ratingA + k * (scoreA - expectedA));
                const newRatingB = Math.round(ratingB + k * (scoreB - expectedB));

                return [newRatingA, newRatingB];
            };

            // Very low vs very high
            const [veryLow, veryHigh] = calculateEloChange(0, 3000, 1);
            expect(veryLow).toBeGreaterThan(0);
            expect(veryHigh).toBeLessThan(3000);

            // Check no overflow/underflow
            expect(Number.isFinite(veryLow)).toBe(true);
            expect(Number.isFinite(veryHigh)).toBe(true);
        });

        it('should handle decimal scores correctly', () => {
            const calculateEloChange = (
                ratingA: number,
                ratingB: number,
                scoreA: number,
                k: number = 32
            ): [number, number] => {
                const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
                const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

                const scoreB = 1 - scoreA;

                const newRatingA = Math.round(ratingA + k * (scoreA - expectedA));
                const newRatingB = Math.round(ratingB + k * (scoreB - expectedB));

                return [newRatingA, newRatingB];
            };

            const scores = [0, 0.25, 0.5, 0.75, 1];

            scores.forEach(score => {
                const [newR1, newR2] = calculateEloChange(1500, 1500, score);
                expect(Number.isInteger(newR1)).toBe(true);
                expect(Number.isInteger(newR2)).toBe(true);
                expect(newR1 + newR2).toBeCloseTo(3000, 0);
            });
        });
    });
});
