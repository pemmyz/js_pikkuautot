// Wait until the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {

    // --- Constants ---
    const SCREEN_WIDTH = 1920;
    const SCREEN_HEIGHT = 1010;
    const CAR_SPEED = 15;
    const OTHER_CAR_SPEED = 3;
    const MAX_CARS = 60; // Target maximum number of cars on screen. User mentioned 35, adjust if that's a strict requirement.
    const IMAGE_SCALE = 1 / 3;
    const PLAYER_CAR_ROTATION_DEGREES = -90;
    const OTHER_CAR_ROTATION_DEGREES = -90;

    // --- Image Loading Constants ---
    const IMAGE_FOLDER = 'auto';
    const IMAGE_EXTENSION = '.png';
    const MAX_IMAGES_TO_CHECK = 200; // <<< ADJUST THIS if you have more than 200 images
    const FILENAME_PADDING = 3;      // For '001', '002', etc.

    // --- Canvas Setup ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    if (!canvas || !ctx) {
        console.error("Failed to get canvas element or context!");
        return;
    }

    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;

    // --- Asset Loading ---
    const loadedImages = {}; // Store loaded Image objects keyed by path

    // --- Helper Functions ---
    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // Function to load a single image and return a Promise
    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => {
                // Don't log an error here during probing, it's expected
                // console.warn(`Failed to load image: ${src}`);
                reject(new Error(`Failed to load ${src}`)); // Reject the promise
            };
            img.src = src;
        });
    }

     // Function to create a transformed (scaled, rotated) image on an offscreen canvas
    function createTransformedImage(originalImage, scale, rotationDegrees) {
        if (!originalImage || !originalImage.width || !originalImage.height) {
             console.error("Invalid image provided to createTransformedImage", originalImage);
             // Return a placeholder or throw an error
             // Create a minimal canvas to avoid errors down the line
             const placeholderCanvas = document.createElement('canvas');
             placeholderCanvas.width = 10;
             placeholderCanvas.height = 10;
             return { canvas: placeholderCanvas, width: 10, height: 10 };
        }
        const radians = rotationDegrees * Math.PI / 180;
        const newWidth = originalImage.width * scale;
        const newHeight = originalImage.height * scale;

        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');

        // Calculate bounding box dimensions after rotation
        const absCos = Math.abs(Math.cos(radians));
        const absSin = Math.abs(Math.sin(radians));
        offscreenCanvas.width = newWidth * absCos + newHeight * absSin;
        offscreenCanvas.height = newWidth * absSin + newHeight * absCos;

        // Translate to center, rotate, scale, draw centered image
        offscreenCtx.translate(offscreenCanvas.width / 2, offscreenCanvas.height / 2);
        offscreenCtx.rotate(radians);
        offscreenCtx.scale(scale, scale);
        offscreenCtx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2);

        return {
            canvas: offscreenCanvas,
            width: offscreenCanvas.width,
            height: offscreenCanvas.height
        };
    }


    // AABB Collision Detection
    function checkCollision(rect1, rect2) {
         // Check if either rect is invalid
         if (!rect1 || typeof rect1.x !== 'number' || typeof rect1.y !== 'number' || typeof rect1.width !== 'number' || typeof rect1.height !== 'number' ||
             !rect2 || typeof rect2.x !== 'number' || typeof rect2.y !== 'number' || typeof rect2.width !== 'number' || typeof rect2.height !== 'number') {
            // console.warn("Invalid rectangle data for collision check:", rect1, rect2);
             return false;
         }
        return (
            rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y
        );
    }

    // --- Input Handling ---
    const keysPressed = {};
    window.addEventListener('keydown', (e) => {
        keysPressed[e.key.toLowerCase()] = true; // Use lower case for consistency
        // Prevent default browser action for game keys (scrolling, spacebar page down)
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'f', 'r'].includes(e.key.toLowerCase())) {
            e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => {
        keysPressed[e.key.toLowerCase()] = false;
    });

    // --- Classes ---

    class Car {
        constructor(transformedImageCanvas, screenWidth, screenHeight) {
            if (!transformedImageCanvas || !transformedImageCanvas.canvas) {
                console.error("Car constructor received invalid transformedImageCanvas:", transformedImageCanvas);
                // Assign a placeholder to prevent immediate errors
                const placeholderCanvas = document.createElement('canvas');
                placeholderCanvas.width = 30; placeholderCanvas.height = 15;
                this.transformedImage = { canvas: placeholderCanvas, width: 30, height: 15 };
            } else {
                this.transformedImage = transformedImageCanvas; // This is the { canvas, width, height } object
            }
            this.width = this.transformedImage.width;
            this.height = this.transformedImage.height;
            this.x = 0;
            this.y = 0;
            this.screenWidth = screenWidth;
            this.screenHeight = screenHeight;
        }
        getRect() {
            // Add a check here too, just in case
            if (typeof this.x !== 'number' || typeof this.y !== 'number' || typeof this.width !== 'number' || typeof this.height !== 'number') {
                console.warn("Car getRect called with invalid properties:", this);
                return { x: 0, y: 0, width: 1, height: 1 }; // Return minimal valid rect
            }
            return { x: this.x, y: this.y, width: this.width, height: this.height };
        }
        move(dx, dy) {
            this.x += dx;
            this.y += dy;
        }
        clampToScreen() {
            if (this.x < 0) this.x = 0;
            if (this.x + this.width > this.screenWidth) this.x = this.screenWidth - this.width;
            if (this.y < 0) this.y = 0;
            if (this.y + this.height > this.screenHeight) this.y = this.screenHeight - this.height;
        }
        draw(ctx) {
            // Check if image data is valid before drawing
            if (this.transformedImage && this.transformedImage.canvas && this.transformedImage.canvas.width > 0) {
                ctx.drawImage(this.transformedImage.canvas, this.x, this.y);
            } else {
                 console.warn("Attempted to draw car with invalid transformedImage", this);
                 // Optionally draw a placeholder rectangle if image is missing
                 ctx.fillStyle = 'magenta';
                 ctx.fillRect(this.x, this.y, 30, 15);
            }
            // Optional: Draw bounding box for debugging
            // ctx.strokeStyle = 'lime'; // Use a different color for player boxes
            // ctx.strokeRect(this.x, this.y, this.width, this.height);
        }
    }

    class OtherCar extends Car {
        // Removed 'index' parameter
        constructor(transformedImageCanvas, screenWidth, screenHeight, playerCar1, playerCar2) {
             super(transformedImageCanvas, screenWidth, screenHeight);
             // Start slightly off-screen right with random horizontal variation
             this.x = screenWidth + getRandomInt(50, 400);
             this.y = getRandomInt(0, screenHeight - this.height); // Random vertical position
             this.playerCar1 = playerCar1;
             this.playerCar2 = playerCar2;
             this.counted = false; // Track if it went off-screen left
             this.lastCollisionTimePlayer1 = 0;
             this.lastCollisionTimePlayer2 = 0;
             this.id = Math.random(); // Unique ID for debugging
             this.stuckTime = 0;
             this.lastPosition = {x: this.x, y: this.y};
             this.stuckCheckCounter = 0; // Check less frequently
             // Store the image data if needed for replenishment later
             // this.originalTransformedData = transformedImageCanvas;
        }

        moveLeft(speed) {
            // Store position before moving
            this.lastPosition = {x: this.x, y: this.y};
            this.x -= speed;

            // --- Car recycling logic removed here ---
            // Cars going off-screen left are now handled by the Game class removing them.

            // Check for stuck state less often
            this.stuckCheckCounter++;
            if (this.stuckCheckCounter > 10) { // Check every 10 frames approx
                 this.stuckCheckCounter = 0;
                 // Check if position hasn't changed significantly
                 if (Math.abs(this.x - this.lastPosition.x) < 1 && Math.abs(this.y - this.lastPosition.y) < 1) {
                     this.stuckTime++;
                 } else {
                     this.stuckTime = 0; // Reset if moved
                 }

                 // If stuck for multiple checks, try nudging
                 if (this.stuckTime > 3) { // If stuck for ~3 checks (~30 frames)
                     // console.log(`Nudging potentially stuck car ${this.id} at ${this.x.toFixed(0)}, ${this.y.toFixed(0)}`);
                     // Try a random nudge
                     this.y += getRandomInt(-15, 15);
                     this.x += getRandomInt(5, 15); // Push forward slightly as well
                     this.clampToScreen(); // Make sure nudge doesn't push out of bounds
                     this.stuckTime = 0; // Reset stuck timer after nudge
                     this.lastPosition = {x: this.x, y: this.y}; // Update last position after nudge
                 }
            }
        }

         draw(ctx) { // Override draw for debugging if needed
             super.draw(ctx);
             // Optional: Draw bounding box for debugging
             // ctx.strokeStyle = 'red'; // Enemy boxes
             // ctx.strokeRect(this.x, this.y, this.width, this.height);
         }
    }

    class Bullet {
        constructor(x, y, speed) {
            this.x = x;
            this.y = y;
            this.speed = speed;
            this.width = 10;
            this.height = 5;
            this.color = 'red';
            this.id = Math.random(); // Unique ID for debugging
        }
        getRect() {
            return { x: this.x, y: this.y, width: this.width, height: this.height };
        }
        update() {
            this.x += this.speed;
        }
        draw(ctx) {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

     class RoadMarking {
        constructor(initialX, positionY, screenWidth) {
            this.screenWidth = screenWidth; // Need screenWidth here too
            this.width = 80;
            this.height = 10;
            this.color = 'white';
            this.x = initialX; // Use provided initial X
            this.y = positionY;
        }
        moveLeft(speed) {
            this.x -= speed;
            // Wrap around far to the right when off-screen left
            if (this.x + this.width < 0) {
                this.x += this.screenWidth * 1.5 + Math.random() * 200; // Ensures it's well off screen right
            }
        }
        draw(ctx) {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

    class Game {
        constructor(screenWidth, screenHeight, carSpeed, otherCarSpeed, player1ImgData, player2ImgData, enemyImagesData) {
            this.screenWidth = screenWidth;
            this.screenHeight = screenHeight;
            this.carSpeed = carSpeed;
            this.otherCarSpeed = otherCarSpeed;

            this.playerCar1 = new Car(player1ImgData, screenWidth, screenHeight);
            this.playerCar2 = new Car(player2ImgData, screenWidth, screenHeight);

            // Initial player positions
            this.playerCar1.x = 100;
            this.playerCar1.y = screenHeight / 2 - player1ImgData.height - 20; // Slightly above center
            this.playerCar2.x = 100;
            this.playerCar2.y = screenHeight / 2 + 20; // Slightly below center

            // Enemy car management
            this.enemyImagesData = enemyImagesData; // Array of { canvas, width, height } for all loaded enemies
            this.availableEnemyImageData = [...this.enemyImagesData]; // Copy for spawning pool
            this.otherCars = []; // Start with no enemy cars

            // Bullet management
            this.bulletsCar1 = [];
            this.bulletsCar2 = [];
            this.maxBullets = 45;
            this.lastShotTimeCar1 = 0;
            this.lastShotTimeCar2 = 0;
            this.shotCooldown = 150; // ms

            // Score and stats
            this.carsRemovedByCar1 = 0;
            this.carsRemovedByCar2 = 0;
            this.carsOutOfScreen = 0;
            this.player1CollisionCount = 0;
            this.player2CollisionCount = 0;
            this.collisionCooldown = 150; // ms (per car)

            // Timing and performance
            this.startTime = performance.now();
            this.frameCount = 0;
            this.fps = 0;
            this.lastFpsUpdate = performance.now();

            // Spawning control
            this.lastOtherCarLoadTime = 0;
            this.otherCarLoadInterval = 200; // ms - Check frequently to maintain density

            // Road markings
            this.roadMarkings = [];
            this.setupRoadMarkings();
        }

        setupRoadMarkings() {
             const numLanes = 5;
             const laneHeight = this.screenHeight / numLanes;
             const markingSpacing = 250; // Horizontal distance between markings
             const markingsPerScreenRoughly = Math.ceil(this.screenWidth / markingSpacing) + 4; // Extra to ensure smooth wrapping

             for (let i = 0; i < numLanes; i++) {
                 const laneY = (i * laneHeight) + (laneHeight / 2) - 5; // Center vertically in lane
                 for (let j = 0; j < markingsPerScreenRoughly; j++) {
                     // Distribute initial markings across the screen and off-screen right
                     const initialX = (j * markingSpacing) - (markingSpacing * 2); // Start some on/off screen left/right
                     this.roadMarkings.push(new RoadMarking(initialX, laneY, this.screenWidth));
                 }
             }
        }

        updateFpsCounter(now) {
            this.frameCount++;
            const elapsed = now - this.lastFpsUpdate;
            if (elapsed >= 1000) {
                this.fps = (this.frameCount * 1000) / elapsed;
                this.frameCount = 0;
                this.lastFpsUpdate = now;
            }
        }

         // Continuously try to spawn cars to reach MAX_CARS
         loadNewCars() {
             const now = performance.now();
             // Throttle how often we attempt to spawn
             if (now - this.lastOtherCarLoadTime < this.otherCarLoadInterval) {
                 return;
             }
             this.lastOtherCarLoadTime = now;

             const currentCarCount = this.otherCars.length;
             // Check if we need more cars
             if (currentCarCount >= MAX_CARS) {
                 return; // Already at or above the limit
             }

             // Replenish available images if the pool is empty
             if (this.availableEnemyImageData.length === 0) {
                 if (this.enemyImagesData.length > 0) {
                     this.availableEnemyImageData = [...this.enemyImagesData];
                     // console.log("Replenished available enemy images.");
                 } else {
                     // console.warn("Cannot load new cars, no enemy image data available.");
                     return; // Cannot add cars if no base images exist
                 }
             }
              // If still no images after trying to replenish, exit
             if (this.availableEnemyImageData.length === 0) {
                 return;
             }

             // Determine how many cars to try adding in this batch
             const availableSlots = MAX_CARS - currentCarCount;
             // Add a small number each time (e.g., 1 or 2) to create a stream effect
             const numToAdd = Math.min(availableSlots, 2, this.availableEnemyImageData.length);

             for (let i = 0; i < numToAdd; i++) {
                 // Double check we still have images available inside the loop
                 if (this.availableEnemyImageData.length === 0) {
                    if (this.enemyImagesData.length > 0) {
                         this.availableEnemyImageData = [...this.enemyImagesData]; // Replenish again
                    } else {
                         break; // Exit loop if truly out of images
                    }
                 }
                 if (this.availableEnemyImageData.length === 0) break; // Safety break

                 // Pick random image data from available pool
                 const randomIndex = Math.floor(Math.random() * this.availableEnemyImageData.length);
                 const selectedImageData = this.availableEnemyImageData.splice(randomIndex, 1)[0]; // Remove and get item

                 if (selectedImageData) {
                     // Create the new car (position is set in constructor)
                     // Note: Removed 'index' argument here
                     const newCar = new OtherCar(
                         selectedImageData,
                         this.screenWidth,
                         this.screenHeight,
                         this.playerCar1,
                         this.playerCar2
                     );

                     // --- Basic spawn collision check ---
                     let spawnCollision = false;
                     const newCarRect = newCar.getRect();
                     const spawnBuffer = 10; // Pixels of space around existing objects

                     // Check against players
                     if (checkCollision(newCarRect, this.playerCar1.getRect()) ||
                         checkCollision(newCarRect, this.playerCar2.getRect())) {
                          spawnCollision = true;
                     } else {
                         // Check against other cars, especially near the spawn area
                         for (const other of this.otherCars) {
                             // Only need to check cars that might overlap the spawn area (right side)
                             // Optimization: Could check only if other.x > screenWidth - some_distance
                             const otherRect = other.getRect();
                             const bufferedOtherRect = {
                                x: otherRect.x - spawnBuffer,
                                y: otherRect.y - spawnBuffer,
                                width: otherRect.width + spawnBuffer * 2,
                                height: otherRect.height + spawnBuffer * 2
                             };
                             if (checkCollision(newCarRect, bufferedOtherRect)) {
                                 spawnCollision = true;
                                 break; // Collision found
                             }
                         }
                     }
                     // --- End spawn collision check ---

                     if (!spawnCollision) {
                         this.otherCars.push(newCar);
                         // console.log(`Spawned car. Total: ${this.otherCars.length}`);
                     } else {
                         // If spawn failed (overlap), put the image data back into the pool
                         this.availableEnemyImageData.push(selectedImageData);
                         // console.log("Skipped spawn due to overlap");
                     }
                 }
             }
         }

        handlePlayerInput() {
            let moveX1 = 0, moveY1 = 0;
            if (keysPressed['arrowleft']) moveX1 -= this.carSpeed;
            if (keysPressed['arrowright']) moveX1 += this.carSpeed;
            if (keysPressed['arrowup']) moveY1 -= this.carSpeed;
            if (keysPressed['arrowdown']) moveY1 += this.carSpeed;

            const now = performance.now();
            // Player 1 Shoot
            if (keysPressed[' '] && this.bulletsCar1.length < this.maxBullets) {
                if (now - this.lastShotTimeCar1 > this.shotCooldown) {
                    const bullet = new Bullet(
                        this.playerCar1.x + this.playerCar1.width, // Start bullet at front of car
                        this.playerCar1.y + this.playerCar1.height / 2 - 2.5, // Center vertically
                        20 // Bullet speed
                    );
                    this.bulletsCar1.push(bullet);
                    this.lastShotTimeCar1 = now;
                }
            }

            // Player 1 Reset Position (Example key 'R')
            if (keysPressed['r']) {
                 this.playerCar1.x = 100;
                 this.playerCar1.y = this.screenHeight / 2 - this.playerCar1.height - 20;
                 this.playerCar2.x = 100;
                 this.playerCar2.y = this.screenHeight / 2 + 20;
                 this.bulletsCar1 = []; // Optional: reset bullets on reset
                 this.bulletsCar2 = []; // Optional: reset bullets on reset
                 // Reset scores/collisions if desired for a full reset
                 // this.carsRemovedByCar1 = 0; etc.
            }

            this.playerCar1.move(moveX1, moveY1);
            this.playerCar1.clampToScreen();

            // Player 2 Movement (WASD)
            let moveX2 = 0, moveY2 = 0;
            if (keysPressed['a']) moveX2 -= this.carSpeed;
            if (keysPressed['d']) moveX2 += this.carSpeed;
            if (keysPressed['w']) moveY2 -= this.carSpeed;
            if (keysPressed['s']) moveY2 += this.carSpeed;

            // Player 2 Shoot (F)
            if (keysPressed['f'] && this.bulletsCar2.length < this.maxBullets) {
                 if (now - this.lastShotTimeCar2 > this.shotCooldown) {
                    const bullet = new Bullet(
                        this.playerCar2.x + this.playerCar2.width,
                        this.playerCar2.y + this.playerCar2.height / 2 - 2.5,
                        20 // Bullet speed
                    );
                    this.bulletsCar2.push(bullet);
                    this.lastShotTimeCar2 = now;
                }
            }

            this.playerCar2.move(moveX2, moveY2);
            this.playerCar2.clampToScreen();
        }

        // Move other cars and remove those that go off-screen left
        moveOtherCars() {
             let newlyOffScreenCount = 0;
             const carIndicesToRemove = new Set(); // Store indices of cars to remove

             this.otherCars.forEach((car, index) => {
                 car.moveLeft(this.otherCarSpeed); // Move the car

                 // Check if car has moved completely off the left edge
                 if (car.x + car.width < 0) {
                     if (!car.counted) { // Count only once
                         car.counted = true;
                         newlyOffScreenCount++;
                     }
                     carIndicesToRemove.add(index); // Mark for removal
                 }
             });

             // Update the global off-screen counter
             if (newlyOffScreenCount > 0) {
                 this.carsOutOfScreen += newlyOffScreenCount;
             }

             // Remove the cars that went off-screen using filtering
             if (carIndicesToRemove.size > 0) {
                 // Optional: Put removed car images back into the available pool
                 // This requires storing the original image data on the car or having a mapping
                 /*
                 carIndicesToRemove.forEach(index => {
                    if (index < this.otherCars.length) { // Check index is valid
                        const removedCar = this.otherCars[index];
                        if (removedCar && removedCar.originalTransformedData) {
                            this.availableEnemyImageData.push(removedCar.originalTransformedData);
                        }
                    }
                 });
                 */

                 this.otherCars = this.otherCars.filter((_, index) => !carIndicesToRemove.has(index));
                 // console.log(`Removed ${carIndicesToRemove.size} cars (off-screen). New count: ${this.otherCars.length}`);
             }
        }

         // Simple separation logic for overlapping cars
         separateCars(car1, car2) {
            const rect1 = car1.getRect();
            const rect2 = car2.getRect();
             if (!rect1 || !rect2) return; // Safety check

             const dx = (rect1.x + rect1.width / 2) - (rect2.x + rect2.width / 2);
             const dy = (rect1.y + rect1.height / 2) - (rect2.y + rect2.height / 2);
             const combinedHalfWidths = rect1.width / 2 + rect2.width / 2;
             const combinedHalfHeights = rect1.height / 2 + rect2.height / 2;

             // Check for overlap
             if (Math.abs(dx) < combinedHalfWidths && Math.abs(dy) < combinedHalfHeights) {
                 const overlapX = combinedHalfWidths - Math.abs(dx);
                 const overlapY = combinedHalfHeights - Math.abs(dy);

                 // Separate along the axis of least penetration
                 const separationFactor = 0.6; // Adjust for stronger/weaker push
                 let moveX = 0;
                 let moveY = 0;

                 if (overlapX < overlapY) {
                     // Separate horizontally
                     moveX = (overlapX / 2) * separationFactor * Math.sign(dx);
                     // Add a small vertical nudge if stuck side-by-side
                     if (Math.abs(dx) < 5) moveY = (Math.random() - 0.5) * 4;
                 } else {
                     // Separate vertically
                     moveY = (overlapY / 2) * separationFactor * Math.sign(dy);
                      // Add a small horizontal nudge if stuck top-bottom
                     if (Math.abs(dy) < 5) moveX = (Math.random() - 0.5) * 4;
                 }

                 // Apply separation
                 car1.x += moveX;
                 car1.y += moveY;
                 car2.x -= moveX;
                 car2.y -= moveY;

                 // Re-clamp cars to screen bounds after separation
                 if (typeof car1.clampToScreen === 'function') car1.clampToScreen();
                 if (typeof car2.clampToScreen === 'function') car2.clampToScreen();
             }
         }


        checkCollisions() {
            const now = performance.now();

            // Player vs Other Cars
            this.otherCars.forEach(otherCar => {
                // Player 1 collision
                if (checkCollision(this.playerCar1.getRect(), otherCar.getRect())) {
                     if (now - otherCar.lastCollisionTimePlayer1 > this.collisionCooldown) {
                         this.player1CollisionCount++;
                         otherCar.lastCollisionTimePlayer1 = now; // Apply cooldown per other car
                     }
                    this.separateCars(this.playerCar1, otherCar); // Push them apart
                }
                // Player 2 collision
                if (checkCollision(this.playerCar2.getRect(), otherCar.getRect())) {
                     if (now - otherCar.lastCollisionTimePlayer2 > this.collisionCooldown) {
                         this.player2CollisionCount++;
                         otherCar.lastCollisionTimePlayer2 = now; // Apply cooldown per other car
                     }
                    this.separateCars(this.playerCar2, otherCar); // Push them apart
                }
            });

            // Player vs Player collision
            if (checkCollision(this.playerCar1.getRect(), this.playerCar2.getRect())) {
                this.separateCars(this.playerCar1, this.playerCar2);
            }

            // Other Car vs Other Car (Optimized slightly - check each pair once)
            for (let i = 0; i < this.otherCars.length; i++) {
                for (let j = i + 1; j < this.otherCars.length; j++) {
                    const carI = this.otherCars[i];
                    const carJ = this.otherCars[j];

                    // Broad phase check (optional - check if Y positions are close enough)
                    const dy = Math.abs((carI.y + carI.height / 2) - (carJ.y + carJ.height / 2));
                    if (dy < (carI.height + carJ.height)) { // Only check collision if vertically close
                         // Narrow phase check (AABB)
                        if (checkCollision(carI.getRect(), carJ.getRect())) {
                            this.separateCars(carI, carJ);
                        }
                    }
                }
            }
        }

        checkBulletCollisions() {
            const bulletsToRemoveCar1 = new Set();
            const bulletsToRemoveCar2 = new Set();
            const carIndicesToRemove = new Set(); // Store indices of cars hit THIS FRAME

            // --- Bullets from Car 1 ---
            this.bulletsCar1.forEach((bullet, bulletIndex) => {
                bullet.update(); // Move bullet
                // Remove bullet if it goes off-screen right
                if (bullet.x > this.screenWidth) {
                    bulletsToRemoveCar1.add(bulletIndex);
                } else {
                    // Check collision against other cars
                    this.otherCars.forEach((car, carIndex) => {
                        // Only check if car is not already marked for removal in this frame
                        if (!carIndicesToRemove.has(carIndex) && checkCollision(bullet.getRect(), car.getRect())) {
                            bulletsToRemoveCar1.add(bulletIndex); // Mark bullet for removal
                            carIndicesToRemove.add(carIndex);    // Mark car for removal
                            this.carsRemovedByCar1++;
                            // console.log(`HIT P1: Bullet ${bullet.id} -> Car ${car.id}`);
                            return; // A bullet hits only one car per frame check
                        }
                    });
                }
            });

             // --- Bullets from Car 2 ---
            this.bulletsCar2.forEach((bullet, bulletIndex) => {
                bullet.update(); // Move bullet
                if (bullet.x > this.screenWidth) {
                    bulletsToRemoveCar2.add(bulletIndex);
                } else {
                    this.otherCars.forEach((car, carIndex) => {
                        if (!carIndicesToRemove.has(carIndex) && checkCollision(bullet.getRect(), car.getRect())) {
                            bulletsToRemoveCar2.add(bulletIndex);
                            carIndicesToRemove.add(carIndex);
                            this.carsRemovedByCar2++;
                            // console.log(`HIT P2: Bullet ${bullet.id} -> Car ${car.id}`);
                            return; // Bullet hits one car
                        }
                    });
                }
            });

            // --- Remove hit items ---
            // Filter out bullets that hit or went off-screen
            this.bulletsCar1 = this.bulletsCar1.filter((_, index) => !bulletsToRemoveCar1.has(index));
            this.bulletsCar2 = this.bulletsCar2.filter((_, index) => !bulletsToRemoveCar2.has(index));

            // Filter out cars that were hit
            if (carIndicesToRemove.size > 0) {
                // Optional: Put removed car images back into the available pool
                 /*
                 carIndicesToRemove.forEach(index => {
                    if (index < this.otherCars.length) { // Safety check index
                        const removedCar = this.otherCars[index];
                        if (removedCar && removedCar.originalTransformedData) {
                           this.availableEnemyImageData.push(removedCar.originalTransformedData);
                        }
                    }
                 });
                 */

                this.otherCars = this.otherCars.filter((_, index) => !carIndicesToRemove.has(index));
                // console.log(`Removed ${carIndicesToRemove.size} cars (hit). New count: ${this.otherCars.length}`);
            }
        }


        // Draw text with a background for better readability
        drawText(text, x, y, color = 'white', bgColor = 'rgba(0, 0, 0, 0.6)') {
            ctx.font = '20px Arial';
            const textMetrics = ctx.measureText(text);
            const textWidth = textMetrics.width;
            // Estimate height (more reliable across browsers than specific ascent/descent)
            const textHeight = parseInt(ctx.font, 10) * 1.2; // Approx height based on font size

            // Draw background rectangle
            ctx.fillStyle = bgColor;
            // Adjust y-position for background based on text baseline
            ctx.fillRect(x - 5, y - textHeight + 5 , textWidth + 10, textHeight + 4); // Padding

            // Draw text
            ctx.fillStyle = color;
            ctx.fillText(text, x, y);
        }

        draw() {
            // Clear canvas (or draw background)
            ctx.fillStyle = '#3333AA'; // Dark blue road color
            ctx.fillRect(0, 0, this.screenWidth, this.screenHeight);

            // Draw road markings
            this.roadMarkings.forEach(marking => marking.draw(ctx));

            // Draw cars
            this.playerCar1.draw(ctx);
            this.playerCar2.draw(ctx);
            this.otherCars.forEach(car => car.draw(ctx));

            // Draw bullets
            this.bulletsCar1.forEach(bullet => bullet.draw(ctx));
            this.bulletsCar2.forEach(bullet => bullet.draw(ctx));

            // Draw UI / Stats
            const now = performance.now();
            const timePlayedSeconds = Math.floor((now - this.startTime) / 1000);
            const hours = Math.floor(timePlayedSeconds / 3600);
            const minutes = Math.floor((timePlayedSeconds % 3600) / 60);
            const seconds = timePlayedSeconds % 60;
            this.updateFpsCounter(now); // Update FPS calculation

            let yPos = 30; // Starting Y position for text
            const lineH = 28; // Line height for text stats
            this.drawText(`Time: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`, 10, yPos); yPos += lineH;
            this.drawText(`P1 Hits: ${this.carsRemovedByCar1}`, 10, yPos); yPos += lineH;
            this.drawText(`P2 Hits: ${this.carsRemovedByCar2}`, 10, yPos); yPos += lineH;
            this.drawText(`Cars Offscreen: ${this.carsOutOfScreen}`, 10, yPos); yPos += lineH;
            this.drawText(`Cars On Screen: ${this.otherCars.length} / ${MAX_CARS}`, 10, yPos); yPos += lineH;
            this.drawText(`P1 Collisions: ${this.player1CollisionCount}`, 10, yPos); yPos += lineH;
            this.drawText(`P2 Collisions: ${this.player2CollisionCount}`, 10, yPos); yPos += lineH;
            this.drawText(`FPS: ${this.fps.toFixed(1)}`, 10, yPos); yPos += lineH;
            this.drawText(`P1 Bullets: ${this.bulletsCar1.length}`, 10, yPos); yPos += lineH;
            this.drawText(`P2 Bullets: ${this.bulletsCar2.length}`, 10, yPos); yPos += lineH;
        }

        // Main game loop update function
        update() {
            this.handlePlayerInput();    // Read player controls
            this.moveOtherCars();        // Move enemies, remove off-screen ones
            this.roadMarkings.forEach(m => m.moveLeft(this.otherCarSpeed * 1.2)); // Move markings slightly faster for parallax
            this.checkCollisions();      // Check and resolve player/enemy/enemy collisions
            this.checkBulletCollisions();// Check bullet hits, remove bullets/cars
            this.loadNewCars();          // Spawn new cars if needed
        }

        // The recursive game loop function
        gameLoop(timestamp) {
            this.update(); // Update game state
            this.draw();   // Render the game
            requestAnimationFrame(this.gameLoop.bind(this)); // Request next frame
        }

        // Start the game
        start() {
             console.log("Starting game loop...");
             if (!this.playerCar1 || !this.playerCar2 || !this.enemyImagesData) {
                 console.error("Cannot start game, essential assets missing.");
                 alert("Error: Game assets not loaded correctly. Check console (F12).");
                 return;
             }
            this.startTime = performance.now();
            this.lastFpsUpdate = this.startTime;
            requestAnimationFrame(this.gameLoop.bind(this)); // Kick off the loop
        }
    }


    // --- Game Initialization and Start ---

    console.log("DOM loaded. Starting image loading process...");

    // 1. Generate potential image paths
    const potentialImagePaths = [];
    for (let i = 1; i <= MAX_IMAGES_TO_CHECK; i++) {
        const filename = i.toString().padStart(FILENAME_PADDING, '0') + IMAGE_EXTENSION;
        potentialImagePaths.push(`${IMAGE_FOLDER}/${filename}`);
    }
    console.log(`Probing for up to ${MAX_IMAGES_TO_CHECK} images in '${IMAGE_FOLDER}/'...`);

    // 2. Attempt to load all potential images using Promise.allSettled
    Promise.allSettled(potentialImagePaths.map(loadImage))
        .then(results => {
            console.log("Image loading probe finished.");
            const successfullyLoaded = [];
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    // Store path and the loaded Image object
                    successfullyLoaded.push({ path: potentialImagePaths[index], image: result.value });
                }
                // Optional: Log failures if needed for debugging image names/paths
                // else { console.warn(`Did not find or load: ${potentialImagePaths[index]}`); }
            });

            if (successfullyLoaded.length < 2) {
                console.error(`Error: Loaded only ${successfullyLoaded.length} images, need at least 2 for player cars.`);
                alert(`Error: Loaded only ${successfullyLoaded.length} images from the '${IMAGE_FOLDER}' folder. Need at least 2. Check folder contents, naming (e.g., 001.png), and MAX_IMAGES_TO_CHECK in script.js.`);
                return; // Stop initialization
            }
            console.log(`Successfully loaded ${successfullyLoaded.length} images.`);

            // 3. Prepare image data for the game
            // Store all loaded images in the global map
            successfullyLoaded.forEach(item => {
                 loadedImages[item.path] = item.image;
            });
            let availableImagePaths = successfullyLoaded.map(item => item.path);

            // Select player images randomly and remove from available list
            shuffleArray(availableImagePaths);
            if (availableImagePaths.length < 2) {
                 // This case should be caught earlier, but double-check
                 throw new Error("Insufficient unique images loaded for two players.");
            }
            const player1Path = availableImagePaths.pop();
            const player2Path = availableImagePaths.pop();
            // The rest are potential enemy paths
            const enemyImagePaths = availableImagePaths;

            console.log(`Player 1 uses: ${player1Path}`);
            console.log(`Player 2 uses: ${player2Path}`);
            console.log(`${enemyImagePaths.length} images available for enemies.`);

            // 4. Create transformed image data (offscreen canvases)
            const player1Original = loadedImages[player1Path];
            const player2Original = loadedImages[player2Path];

            if (!player1Original || !player2Original) {
                 console.error("Could not find loaded image data for selected player paths:", player1Path, player2Path);
                 throw new Error("Internal error: Failed to retrieve loaded image data for players.");
            }

            // Create transformed (rotated, scaled) versions on offscreen canvases
            const player1TransformedData = createTransformedImage(player1Original, IMAGE_SCALE, PLAYER_CAR_ROTATION_DEGREES);
            const player2TransformedData = createTransformedImage(player2Original, IMAGE_SCALE, PLAYER_CAR_ROTATION_DEGREES);

            const enemyTransformedData = enemyImagePaths
                .map(path => loadedImages[path]) // Get Image object
                .filter(img => img && img.width > 0 && img.height > 0) // Ensure image is valid before transforming
                .map(img => createTransformedImage(img, IMAGE_SCALE, OTHER_CAR_ROTATION_DEGREES))
                .filter(data => data && data.canvas && data.width > 0); // Ensure transformation was successful

            if (!player1TransformedData || !player2TransformedData || !player1TransformedData.canvas || !player2TransformedData.canvas) {
                 console.error("Failed to create transformed image data for player cars.", player1TransformedData, player2TransformedData);
                 throw new Error("Failed to create transformed image data for players.");
            }
            if (enemyTransformedData.length === 0 && enemyImagePaths.length > 0) {
                console.warn("Some enemy images were loaded but failed transformation or filtering.");
            }
            if (enemyTransformedData.length === 0 && successfullyLoaded.length >=2 ) {
                 console.warn("No valid enemy images available after transformation. Enemies will not spawn.");
                 // Game can still run with only players, but log this.
            }


            // 5. Create and start the game instance
            console.log("Creating Game instance...");
            const game = new Game(
                SCREEN_WIDTH, SCREEN_HEIGHT,
                CAR_SPEED, OTHER_CAR_SPEED,
                player1TransformedData,
                player2TransformedData,
                enemyTransformedData // Pass array of transformed data for enemies
            );
            game.start(); // Start the game loop

        })
        .catch(error => { // Catch errors during the Promise chain (loading, transforming)
            console.error("Error during game initialization:", error);
            alert(`An error occurred during game setup: ${error.message}. Check the console (F12) for details.`);
        });

}); // End DOMContentLoaded
