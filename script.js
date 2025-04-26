// Wait until the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {

    // --- Constants ---
    const SCREEN_WIDTH = 1920;
    const SCREEN_HEIGHT = 1010;
    const CAR_SPEED = 15;
    const OTHER_CAR_SPEED = 3;
    const MAX_CARS = 60; // Target maximum number of cars on screen. Adjust if needed.
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
        // Constructor now takes image data, screen dimensions, and player references
        constructor(transformedImageCanvas, screenWidth, screenHeight, playerCar1, playerCar2) {
             super(transformedImageCanvas, screenWidth, screenHeight);
             // Start slightly off-screen right with random horizontal variation
             this.x = screenWidth + getRandomInt(50, 400); // Positioned off right edge
             this.y = getRandomInt(0, screenHeight - this.height); // Random vertical position
             this.playerCar1 = playerCar1; // Reference for potential future interactions
             this.playerCar2 = playerCar2; // Reference for potential future interactions
             this.counted = false; // Track if it went off-screen left (for scoring/stats)
             this.lastCollisionTimePlayer1 = 0; // Cooldown timer for player 1 collision effects/scoring
             this.lastCollisionTimePlayer2 = 0; // Cooldown timer for player 2 collision effects/scoring
             this.id = Math.random(); // Unique ID for debugging purposes
             this.stuckTime = 0; // Counter for checking if the car is stuck
             this.lastPosition = {x: this.x, y: this.y}; // Previous position for stuck detection
             this.stuckCheckCounter = 0; // Frame counter to limit frequency of stuck check
             // Store the image data if needed for replenishment later when removed
             // this.originalTransformedData = transformedImageCanvas;
        }

        // Moves the car left by the given speed
        moveLeft(speed) {
            // Store position before moving for stuck detection
            this.lastPosition = {x: this.x, y: this.y};
            this.x -= speed;

            // --- Car recycling logic (resetting position) is REMOVED ---
            // Cars going off-screen left are now handled by the Game class removing them.

            // Check for stuck state periodically
            this.stuckCheckCounter++;
            if (this.stuckCheckCounter > 10) { // Check roughly every 10 frames
                 this.stuckCheckCounter = 0; // Reset counter
                 // Check if position hasn't changed significantly since last check
                 if (Math.abs(this.x - this.lastPosition.x) < 1 && Math.abs(this.y - this.lastPosition.y) < 1) {
                     this.stuckTime++; // Increment stuck counter
                 } else {
                     this.stuckTime = 0; // Reset if car moved
                 }

                 // If stuck for multiple checks, try nudging it
                 if (this.stuckTime > 3) { // If stuck for ~3 checks (~30 frames)
                     // console.log(`Nudging potentially stuck car ${this.id} at ${this.x.toFixed(0)}, ${this.y.toFixed(0)}`);
                     // Apply a random vertical nudge and slight forward push
                     this.y += getRandomInt(-15, 15);
                     this.x += getRandomInt(5, 15); // Small forward push
                     this.clampToScreen(); // Ensure nudge doesn't push car out of bounds inappropriately
                     this.stuckTime = 0; // Reset stuck timer after nudge
                     this.lastPosition = {x: this.x, y: this.y}; // Update last position after nudge
                 }
            }
        }

         // Override draw for debugging if needed (e.g., draw bounding box)
         draw(ctx) {
             super.draw(ctx); // Call the parent Car class's draw method
             // Optional: Draw bounding box for debugging enemy cars
             // ctx.strokeStyle = 'red';
             // ctx.strokeRect(this.x, this.y, this.width, this.height);
         }
    }

    class Bullet {
        constructor(x, y, speed) {
            this.x = x; // Initial horizontal position
            this.y = y; // Initial vertical position
            this.speed = speed; // Horizontal speed
            this.width = 10; // Bullet width
            this.height = 5; // Bullet height
            this.color = 'red'; // Bullet color
            this.id = Math.random(); // Unique ID for debugging
        }
        // Get the bounding box rectangle for collision detection
        getRect() {
            return { x: this.x, y: this.y, width: this.width, height: this.height };
        }
        // Update the bullet's position
        update() {
            this.x += this.speed; // Move horizontally
        }
        // Draw the bullet on the canvas
        draw(ctx) {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

     class RoadMarking {
        constructor(initialX, positionY, screenWidth) {
            this.screenWidth = screenWidth; // Reference to screen width for wrapping
            this.width = 80; // Width of the marking
            this.height = 10; // Height of the marking
            this.color = 'white'; // Color of the marking
            this.x = initialX; // Initial horizontal position
            this.y = positionY; // Vertical position (lane)
        }
        // Move the marking to the left
        moveLeft(speed) {
            this.x -= speed;
            // If marking goes off-screen left, wrap it around to the far right
            if (this.x + this.width < 0) {
                // Place it well off-screen right, adding some randomness to spacing
                this.x += this.screenWidth * 1.5 + Math.random() * 200;
            }
        }
        // Draw the marking on the canvas
        draw(ctx) {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

    // --- Game Class ---
    class Game {
        constructor(screenWidth, screenHeight, carSpeed, otherCarSpeed, player1ImgData, player2ImgData, enemyImagesData) {
            this.screenWidth = screenWidth;
            this.screenHeight = screenHeight;
            this.carSpeed = carSpeed; // Player car speed
            this.otherCarSpeed = otherCarSpeed; // Enemy car speed

            // Create player cars
            this.playerCar1 = new Car(player1ImgData, screenWidth, screenHeight);
            this.playerCar2 = new Car(player2ImgData, screenWidth, screenHeight);

            // Set initial player positions near the left, vertically separated
            this.playerCar1.x = 100;
            this.playerCar1.y = screenHeight / 2 - player1ImgData.height - 20; // P1 slightly above center
            this.playerCar2.x = 100;
            this.playerCar2.y = screenHeight / 2 + 20; // P2 slightly below center

            // Enemy car management
            this.enemyImagesData = enemyImagesData; // Master list of all loaded enemy image data {canvas, w, h}
            this.availableEnemyImageData = [...this.enemyImagesData]; // Pool of images currently available for spawning
            this.otherCars = []; // Array to hold active enemy car instances (starts empty)

            // Bullet management
            this.bulletsCar1 = []; // Bullets fired by player 1
            this.bulletsCar2 = []; // Bullets fired by player 2
            this.maxBullets = 45; // Max bullets per player on screen
            this.lastShotTimeCar1 = 0; // Timestamp of last shot for cooldown (P1)
            this.lastShotTimeCar2 = 0; // Timestamp of last shot for cooldown (P2)
            this.shotCooldown = 150; // Minimum time between shots in milliseconds

            // Score and statistics tracking
            this.carsRemovedByCar1 = 0; // Score for player 1
            this.carsRemovedByCar2 = 0; // Score for player 2
            this.carsOutOfScreen = 0; // Count of enemy cars that exited left
            this.player1CollisionCount = 0; // Count of P1 collisions with enemies
            this.player2CollisionCount = 0; // Count of P2 collisions with enemies
            this.collisionCooldown = 150; // Cooldown (ms) for registering player-enemy collision score/effect

            // Timing and performance monitoring
            this.startTime = performance.now(); // Game start time
            this.frameCount = 0; // Frame counter for FPS calculation
            this.fps = 0; // Calculated Frames Per Second
            this.lastFpsUpdate = performance.now(); // Timestamp of last FPS update

            // Spawning control
            this.lastOtherCarLoadTime = 0; // Timestamp of last enemy spawn attempt
            this.otherCarLoadInterval = 200; // Frequency (ms) to check if new enemies should be spawned

            // Road markings
            this.roadMarkings = []; // Array to hold road marking instances
            this.setupRoadMarkings(); // Initialize road markings
        }

        // Creates and positions the initial road markings
        setupRoadMarkings() {
             const numLanes = 5; // Number of lanes for markings
             const laneHeight = this.screenHeight / numLanes; // Height of each lane
             const markingSpacing = 250; // Horizontal distance between markings
             // Calculate how many markings are needed to fill screen + wrap-around buffer
             const markingsPerScreenRoughly = Math.ceil(this.screenWidth / markingSpacing) + 4;

             for (let i = 0; i < numLanes; i++) {
                 // Calculate vertical position for the center of the lane markings
                 const laneY = (i * laneHeight) + (laneHeight / 2) - 5; // Center vertically (-5 adjusts for marking height)
                 for (let j = 0; j < markingsPerScreenRoughly; j++) {
                     // Distribute initial markings across the screen and off-screen right/left for smooth start
                     const initialX = (j * markingSpacing) - (markingSpacing * 2); // Start some markings already on/off screen
                     this.roadMarkings.push(new RoadMarking(initialX, laneY, this.screenWidth));
                 }
             }
        }

        // Updates the FPS counter display value
        updateFpsCounter(now) {
            this.frameCount++;
            const elapsed = now - this.lastFpsUpdate;
            // Update FPS display roughly every second
            if (elapsed >= 1000) {
                this.fps = (this.frameCount * 1000) / elapsed; // Calculate FPS
                this.frameCount = 0; // Reset frame count
                this.lastFpsUpdate = now; // Record update time
            }
        }

         // Continuously tries to spawn new enemy cars to maintain the desired density (up to MAX_CARS)
         loadNewCars() {
             const now = performance.now();
             // Throttle how often this check runs to avoid excessive checks
             if (now - this.lastOtherCarLoadTime < this.otherCarLoadInterval) {
                 return; // Too soon since last check, skip
             }
             this.lastOtherCarLoadTime = now; // Record time of this check

             const currentCarCount = this.otherCars.length;
             // Check if the screen is already full or over capacity
             if (currentCarCount >= MAX_CARS) {
                 return; // No need to spawn more cars
             }

             // Replenish the pool of available images if it's empty
             if (this.availableEnemyImageData.length === 0) {
                 if (this.enemyImagesData.length > 0) { // Check if there are master images to copy from
                     this.availableEnemyImageData = [...this.enemyImagesData]; // Refill the pool
                     // console.log("Replenished available enemy images.");
                 } else {
                     // console.warn("Cannot load new cars, no enemy image data available.");
                     return; // Cannot spawn if master list is empty
                 }
             }
              // If still no images after trying to replenish, exit (shouldn't happen if previous check passed)
             if (this.availableEnemyImageData.length === 0) {
                 return;
             }

             // Determine how many cars to attempt adding in this batch
             const availableSlots = MAX_CARS - currentCarCount; // How many more cars can fit
             // Add a small number (e.g., 1 or 2) each time to create a streaming effect
             const numToAdd = Math.min(availableSlots, 2, this.availableEnemyImageData.length);

             // Loop to add the determined number of cars
             for (let i = 0; i < numToAdd; i++) {
                 // Safety check: Ensure image pool isn't empty mid-loop
                 if (this.availableEnemyImageData.length === 0) {
                    if (this.enemyImagesData.length > 0) {
                         this.availableEnemyImageData = [...this.enemyImagesData]; // Try replenishing again
                    } else {
                         break; // Exit loop if truly out of images
                    }
                 }
                 if (this.availableEnemyImageData.length === 0) break; // Still no images, exit

                 // Pick a random image data object from the available pool
                 const randomIndex = Math.floor(Math.random() * this.availableEnemyImageData.length);
                 const selectedImageData = this.availableEnemyImageData.splice(randomIndex, 1)[0]; // Remove and get the item

                 if (selectedImageData) { // Ensure image data was successfully retrieved
                     // Create the new enemy car instance (position is set in the OtherCar constructor)
                     const newCar = new OtherCar(
                         selectedImageData,
                         this.screenWidth,
                         this.screenHeight,
                         this.playerCar1,
                         this.playerCar2
                     );

                     // --- Basic spawn collision check to prevent immediate overlaps ---
                     let spawnCollision = false;
                     const newCarRect = newCar.getRect(); // Get the bounding box of the new car
                     const spawnBuffer = 10; // Add a small buffer zone around existing objects

                     // Check against player cars
                     if (checkCollision(newCarRect, this.playerCar1.getRect()) ||
                         checkCollision(newCarRect, this.playerCar2.getRect())) {
                          spawnCollision = true; // Overlaps with a player
                     } else {
                         // Check against other existing enemy cars, especially near the spawn area (right edge)
                         for (const other of this.otherCars) {
                             // Optimization idea: Only check cars if other.x > screenWidth - some_buffer
                             const otherRect = other.getRect();
                             // Create a slightly larger rect for the existing car for buffered check
                             const bufferedOtherRect = {
                                x: otherRect.x - spawnBuffer,
                                y: otherRect.y - spawnBuffer,
                                width: otherRect.width + spawnBuffer * 2,
                                height: otherRect.height + spawnBuffer * 2
                             };
                             // Check if the new car overlaps with the buffered area of an existing car
                             if (checkCollision(newCarRect, bufferedOtherRect)) {
                                 spawnCollision = true;
                                 break; // Collision found, no need to check further
                             }
                         }
                     }
                     // --- End spawn collision check ---

                     // Add the car to the game only if no collision was detected on spawn
                     if (!spawnCollision) {
                         this.otherCars.push(newCar); // Add to the active list
                         // console.log(`Spawned car. Total: ${this.otherCars.length}`);
                     } else {
                         // If spawn failed (due to overlap), put the image data back into the pool
                         // so it can be potentially used later.
                         this.availableEnemyImageData.push(selectedImageData);
                         // console.log("Skipped spawn due to overlap");
                     }
                 }
             }
         }

        // Handles player input for movement and actions
        handlePlayerInput() {
            // --- Player 1 Controls (Arrow keys + Space) ---
            let moveX1 = 0, moveY1 = 0; // Initialize movement changes
            if (keysPressed['arrowleft']) moveX1 -= this.carSpeed;
            if (keysPressed['arrowright']) moveX1 += this.carSpeed;
            if (keysPressed['arrowup']) moveY1 -= this.carSpeed;
            if (keysPressed['arrowdown']) moveY1 += this.carSpeed;

            const now = performance.now(); // Get current time for cooldown checks

            // Player 1 Shoot (Spacebar)
            if (keysPressed[' '] && this.bulletsCar1.length < this.maxBullets) { // Check spacebar and bullet limit
                if (now - this.lastShotTimeCar1 > this.shotCooldown) { // Check cooldown
                    // Create a new bullet originating from the front-center of player 1's car
                    const bullet = new Bullet(
                        this.playerCar1.x + this.playerCar1.width, // Start bullet at front edge of car
                        this.playerCar1.y + this.playerCar1.height / 2 - 2.5, // Center vertically (-2.5 adjusts for bullet height)
                        20 // Bullet speed (adjust as needed)
                    );
                    this.bulletsCar1.push(bullet); // Add bullet to player 1's list
                    this.lastShotTimeCar1 = now; // Record shot time for cooldown
                }
            }

            // Player Reset Position Key ('R') - Example action
            if (keysPressed['r']) {
                 // Reset player positions to starting points
                 this.playerCar1.x = 100;
                 this.playerCar1.y = this.screenHeight / 2 - this.playerCar1.height - 20;
                 this.playerCar2.x = 100;
                 this.playerCar2.y = this.screenHeight / 2 + 20;
                 // Optional: Reset bullets when players reset
                 this.bulletsCar1 = [];
                 this.bulletsCar2 = [];
                 // Optional: Reset scores/collision counts if 'R' is a full game reset
                 // this.carsRemovedByCar1 = 0; etc.
            }

            // Apply movement and clamp player 1 to screen bounds
            this.playerCar1.move(moveX1, moveY1);
            this.playerCar1.clampToScreen();

            // --- Player 2 Controls (WASD + F) ---
            let moveX2 = 0, moveY2 = 0; // Initialize movement changes
            if (keysPressed['a']) moveX2 -= this.carSpeed; // Left
            if (keysPressed['d']) moveX2 += this.carSpeed; // Right
            if (keysPressed['w']) moveY2 -= this.carSpeed; // Up
            if (keysPressed['s']) moveY2 += this.carSpeed; // Down

            // Player 2 Shoot ('F' key)
            if (keysPressed['f'] && this.bulletsCar2.length < this.maxBullets) { // Check 'F' key and bullet limit
                 if (now - this.lastShotTimeCar2 > this.shotCooldown) { // Check cooldown
                    // Create a new bullet originating from the front-center of player 2's car
                    const bullet = new Bullet(
                        this.playerCar2.x + this.playerCar2.width,
                        this.playerCar2.y + this.playerCar2.height / 2 - 2.5, // Center vertically
                        20 // Bullet speed
                    );
                    this.bulletsCar2.push(bullet); // Add bullet to player 2's list
                    this.lastShotTimeCar2 = now; // Record shot time for cooldown
                }
            }

            // Apply movement and clamp player 2 to screen bounds
            this.playerCar2.move(moveX2, moveY2);
            this.playerCar2.clampToScreen();
        }

        // Moves enemy cars and removes those that go off-screen left
        moveOtherCars() {
             let newlyOffScreenCount = 0; // Counter for cars removed this frame
             const carIndicesToRemove = new Set(); // Set to store indices of cars to remove

             // Iterate through all active enemy cars
             this.otherCars.forEach((car, index) => {
                 car.moveLeft(this.otherCarSpeed); // Move the car to the left

                 // Check if the car has moved completely off the left edge of the screen
                 if (car.x + car.width < 0) {
                     if (!car.counted) { // Only count/score it once
                         car.counted = true; // Mark as counted
                         newlyOffScreenCount++; // Increment counter for this frame
                     }
                     carIndicesToRemove.add(index); // Mark this car's index for removal
                 }
             });

             // Update the global count of cars that have gone off-screen
             if (newlyOffScreenCount > 0) {
                 this.carsOutOfScreen += newlyOffScreenCount;
             }

             // Remove the cars marked for removal using filtering (more efficient than splice in a loop)
             if (carIndicesToRemove.size > 0) {
                 // Optional: Put removed car images back into the available image pool
                 // This requires storing the original image data on the car or having a mapping system.
                 /*
                 carIndicesToRemove.forEach(index => {
                    if (index < this.otherCars.length) { // Safety check: ensure index is valid before accessing
                        const removedCar = this.otherCars[index];
                        if (removedCar && removedCar.originalTransformedData) { // Check if original data was stored
                            this.availableEnemyImageData.push(removedCar.originalTransformedData);
                        }
                    }
                 });
                 */

                 // Create a new array containing only the cars NOT marked for removal
                 this.otherCars = this.otherCars.filter((_, index) => !carIndicesToRemove.has(index));
                 // console.log(`Removed ${carIndicesToRemove.size} cars (off-screen). New count: ${this.otherCars.length}`);
             }
        }

         // Simple physics separation for overlapping cars
         separateCars(car1, car2) {
            const rect1 = car1.getRect(); // Bounding box of car 1
            const rect2 = car2.getRect(); // Bounding box of car 2
             if (!rect1 || !rect2) return; // Safety check for valid rects

             // Calculate difference in centers
             const dx = (rect1.x + rect1.width / 2) - (rect2.x + rect2.width / 2);
             const dy = (rect1.y + rect1.height / 2) - (rect2.y + rect2.height / 2);
             // Calculate minimum separation distance without overlap
             const combinedHalfWidths = rect1.width / 2 + rect2.width / 2;
             const combinedHalfHeights = rect1.height / 2 + rect2.height / 2;

             // Check if cars are actually overlapping
             if (Math.abs(dx) < combinedHalfWidths && Math.abs(dy) < combinedHalfHeights) {
                 // Calculate overlap amount on each axis
                 const overlapX = combinedHalfWidths - Math.abs(dx);
                 const overlapY = combinedHalfHeights - Math.abs(dy);

                 // Separate along the axis with the *least* amount of overlap (minimum penetration)
                 const separationFactor = 0.6; // How strongly to push apart (0-1)
                 let moveX = 0; // Amount to move car1 horizontally
                 let moveY = 0; // Amount to move car1 vertically

                 if (overlapX < overlapY) {
                     // Separate horizontally
                     moveX = (overlapX / 2) * separationFactor * Math.sign(dx); // Move half the overlap
                     // Add a small vertical nudge if they are directly side-by-side to prevent sticking
                     if (Math.abs(dx) < 5) moveY = (Math.random() - 0.5) * 4;
                 } else {
                     // Separate vertically
                     moveY = (overlapY / 2) * separationFactor * Math.sign(dy); // Move half the overlap
                     // Add a small horizontal nudge if they are directly top-bottom
                     if (Math.abs(dy) < 5) moveX = (Math.random() - 0.5) * 4;
                 }

                 // Apply the separation movement (car1 moves one way, car2 moves the opposite)
                 car1.x += moveX;
                 car1.y += moveY;
                 car2.x -= moveX;
                 car2.y -= moveY;

                 // Re-clamp cars to screen bounds after separation to prevent pushing them out
                 if (typeof car1.clampToScreen === 'function') car1.clampToScreen();
                 if (typeof car2.clampToScreen === 'function') car2.clampToScreen();
             }
         }


        // Checks for and handles collisions between different game objects
        checkCollisions() {
            const now = performance.now(); // Get current time for cooldown checks

            // --- Player vs Other Cars ---
            this.otherCars.forEach(otherCar => {
                // Check collision between Player 1 and this enemy car
                if (checkCollision(this.playerCar1.getRect(), otherCar.getRect())) {
                     // Check cooldown: Has enough time passed since the last collision with *this specific* enemy?
                     if (now - otherCar.lastCollisionTimePlayer1 > this.collisionCooldown) {
                         this.player1CollisionCount++; // Increment player 1's collision score
                         otherCar.lastCollisionTimePlayer1 = now; // Reset cooldown timer for this pair
                     }
                    this.separateCars(this.playerCar1, otherCar); // Push them apart regardless of cooldown
                }
                // Check collision between Player 2 and this enemy car
                if (checkCollision(this.playerCar2.getRect(), otherCar.getRect())) {
                     // Check cooldown for Player 2 and this enemy
                     if (now - otherCar.lastCollisionTimePlayer2 > this.collisionCooldown) {
                         this.player2CollisionCount++; // Increment player 2's collision score
                         otherCar.lastCollisionTimePlayer2 = now; // Reset cooldown timer for this pair
                     }
                    this.separateCars(this.playerCar2, otherCar); // Push them apart
                }
            });

            // --- Player vs Player Collision ---
            if (checkCollision(this.playerCar1.getRect(), this.playerCar2.getRect())) {
                this.separateCars(this.playerCar1, this.playerCar2); // Separate players if they collide
            }

            // --- Other Car vs Other Car Collisions ---
            // Optimized slightly by checking each pair only once (i vs j where j > i)
            for (let i = 0; i < this.otherCars.length; i++) {
                for (let j = i + 1; j < this.otherCars.length; j++) {
                    const carI = this.otherCars[i];
                    const carJ = this.otherCars[j];

                    // Broad phase check (optional but can improve performance):
                    // Only perform the more expensive AABB check if cars are vertically close.
                    const dy = Math.abs((carI.y + carI.height / 2) - (carJ.y + carJ.height / 2));
                    if (dy < (carI.height + carJ.height)) { // Check if vertical distance is less than combined heights
                         // Narrow phase check (AABB collision)
                        if (checkCollision(carI.getRect(), carJ.getRect())) {
                            this.separateCars(carI, carJ); // Separate the two enemy cars
                        }
                    }
                }
            }
        }

        // Checks for bullet collisions with enemy cars and removes hit objects
        checkBulletCollisions() {
            const bulletsToRemoveCar1 = new Set(); // Indices of P1 bullets to remove
            const bulletsToRemoveCar2 = new Set(); // Indices of P2 bullets to remove
            const carIndicesToRemove = new Set(); // Indices of enemy cars hit THIS FRAME

            // --- Bullets from Car 1 ---
            this.bulletsCar1.forEach((bullet, bulletIndex) => {
                bullet.update(); // Move bullet first

                // Remove bullet if it goes off-screen right
                if (bullet.x > this.screenWidth) {
                    bulletsToRemoveCar1.add(bulletIndex);
                } else {
                    // Check collision against each active enemy car
                    this.otherCars.forEach((car, carIndex) => {
                        // Important: Check if car is *not* already marked for removal in this same frame
                        // and if the bullet collides with the car's bounding box.
                        if (!carIndicesToRemove.has(carIndex) && checkCollision(bullet.getRect(), car.getRect())) {
                            bulletsToRemoveCar1.add(bulletIndex); // Mark bullet for removal
                            carIndicesToRemove.add(carIndex);    // Mark car for removal
                            this.carsRemovedByCar1++;           // Increment P1 score
                            // console.log(`HIT P1: Bullet ${bullet.id} -> Car ${car.id}`);
                            return; // A single bullet hits only one car per frame check, exit inner loop
                        }
                    });
                }
            });

             // --- Bullets from Car 2 ---
            this.bulletsCar2.forEach((bullet, bulletIndex) => {
                bullet.update(); // Move bullet first

                // Remove bullet if it goes off-screen right
                if (bullet.x > this.screenWidth) {
                    bulletsToRemoveCar2.add(bulletIndex);
                } else {
                    // Check collision against each active enemy car
                    this.otherCars.forEach((car, carIndex) => {
                        // Check if car not already marked and if collision occurs
                        if (!carIndicesToRemove.has(carIndex) && checkCollision(bullet.getRect(), car.getRect())) {
                            bulletsToRemoveCar2.add(bulletIndex); // Mark bullet
                            carIndicesToRemove.add(carIndex);    // Mark car
                            this.carsRemovedByCar2++;           // Increment P2 score
                             // console.log(`HIT P2: Bullet ${bullet.id} -> Car ${car.id}`);
                             return; // Bullet hits one car, exit inner loop
                        }
                    });
                }
            });

            // --- Remove hit items (after all checks are done) ---
            // Filter out bullets that hit or went off-screen
            if (bulletsToRemoveCar1.size > 0) {
                this.bulletsCar1 = this.bulletsCar1.filter((_, index) => !bulletsToRemoveCar1.has(index));
            }
            if (bulletsToRemoveCar2.size > 0) {
                this.bulletsCar2 = this.bulletsCar2.filter((_, index) => !bulletsToRemoveCar2.has(index));
            }

            // Filter out enemy cars that were hit
            if (carIndicesToRemove.size > 0) {
                // Optional: Put removed car images back into the available pool
                 /*
                 carIndicesToRemove.forEach(index => {
                    if (index < this.otherCars.length) { // Safety check index is valid
                        const removedCar = this.otherCars[index];
                        if (removedCar && removedCar.originalTransformedData) { // Check if data was stored
                           this.availableEnemyImageData.push(removedCar.originalTransformedData);
                        }
                    }
                 });
                 */

                // Create new array excluding the hit cars
                this.otherCars = this.otherCars.filter((_, index) => !carIndicesToRemove.has(index));
                // console.log(`Removed ${carIndicesToRemove.size} cars (hit). New count: ${this.otherCars.length}`);
            }
        }


        // Helper function to draw text with a background for better readability
        drawText(text, x, y, color = 'white', bgColor = 'rgba(0, 0, 0, 0.6)') {
            ctx.font = '20px Arial'; // Set font for measurement and drawing
            const textMetrics = ctx.measureText(text); // Measure text width
            const textWidth = textMetrics.width;
            // Estimate text height based on font size (more reliable across browsers than specific ascent/descent)
            const textHeight = parseInt(ctx.font, 10) * 1.2; // Approx 120% of font size

            // Draw background rectangle slightly larger than the text
            ctx.fillStyle = bgColor;
            // Adjust y-position for background based on text baseline (fillText draws from baseline)
            ctx.fillRect(x - 5, y - textHeight + 5 , textWidth + 10, textHeight + 4); // Padding: 5px left/right, 2px top/bottom

            // Draw the actual text on top of the background
            ctx.fillStyle = color;
            ctx.fillText(text, x, y);
        }

        // Main drawing function, renders the entire game state to the canvas
        draw() {
            // Clear canvas (or draw background)
            ctx.fillStyle = '#3333AA'; // Dark blue road color
            ctx.fillRect(0, 0, this.screenWidth, this.screenHeight);

            // Draw road markings first (background elements)
            this.roadMarkings.forEach(marking => marking.draw(ctx));

            // Draw cars (enemies first, then players on top)
            this.otherCars.forEach(car => car.draw(ctx));
            this.playerCar1.draw(ctx);
            this.playerCar2.draw(ctx);

            // Draw bullets
            this.bulletsCar1.forEach(bullet => bullet.draw(ctx));
            this.bulletsCar2.forEach(bullet => bullet.draw(ctx));

            // Draw UI / Stats overlay
            const now = performance.now();
            // Calculate elapsed time
            const timePlayedSeconds = Math.floor((now - this.startTime) / 1000);
            const hours = Math.floor(timePlayedSeconds / 3600);
            const minutes = Math.floor((timePlayedSeconds % 3600) / 60);
            const seconds = timePlayedSeconds % 60;
            this.updateFpsCounter(now); // Update FPS calculation

            // Display stats using the drawText helper
            let yPos = 30; // Starting Y position for the text block
            const lineH = 28; // Line height for spacing out stats
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

        // Main game loop update function - updates the game state
        update() {
            this.handlePlayerInput();    // Read player controls and update player states/bullets
            this.moveOtherCars();        // Move enemies, remove those off-screen left
            // Move road markings (slightly faster than enemies for parallax effect)
            this.roadMarkings.forEach(m => m.moveLeft(this.otherCarSpeed * 1.2));
            this.checkCollisions();      // Check and resolve player/enemy/enemy collisions
            this.checkBulletCollisions();// Check bullet hits, remove bullets and hit cars
            this.loadNewCars();          // Spawn new enemy cars if density is below MAX_CARS
        }

        // The recursive game loop function called by requestAnimationFrame
        gameLoop(timestamp) { // timestamp is provided by requestAnimationFrame
            this.update(); // Update the game logic and state
            this.draw();   // Render the current game state to the canvas
            // Request the browser to call gameLoop again before the next repaint
            requestAnimationFrame(this.gameLoop.bind(this)); // Use bind to maintain 'this' context
        }

        // Starts the game execution
        start() {
             console.log("Starting game loop...");
             // Basic check for essential assets before starting
             if (!this.playerCar1 || !this.playerCar2 || !this.enemyImagesData) {
                 console.error("Cannot start game, essential assets missing (players or enemy image data).");
                 alert("Error: Game assets not loaded correctly. Check console (F12).");
                 return; // Prevent starting the loop if setup failed
             }
            // Record start time and initialize FPS update timer
            this.startTime = performance.now();
            this.lastFpsUpdate = this.startTime;
            // Kick off the game loop
            requestAnimationFrame(this.gameLoop.bind(this));
        }
    }


    // --- Game Initialization and Start ---

    console.log("DOM loaded. Starting image loading process...");

    // 1. Generate potential image file paths based on naming convention
    const potentialImagePaths = [];
    for (let i = 1; i <= MAX_IMAGES_TO_CHECK; i++) {
        const filename = i.toString().padStart(FILENAME_PADDING, '0') + IMAGE_EXTENSION; // e.g., "001.png"
        potentialImagePaths.push(`${IMAGE_FOLDER}/${filename}`); // e.g., "auto/001.png"
    }
    console.log(`Probing for up to ${MAX_IMAGES_TO_CHECK} images in '${IMAGE_FOLDER}/'...`);

    // 2. Attempt to load all potential images asynchronously using Promise.allSettled
    //    Promise.allSettled waits for all promises to resolve or reject.
    Promise.allSettled(potentialImagePaths.map(loadImage))
        .then(results => {
            console.log("Image loading probe finished.");
            const successfullyLoaded = []; // Array to store info of successfully loaded images
            // Process the results of each loading attempt
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    // If loaded successfully, store its path and the loaded Image object
                    successfullyLoaded.push({ path: potentialImagePaths[index], image: result.value });
                }
                // Optional: Log failures if needed for debugging image names/paths
                // else { console.warn(`Did not find or load: ${potentialImagePaths[index]}`); }
            });

            // 3. Check if enough images were loaded (at least 2 for the players)
            if (successfullyLoaded.length < 2) {
                console.error(`Error: Loaded only ${successfullyLoaded.length} images, need at least 2 for player cars.`);
                alert(`Error: Loaded only ${successfullyLoaded.length} images from the '${IMAGE_FOLDER}' folder. Need at least 2. Check folder contents, naming (e.g., 001.png), and MAX_IMAGES_TO_CHECK in script.js.`);
                return; // Stop initialization if not enough images
            }
            console.log(`Successfully loaded ${successfullyLoaded.length} images.`);

            // 4. Prepare image data for the game: select player images, identify enemy images
            // Store all loaded Image objects in the global map for easy access by path
            successfullyLoaded.forEach(item => {
                 loadedImages[item.path] = item.image;
            });
            // Create a list of paths of the successfully loaded images
            let availableImagePaths = successfullyLoaded.map(item => item.path);

            // Randomly select player images from the available list
            shuffleArray(availableImagePaths); // Randomize the order
            if (availableImagePaths.length < 2) {
                 // This check should be redundant due to the earlier check, but good practice
                 throw new Error("Insufficient unique images loaded for two players after shuffling.");
            }
            // Pop two paths off the shuffled list for the players
            const player1Path = availableImagePaths.pop();
            const player2Path = availableImagePaths.pop();
            // The remaining paths in the list are for the enemy cars
            const enemyImagePaths = availableImagePaths;

            console.log(`Player 1 uses: ${player1Path}`);
            console.log(`Player 2 uses: ${player2Path}`);
            console.log(`${enemyImagePaths.length} images available for enemies.`);

            // 5. Create transformed image data (rotated, scaled) on offscreen canvases
            //    This pre-processing avoids doing rotations/scaling every frame.
            const player1Original = loadedImages[player1Path];
            const player2Original = loadedImages[player2Path];

            // Check if the retrieved player images are valid
            if (!player1Original || !player2Original) {
                 console.error("Could not find loaded image data for selected player paths:", player1Path, player2Path);
                 throw new Error("Internal error: Failed to retrieve loaded image data for players.");
            }

            // Create the transformed versions for players
            const player1TransformedData = createTransformedImage(player1Original, IMAGE_SCALE, PLAYER_CAR_ROTATION_DEGREES);
            const player2TransformedData = createTransformedImage(player2Original, IMAGE_SCALE, PLAYER_CAR_ROTATION_DEGREES);

            // Create transformed versions for all potential enemy cars
            const enemyTransformedData = enemyImagePaths
                .map(path => loadedImages[path]) // Get the Image object for each enemy path
                .filter(img => img && img.width > 0 && img.height > 0) // Filter out any invalid/unloaded images
                .map(img => createTransformedImage(img, IMAGE_SCALE, OTHER_CAR_ROTATION_DEGREES)) // Transform each valid image
                .filter(data => data && data.canvas && data.width > 0); // Filter out any transformations that failed

            // Validate the transformed player data
            if (!player1TransformedData || !player2TransformedData || !player1TransformedData.canvas || !player2TransformedData.canvas) {
                 console.error("Failed to create transformed image data for player cars.", player1TransformedData, player2TransformedData);
                 throw new Error("Failed to create transformed image data for players.");
            }
            // Log warnings if enemy image processing had issues
            if (enemyTransformedData.length === 0 && enemyImagePaths.length > 0) {
                console.warn("Some enemy images were loaded but failed transformation or filtering.");
            }
            if (enemyTransformedData.length === 0 && successfullyLoaded.length >=2 ) {
                 console.warn("No valid enemy images available after transformation. Enemies will not spawn.");
                 // Game can potentially run without enemies, but this is usually not intended.
            }


            // 6. Create and start the game instance with the prepared assets
            console.log("Creating Game instance...");
            const game = new Game(
                SCREEN_WIDTH, SCREEN_HEIGHT,
                CAR_SPEED, OTHER_CAR_SPEED,
                player1TransformedData, // Pass the {canvas, width, height} object for P1
                player2TransformedData, // Pass the {canvas, width, height} object for P2
                enemyTransformedData    // Pass the array of {canvas, width, height} objects for enemies
            );
            game.start(); // Start the game loop

        })
        .catch(error => { // Catch any unexpected errors during the image loading/setup Promise chain
            console.error("Error during game initialization:", error);
            alert(`An error occurred during game setup: ${error.message}. Check the console (F12) for details.`);
        });

}); // End DOMContentLoaded listener
