// Wait until the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {

    // --- Constants ---
    const SCREEN_WIDTH = 1920;
    const SCREEN_HEIGHT = 1010;
    const CAR_SPEED = 15;
    const OTHER_CAR_SPEED = 3;
    const MAX_CARS = 60;
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
             return { canvas: document.createElement('canvas'), width: 10, height: 10 }; // Small placeholder
        }
        const radians = rotationDegrees * Math.PI / 180;
        const newWidth = originalImage.width * scale;
        const newHeight = originalImage.height * scale;

        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');

        const absCos = Math.abs(Math.cos(radians));
        const absSin = Math.abs(Math.sin(radians));
        offscreenCanvas.width = newWidth * absCos + newHeight * absSin;
        offscreenCanvas.height = newWidth * absSin + newHeight * absCos;

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
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'f', 'r'].includes(e.key.toLowerCase())) {
            e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => {
        keysPressed[e.key.toLowerCase()] = false;
    });

    // --- Classes --- (Car, OtherCar, Bullet, RoadMarking - remain the same as before)

    class Car {
        constructor(transformedImageCanvas, screenWidth, screenHeight) {
            this.transformedImage = transformedImageCanvas; // This is the { canvas, width, height } object
            this.width = this.transformedImage.width;
            this.height = this.transformedImage.height;
            this.x = 0;
            this.y = 0;
            this.screenWidth = screenWidth;
            this.screenHeight = screenHeight;
            this.counted = false; // For tracking off-screen cars
        }
        getRect() {
            return { x: this.x, y: this.y, width: this.width, height: this.height };
        }
        move(dx, dy) {
            const oldPos = { x: this.x, y: this.y };
            this.x += dx;
            this.y += dy;
            return oldPos;
        }
        clampToScreen() {
            if (this.x < 0) this.x = 0;
            if (this.x + this.width > this.screenWidth) this.x = this.screenWidth - this.width;
            if (this.y < 0) this.y = 0;
            if (this.y + this.height > this.screenHeight) this.y = this.screenHeight - this.height;
        }
        draw(ctx) {
            if (this.transformedImage && this.transformedImage.canvas) {
                ctx.drawImage(this.transformedImage.canvas, this.x, this.y);
            } else {
                 console.warn("Attempted to draw car with invalid transformedImage", this);
            }
            // Optional: Draw bounding box for debugging
            // ctx.strokeStyle = 'lime'; // Use a different color for player boxes
            // ctx.strokeRect(this.x, this.y, this.width, this.height);
        }
    }

    class OtherCar extends Car {
        constructor(transformedImageCanvas, screenWidth, screenHeight, index, playerCar1, playerCar2) {
             super(transformedImageCanvas, screenWidth, screenHeight);
             this.x = screenWidth + index * getRandomInt(150, 250); // Stagger start positions
             this.y = getRandomInt(0, screenHeight - this.height);
             this.playerCar1 = playerCar1;
             this.playerCar2 = playerCar2;
             this.isOutOfScreen = false;
             this.counted = false;
             this.lastCollisionTimePlayer1 = 0;
             this.lastCollisionTimePlayer2 = 0;
             this.id = Math.random();
             this.stuckTime = 0;
             this.lastPosition = {x: this.x, y: this.y};
             this.stuckCheckCounter = 0; // Check less frequently
        }

        moveLeft(speed) {
            const oldPos = { x: this.x, y: this.y };
            this.x -= speed;

            if (this.x + this.width < 0) {
                this.isOutOfScreen = true;
                this.x = this.screenWidth + getRandomInt(50, 200);
                this.y = getRandomInt(0, this.screenHeight - this.height);
                this.counted = false;
            }

            // Check for stuck state less often
            this.stuckCheckCounter++;
            if (this.stuckCheckCounter > 10) { // Check every 10 frames approx
                 this.stuckCheckCounter = 0;
                 if (Math.abs(this.x - this.lastPosition.x) < 1 && Math.abs(this.y - this.lastPosition.y) < 1) {
                     this.stuckTime++;
                 } else {
                     this.stuckTime = 0;
                     this.lastPosition = {x: this.x, y: this.y};
                 }

                 if (this.stuckTime > 3) { // If stuck for ~3 checks (~30 frames)
                     // console.log(`Nudging potentially stuck car ${this.id} at ${this.x.toFixed(0)}, ${this.y.toFixed(0)}`);
                     // Try a more significant random nudge
                     this.y += getRandomInt(-15, 15);
                     this.x += getRandomInt(5, 15); // Push forward
                     this.clampToScreen();
                     this.stuckTime = 0;
                     this.lastPosition = {x: this.x, y: this.y}; // Update last position after nudge
                 }
            }

            return oldPos;
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
             this.id = Math.random();
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
            if (this.x + this.width < 0) {
                // Wrap around far to the right, beyond the typical spawn area of new markings
                this.x += this.screenWidth * 1.5 + Math.random() * 200;
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

            this.playerCar1.x = 100;
            this.playerCar1.y = 200;
            this.playerCar2.x = 150;
            this.playerCar2.y = 250;

            this.enemyImagesData = enemyImagesData; // Array of { canvas, width, height }
            this.availableEnemyImageData = [...this.enemyImagesData]; // Copy for spawning

            this.otherCars = [];
            this.bulletsCar1 = [];
            this.bulletsCar2 = [];
            this.maxBullets = 45;
            this.lastShotTimeCar1 = 0;
            this.lastShotTimeCar2 = 0;
            this.shotCooldown = 150; // ms

            this.carsRemovedByCar1 = 0;
            this.carsRemovedByCar2 = 0;
            this.carsOutOfScreen = 0;
            this.player1CollisionCount = 0;
            this.player2CollisionCount = 0;
            this.collisionCooldown = 150; // ms

            this.startTime = performance.now();
            this.frameCount = 0;
            this.fps = 0;
            this.lastFpsUpdate = performance.now();

            this.lastOtherCarLoadTime = 0;
            this.otherCarLoadInterval = 300; // ms - Check more often initially?

            this.roadMarkings = [];
            this.setupRoadMarkings();
        }

        setupRoadMarkings() {
             const numLanes = 5;
             const laneHeight = this.screenHeight / numLanes;
             const markingSpacing = 250; // Distance between markings horizontally
             const markingsPerScreenRoughly = Math.ceil(this.screenWidth / markingSpacing) + 2; // Enough to wrap

             for (let i = 0; i < numLanes; i++) {
                 const laneY = (i * laneHeight) + (laneHeight / 2) - 5; // Center vertically
                 for (let j = 0; j < markingsPerScreenRoughly; j++) {
                     // Distribute initial markings across the screen and off-screen right
                     const initialX = (j * markingSpacing) + Math.random() * 50 - 100; // Start some on/off screen left
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

         loadNewCars() {
             const now = performance.now();
             if (now - this.lastOtherCarLoadTime < this.otherCarLoadInterval) {
                 return;
             }
             this.lastOtherCarLoadTime = now;

             const currentCarCount = this.otherCars.length;
             if (currentCarCount >= MAX_CARS || this.availableEnemyImageData.length === 0) {
                 return; // Don't add if max reached or no images left
             }

             const availableSlots = MAX_CARS - currentCarCount;
             const numToAdd = Math.min(availableSlots, 2, this.availableEnemyImageData.length); // Add 1 or 2 at a time

             for (let i = 0; i < numToAdd; i++) {
                 if (this.availableEnemyImageData.length === 0) {
                    // If we ran out while trying to add, replenish from the master list
                    if (this.enemyImagesData.length > 0) {
                        this.availableEnemyImageData = [...this.enemyImagesData];
                        console.log("Replenished available enemy images.");
                    } else {
                        break; // Should not happen if initial check passed, but safety first
                    }
                 }

                 // Pick random index from available, then remove it to avoid immediate reuse
                 const randomIndex = Math.floor(Math.random() * this.availableEnemyImageData.length);
                 const selectedImageData = this.availableEnemyImageData.splice(randomIndex, 1)[0]; // Remove and get item

                 if (selectedImageData) {
                     const newCar = new OtherCar(
                         selectedImageData,
                         this.screenWidth,
                         this.screenHeight,
                         currentCarCount + i, // Index for initial spacing
                         this.playerCar1,
                         this.playerCar2
                     );

                     // Basic spawn collision check (against players and a few recent enemies)
                     let spawnCollision = false;
                     if (checkCollision(newCar.getRect(), this.playerCar1.getRect()) || checkCollision(newCar.getRect(), this.playerCar2.getRect())) {
                          spawnCollision = true;
                     } else {
                         // Check against last few spawned cars
                         const checkAgainst = this.otherCars.slice(-5); // Check last 5
                         for(const other of checkAgainst) {
                             if (checkCollision(newCar.getRect(), other.getRect())) {
                                 spawnCollision = true;
                                 break;
                             }
                         }
                     }


                     if (!spawnCollision) {
                         this.otherCars.push(newCar);
                     } else {
                         // Put image back if spawn failed
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
            if (keysPressed[' '] && this.bulletsCar1.length < this.maxBullets) {
                if (now - this.lastShotTimeCar1 > this.shotCooldown) {
                    const bullet = new Bullet(
                        this.playerCar1.x + this.playerCar1.width,
                        this.playerCar1.y + this.playerCar1.height / 2 - 2.5,
                        10
                    );
                    this.bulletsCar1.push(bullet);
                    this.lastShotTimeCar1 = now;
                }
            }

            if (keysPressed['r']) {
                 this.playerCar1.x = 100;
                 this.playerCar1.y = 200;
                 this.playerCar2.x = 150;
                 this.playerCar2.y = 250;
                 // Maybe reset bullets/scores too?
                 this.bulletsCar1 = [];
                 this.bulletsCar2 = [];
                 // Reset collision counts? Decide game rules.
            }


            this.playerCar1.move(moveX1, moveY1);
            this.playerCar1.clampToScreen();


            let moveX2 = 0, moveY2 = 0;
            if (keysPressed['a']) moveX2 -= this.carSpeed;
            if (keysPressed['d']) moveX2 += this.carSpeed;
            if (keysPressed['w']) moveY2 -= this.carSpeed;
            if (keysPressed['s']) moveY2 += this.carSpeed;

            if (keysPressed['f'] && this.bulletsCar2.length < this.maxBullets) {
                 if (now - this.lastShotTimeCar2 > this.shotCooldown) {
                    const bullet = new Bullet(
                        this.playerCar2.x + this.playerCar2.width,
                        this.playerCar2.y + this.playerCar2.height / 2 - 2.5,
                        10
                    );
                    this.bulletsCar2.push(bullet);
                    this.lastShotTimeCar2 = now;
                }
            }

            this.playerCar2.move(moveX2, moveY2);
            this.playerCar2.clampToScreen();
        }

        moveOtherCars() {
             let newlyOffScreen = 0;
            this.otherCars.forEach(car => {
                 car.moveLeft(this.otherCarSpeed);
                 if (car.isOutOfScreen && !car.counted) {
                     car.counted = true;
                     car.isOutOfScreen = false; // Reset internal flag
                     newlyOffScreen++;
                 }
            });
             if (newlyOffScreen > 0) {
                 this.carsOutOfScreen += newlyOffScreen;
             }
        }

         separateCars(car1, car2) {
            const rect1 = car1.getRect();
            const rect2 = car2.getRect();
             if (!rect1 || !rect2) return; // Safety check

             const dx = (rect1.x + rect1.width / 2) - (rect2.x + rect2.width / 2);
             const dy = (rect1.y + rect1.height / 2) - (rect2.y + rect2.height / 2);
             const combinedHalfWidths = rect1.width / 2 + rect2.width / 2;
             const combinedHalfHeights = rect1.height / 2 + rect2.height / 2;

             // Check for collision using center distances
             if (Math.abs(dx) < combinedHalfWidths && Math.abs(dy) < combinedHalfHeights) {
                 const overlapX = combinedHalfWidths - Math.abs(dx);
                 const overlapY = combinedHalfHeights - Math.abs(dy);

                 // Separate along the axis of least overlap
                 const separationFactor = 0.5; // Gentle separation
                 let moveX = 0;
                 let moveY = 0;

                 if (overlapX < overlapY) {
                     moveX = (overlapX / 2) * separationFactor * Math.sign(dx);
                 } else {
                     moveY = (overlapY / 2) * separationFactor * Math.sign(dy);
                 }
                 // Ensure minimum separation if perfectly aligned
                 if (moveX === 0 && moveY === 0 && overlapX > 0 && overlapY > 0) {
                    moveX = (Math.random() - 0.5) * 2; // Small random nudge if perfectly overlapped
                    moveY = (Math.random() - 0.5) * 2;
                 }


                 car1.x += moveX;
                 car1.y += moveY;
                 car2.x -= moveX;
                 car2.y -= moveY;

                // Clamp after separation
                 if (typeof car1.clampToScreen === 'function') car1.clampToScreen();
                 if (typeof car2.clampToScreen === 'function') car2.clampToScreen();
             }
         }


        checkCollisions() {
            const now = performance.now();

            // Player vs Other Cars
            this.otherCars.forEach(otherCar => {
                if (checkCollision(this.playerCar1.getRect(), otherCar.getRect())) {
                     if (now - otherCar.lastCollisionTimePlayer1 > this.collisionCooldown) {
                         this.player1CollisionCount++;
                         otherCar.lastCollisionTimePlayer1 = now;
                     }
                    this.separateCars(this.playerCar1, otherCar);
                }
                if (checkCollision(this.playerCar2.getRect(), otherCar.getRect())) {
                     if (now - otherCar.lastCollisionTimePlayer2 > this.collisionCooldown) {
                         this.player2CollisionCount++;
                         otherCar.lastCollisionTimePlayer2 = now;
                     }
                    this.separateCars(this.playerCar2, otherCar);
                }
            });

            // Player vs Player
            if (checkCollision(this.playerCar1.getRect(), this.playerCar2.getRect())) {
                this.separateCars(this.playerCar1, this.playerCar2);
            }

            // Other Car vs Other Car (Optimized slightly - check each pair once)
            for (let i = 0; i < this.otherCars.length; i++) {
                for (let j = i + 1; j < this.otherCars.length; j++) {
                    // Check collision only if they are somewhat close horizontally for optimization
                    const carI = this.otherCars[i];
                    const carJ = this.otherCars[j];
                     const dx = Math.abs((carI.x + carI.width / 2) - (carJ.x + carJ.width / 2));
                     const dy = Math.abs((carI.y + carI.height / 2) - (carJ.y + carJ.height / 2));
                     // Broad phase check (optional but can help performance with many cars)
                     if (dx < (carI.width + carJ.width) && dy < (carI.height + carJ.height)) {
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
            const carIndicesToRemove = new Set(); // Store indices of cars to remove

            // --- Bullets from Car 1 ---
            this.bulletsCar1.forEach((bullet, bulletIndex) => {
                bullet.update();
                if (bullet.x > this.screenWidth) {
                    bulletsToRemoveCar1.add(bulletIndex);
                } else {
                    this.otherCars.forEach((car, carIndex) => {
                        // Important: Check if car is already marked for removal THIS FRAME
                        if (!carIndicesToRemove.has(carIndex) && checkCollision(bullet.getRect(), car.getRect())) {
                            bulletsToRemoveCar1.add(bulletIndex);
                            carIndicesToRemove.add(carIndex); // Mark car by its current index
                            this.carsRemovedByCar1++;
                            // console.log(`HIT P1: Bullet ${bullet.id} -> Car ${car.id}`);
                             // No need to check this bullet against other cars once it hits
                             return; // Exit inner loop (forEach cannot break easily, but this speeds up slightly)
                        }
                    });
                }
            });

             // --- Bullets from Car 2 ---
            this.bulletsCar2.forEach((bullet, bulletIndex) => {
                bullet.update();
                if (bullet.x > this.screenWidth) {
                    bulletsToRemoveCar2.add(bulletIndex);
                } else {
                    this.otherCars.forEach((car, carIndex) => {
                        if (!carIndicesToRemove.has(carIndex) && checkCollision(bullet.getRect(), car.getRect())) {
                            bulletsToRemoveCar2.add(bulletIndex);
                            carIndicesToRemove.add(carIndex);
                            this.carsRemovedByCar2++;
                             // console.log(`HIT P2: Bullet ${bullet.id} -> Car ${car.id}`);
                             return; // Exit inner loop
                        }
                    });
                }
            });

            // --- Remove items ---
            // Filter bullets (create new arrays)
            this.bulletsCar1 = this.bulletsCar1.filter((_, index) => !bulletsToRemoveCar1.has(index));
            this.bulletsCar2 = this.bulletsCar2.filter((_, index) => !bulletsToRemoveCar2.has(index));

            // Filter cars (create new array, more robust than splice with indices)
            if (carIndicesToRemove.size > 0) {
                 const originalLength = this.otherCars.length;
                 // Put removed car images back into the available pool
                 carIndicesToRemove.forEach(index => {
                     const removedCar = this.otherCars[index];
                     if (removedCar && removedCar.transformedImage) {
                        // Need a way to know the original image data to put back.
                        // Simplification: Don't put images back for now, assume enough variety or they respawn anyway.
                        // Or, store original path/index on car object if replenishment is critical.
                     }
                 });

                this.otherCars = this.otherCars.filter((_, index) => !carIndicesToRemove.has(index));
                 // console.log(`Removed ${carIndicesToRemove.size} cars. Old count: ${originalLength}, New count: ${this.otherCars.length}`);
            }
        }


        drawText(text, x, y, color = 'white', bgColor = 'rgba(0, 0, 0, 0.6)') {
            ctx.font = '20px Arial';
            const textMetrics = ctx.measureText(text);
            const textWidth = textMetrics.width;
            const textHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;

            // Draw background rect
            ctx.fillStyle = bgColor;
            ctx.fillRect(x - 3, y - textHeight - 1 , textWidth + 6, textHeight + 4); // Padding

            // Draw text
            ctx.fillStyle = color;
            ctx.fillText(text, x, y);
        }

        draw() {
            ctx.fillStyle = '#0000FF';
            ctx.fillRect(0, 0, this.screenWidth, this.screenHeight);

            this.roadMarkings.forEach(marking => marking.draw(ctx));

            this.playerCar1.draw(ctx);
            this.playerCar2.draw(ctx);
            this.otherCars.forEach(car => car.draw(ctx));

            this.bulletsCar1.forEach(bullet => bullet.draw(ctx));
            this.bulletsCar2.forEach(bullet => bullet.draw(ctx));

            const now = performance.now();
            const timePlayedSeconds = Math.floor((now - this.startTime) / 1000);
            const hours = Math.floor(timePlayedSeconds / 3600);
            const minutes = Math.floor((timePlayedSeconds % 3600) / 60);
            const seconds = timePlayedSeconds % 60;
            this.updateFpsCounter(now);

            let yPos = 30;
            const lineH = 30;
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

        update() {
            this.handlePlayerInput();
            this.moveOtherCars(); // Move enemies first
            this.roadMarkings.forEach(m => m.moveLeft(this.otherCarSpeed)); // Move markings
            this.checkCollisions(); // Resolve overlaps
            this.checkBulletCollisions(); // Check hits, remove bullets/cars
            this.loadNewCars(); // Add new cars if space available
        }

        gameLoop(timestamp) {
            this.update();
            this.draw();
            requestAnimationFrame(this.gameLoop.bind(this));
        }

        start() {
             console.log("Starting game loop...");
            this.startTime = performance.now();
            this.lastFpsUpdate = this.startTime;
            requestAnimationFrame(this.gameLoop.bind(this));
        }
    }


    // --- Game Initialization and Start ---

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
                // Optional: Log failures if needed for debugging, but expect many
                // else { console.warn(`Did not find or load: ${potentialImagePaths[index]}`); }
            });

            if (successfullyLoaded.length < 2) {
                console.error(`Error: Loaded only ${successfullyLoaded.length} images, need at least 2 for player cars.`);
                alert(`Error: Loaded only ${successfullyLoaded.length} images from the '${IMAGE_FOLDER}' folder. Need at least 2. Check folder contents, naming (e.g., 001.png), and MAX_IMAGES_TO_CHECK in script.js.`);
                return;
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
                 throw new Error("Could not find loaded image data for selected player paths.");
             }

            const player1TransformedData = createTransformedImage(player1Original, IMAGE_SCALE, PLAYER_CAR_ROTATION_DEGREES);
            const player2TransformedData = createTransformedImage(player2Original, IMAGE_SCALE, PLAYER_CAR_ROTATION_DEGREES);

            const enemyTransformedData = enemyImagePaths
                .map(path => loadedImages[path]) // Get Image object
                .filter(img => img) // Ensure image exists
                .map(img => createTransformedImage(img, IMAGE_SCALE, OTHER_CAR_ROTATION_DEGREES)); // Transform

            if (!player1TransformedData || !player2TransformedData || enemyTransformedData.some(data => !data?.canvas)) {
                 console.error("Failed to create transformed image data.", player1TransformedData, player2TransformedData, enemyTransformedData);
                 throw new Error("Failed to create transformed image data for players or enemies.");
            }


            // 5. Create and start the game instance
            const game = new Game(
                SCREEN_WIDTH, SCREEN_HEIGHT,
                CAR_SPEED, OTHER_CAR_SPEED,
                player1TransformedData,
                player2TransformedData,
                enemyTransformedData // Pass array of transformed data for enemies
            );
            game.start();

        })
        .catch(error => { // Catch unexpected errors in the promise chain itself
            console.error("Unexpected error during image loading setup:", error);
            alert("An unexpected error occurred setting up image loading. Check the console (F12).");
        });

}); // End DOMContentLoaded
