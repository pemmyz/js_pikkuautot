// Wait until the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {

    const helpMenu = document.getElementById('helpMenu');
    const helpButton = document.getElementById('helpButton');
    let isGamePaused = false;

    // --- Reusable function to toggle help menu and game pause state ---
    function toggleHelp() {
        isGamePaused = !isGamePaused;
        helpMenu.classList.toggle('hidden');

        // When pausing, clear all currently pressed keys to prevent "stuck" movement
        if (isGamePaused) {
            for (const k in keysPressed) {
                keysPressed[k] = false;
            }
        }
    }

    // --- Constants ---
    const SCREEN_WIDTH = 1920;
    const SCREEN_HEIGHT = 1080;
    const CAR_SPEED = 15;          // Player car speed
    const OTHER_CAR_SPEED = 3;     // Enemy car speed
    const MAX_CARS = 60;           // Target maximum number of enemy cars on screen
    const IMAGE_SCALE = 1 / 3;     // Scale factor for car images
    const PLAYER_CAR_ROTATION_DEGREES = -90; // Rotation for player cars (adjust if needed)
    const OTHER_CAR_ROTATION_DEGREES = -90;  // Rotation for enemy cars (adjust if needed)

    // --- Image Loading Constants ---
    const IMAGE_FOLDER = 'auto';   // Folder containing car sprites
    const IMAGE_EXTENSION = '.png'; // File extension of sprites
    const MAX_IMAGES_TO_CHECK = 200; // How many numbered files to check for (e.g., 001.png to 200.png)
    const FILENAME_PADDING = 3;      // Number of digits in filenames (e.g., 3 for '001')

    // --- Canvas Setup ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    if (!canvas || !ctx) {
        console.error("Failed to get canvas element or context!");
        return; // Stop script execution if canvas isn't found
    }

    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;

    // --- Asset Loading ---
    const loadedImages = {}; // Store loaded Image objects, keyed by their file path

    // --- Helper Functions ---
    function getRandomInt(min, max) { min = Math.ceil(min); max = Math.floor(max); return Math.floor(Math.random() * (max - min + 1)) + min; }
    function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[array[i], array[j]] = [array[j], array[i]]; } }
    function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = (err) => { reject(new Error(`Failed to load ${src}`)); }; img.src = src; }); }
    function createTransformedImage(originalImage, scale, rotationDegrees) { if (!originalImage || !originalImage.width || !originalImage.height) { console.error("Invalid image provided to createTransformedImage", originalImage); const placeholderCanvas = document.createElement('canvas'); placeholderCanvas.width = 10; placeholderCanvas.height = 10; return { canvas: placeholderCanvas, width: 10, height: 10 }; } const radians = rotationDegrees * Math.PI / 180; const newWidth = originalImage.width * scale; const newHeight = originalImage.height * scale; const offscreenCanvas = document.createElement('canvas'); const offscreenCtx = offscreenCanvas.getContext('2d'); const absCos = Math.abs(Math.cos(radians)); const absSin = Math.abs(Math.sin(radians)); offscreenCanvas.width = newWidth * absCos + newHeight * absSin; offscreenCanvas.height = newWidth * absSin + newHeight * absCos; offscreenCtx.translate(offscreenCanvas.width / 2, offscreenCanvas.height / 2); offscreenCtx.rotate(radians); offscreenCtx.scale(scale, scale); offscreenCtx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2); return { canvas: offscreenCanvas, width: offscreenCanvas.width, height: offscreenCanvas.height }; }
    function checkCollision(rect1, rect2) { if (!rect1 || typeof rect1.x !== 'number' || typeof rect1.y !== 'number' || typeof rect1.width !== 'number' || typeof rect1.height !== 'number' || !rect2 || typeof rect2.x !== 'number' || typeof rect2.y !== 'number' || typeof rect2.width !== 'number' || typeof rect2.height !== 'number') { return false; } return (rect1.x < rect2.x + rect2.width && rect1.x + rect1.width > rect2.x && rect1.y < rect2.y + rect2.height && rect1.y + rect1.height > rect2.y); }

    // --- Input Handling ---
    const keysPressed = {};
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();

        // Prevent default browser actions for game keys
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'f', 'r', 'h'].includes(key)) {
            e.preventDefault();
        }

        // Handle pause toggle separately
        if (key === 'h') {
            toggleHelp();
            return; // Don't process 'h' as a game input
        }

        // Only process game input if not paused
        if (!isGamePaused) {
            keysPressed[key] = true;
        }
    });

    window.addEventListener('keyup', (e) => {
        // Always allow keyup to register to prevent stuck keys when pausing/unpausing
        keysPressed[e.key.toLowerCase()] = false;
    });

    // Add click listener for the help button
    helpButton.addEventListener('click', toggleHelp);


    // --- GAMEPAD STATE & LOGIC (MODIFIED FOR AUTOFIRE) ---
    let player1GamepadIndex = null;
    let player2GamepadIndex = null;
    const gamepadAssignmentCooldown = {};
    const FACE_BUTTON_INDICES = [0, 1, 2, 3]; // A, B, X, Y (standard layout)

    function pollGamepads() {
        const pads = navigator.getGamepads();
        if (!pads) return;

        // --- Step 1: Assignment Logic ---
        for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            if (!pad || gamepadAssignmentCooldown[i]) continue;

            const isAssigned = (player1GamepadIndex === i || player2GamepadIndex === i);
            if (isAssigned) continue;

            const faceButtonPressed = FACE_BUTTON_INDICES.some(index => pad.buttons[index]?.pressed);
            if (faceButtonPressed) {
                if (player1GamepadIndex === null) {
                    player1GamepadIndex = i;
                    console.log(`Gamepad ${i} (${pad.id}) assigned to Player 1.`);
                } else if (player2GamepadIndex === null) {
                    player2GamepadIndex = i;
                    console.log(`Gamepad ${i} (${pad.id}) assigned to Player 2.`);
                }
                // Cooldown to prevent assigning to both players on one press
                gamepadAssignmentCooldown[i] = true;
                setTimeout(() => delete gamepadAssignmentCooldown[i], 1000);
            }
        }
        
        // --- Clear previous frame's gamepad shoot state ---
        keysPressed['gp_shoot_p1'] = false;
        keysPressed['gp_shoot_p2'] = false;
        
        // Don't process movement/shooting if paused
        if (isGamePaused) return;

        // --- Step 2: Player 1 Input ---
        if (player1GamepadIndex !== null) {
            const pad = pads[player1GamepadIndex];
            if (!pad) { player1GamepadIndex = null; return; } // Disconnected

            // D-Pad Movement
            keysPressed['arrowup'] = pad.buttons[12]?.pressed;
            keysPressed['arrowdown'] = pad.buttons[13]?.pressed;
            keysPressed['arrowleft'] = pad.buttons[14]?.pressed;
            keysPressed['arrowright'] = pad.buttons[15]?.pressed;

            // Shooting (Autofire)
            const shootPressedNow = FACE_BUTTON_INDICES.some(index => pad.buttons[index]?.pressed);
            keysPressed['gp_shoot_p1'] = shootPressedNow;
        }

        // --- Step 3: Player 2 Input ---
        if (player2GamepadIndex !== null) {
            const pad = pads[player2GamepadIndex];
            if (!pad) { player2GamepadIndex = null; return; } // Disconnected

            // D-Pad Movement
            keysPressed['w'] = pad.buttons[12]?.pressed;
            keysPressed['s'] = pad.buttons[13]?.pressed;
            keysPressed['a'] = pad.buttons[14]?.pressed;
            keysPressed['d'] = pad.buttons[15]?.pressed;
            
            // Shooting (Autofire)
            const shootPressedNow = FACE_BUTTON_INDICES.some(index => pad.buttons[index]?.pressed);
            keysPressed['gp_shoot_p2'] = shootPressedNow;
        }
    }

    // --- GAMEPAD CONNECTION LISTENERS ---
    window.addEventListener("gamepadconnected", (e) => {
        console.log(`Gamepad connected at index ${e.gamepad.index}: ${e.gamepad.id}. Press a face button to assign.`);
    });
    window.addEventListener("gamepaddisconnected", (e) => {
        console.log(`Gamepad disconnected from index ${e.gamepad.index}: ${e.gamepad.id}.`);
        if (player1GamepadIndex === e.gamepad.index) {
            console.log("Player 1 gamepad disconnected.");
            player1GamepadIndex = null;
        }
        if (player2GamepadIndex === e.gamepad.index) {
            console.log("Player 2 gamepad disconnected.");
            player2GamepadIndex = null;
        }
    });


    // --- Classes ---
    class Car {
        constructor(transformedImageCanvas, screenWidth, screenHeight) { if (!transformedImageCanvas || !transformedImageCanvas.canvas) { console.error("Car constructor invalid image data:", transformedImageCanvas); const ph = document.createElement('canvas'); ph.width = 30; ph.height = 15; this.transformedImage = { canvas: ph, width: 30, height: 15 }; } else { this.transformedImage = transformedImageCanvas; } this.width = this.transformedImage.width; this.height = this.transformedImage.height; this.x = 0; this.y = 0; this.screenWidth = screenWidth; this.screenHeight = screenHeight; }
        getRect() { if (typeof this.x !== 'number' || typeof this.y !== 'number' || typeof this.width !== 'number' || typeof this.height !== 'number') { console.warn("Car getRect invalid props:", this); return { x: 0, y: 0, width: 1, height: 1 }; } return { x: this.x, y: this.y, width: this.width, height: this.height }; }
        move(dx, dy) { this.x += dx; this.y += dy; }
        clampToScreen() { if (this.x < 0) this.x = 0; if (this.x + this.width > this.screenWidth) this.x = this.screenWidth - this.width; if (this.y < 0) this.y = 0; if (this.y + this.height > this.screenHeight) this.y = this.screenHeight - this.height; }
        draw(ctx) { if (this.transformedImage && this.transformedImage.canvas && this.transformedImage.canvas.width > 0) { ctx.drawImage(this.transformedImage.canvas, this.x, this.y); } else { console.warn("Attempt draw car invalid image", this); ctx.fillStyle = 'magenta'; ctx.fillRect(this.x, this.y, 30, 15); } }
    }
    class OtherCar extends Car { constructor(transformedImageCanvas, screenWidth, screenHeight, playerCar1, playerCar2) { super(transformedImageCanvas, screenWidth, screenHeight); this.x = screenWidth + getRandomInt(50, 400); this.y = getRandomInt(0, screenHeight - this.height); this.playerCar1 = playerCar1; this.playerCar2 = playerCar2; this.counted = false; this.lastCollisionTimePlayer1 = 0; this.lastCollisionTimePlayer2 = 0; this.id = Math.random(); this.stuckTime = 0; this.lastPosition = { x: this.x, y: this.y }; this.stuckCheckCounter = 0; this.isExiting = false; } moveLeft(speed) { this.lastPosition = { x: this.x, y: this.y }; this.x -= speed; if (!this.isExiting && this.x < 1) { this.isExiting = true; } this.stuckCheckCounter++; if (this.stuckCheckCounter > 10) { this.stuckCheckCounter = 0; if (Math.abs(this.x - this.lastPosition.x) < 1 && Math.abs(this.y - this.lastPosition.y) < 1) { this.stuckTime++; } else { this.stuckTime = 0; } if (this.stuckTime > 3) { if (!this.isExiting) { this.y += getRandomInt(-15, 15); if (this.x > 20) { this.x += getRandomInt(5, 15); } this.clampToScreen(); this.lastPosition = { x: this.x, y: this.y }; } this.stuckTime = 0; } } } draw(ctx) { super.draw(ctx); } }
    class Bullet { constructor(x, y, speed) { this.x = x; this.y = y; this.speed = speed; this.width = 10; this.height = 5; this.color = 'red'; this.id = Math.random(); } getRect() { return { x: this.x, y: this.y, width: this.width, height: this.height }; } update() { this.x += this.speed; } draw(ctx) { ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.width, this.height); } }
    class RoadMarking { constructor(initialX, positionY, screenWidth) { this.screenWidth = screenWidth; this.width = 80; this.height = 10; this.color = 'white'; this.x = initialX; this.y = positionY; } moveLeft(speed) { this.x -= speed; if (this.x + this.width < 0) { this.x += this.screenWidth * 1.5 + Math.random() * 200; } } draw(ctx) { ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.width, this.height); } }
    class Game {
        constructor(screenWidth, screenHeight, carSpeed, otherCarSpeed, player1ImgData, player2ImgData, enemyImagesData) {
            this.screenWidth = screenWidth; this.screenHeight = screenHeight; this.carSpeed = carSpeed; this.otherCarSpeed = otherCarSpeed;
            this.playerCar1 = new Car(player1ImgData, screenWidth, screenHeight); this.playerCar2 = new Car(player2ImgData, screenWidth, screenHeight);
            this.playerCar1.x = 100; this.playerCar1.y = screenHeight / 2 - player1ImgData.height - 20; this.playerCar2.x = 100; this.playerCar2.y = screenHeight / 2 + 20;
            this.enemyImagesData = enemyImagesData; this.availableEnemyImageData = [...this.enemyImagesData]; this.otherCars = [];
            this.bulletsCar1 = []; this.bulletsCar2 = []; this.maxBullets = 45; this.lastShotTimeCar1 = 0; this.lastShotTimeCar2 = 0; this.shotCooldown = 150;
            this.carsRemovedByCar1 = 0; this.carsRemovedByCar2 = 0; this.carsOutOfScreen = 0; this.player1CollisionCount = 0; this.player2CollisionCount = 0; this.collisionCooldown = 150;
            this.startTime = performance.now(); this.frameCount = 0; this.fps = 0; this.lastFpsUpdate = performance.now();
            this.lastOtherCarLoadTime = 0; this.otherCarLoadInterval = 200;
            this.roadMarkings = []; this.setupRoadMarkings();
        }
        setupRoadMarkings() { const numLanes = 5; const laneHeight = this.screenHeight / numLanes; const markingSpacing = 250; const markingsPerScreenRoughly = Math.ceil(this.screenWidth / markingSpacing) + 4; for (let i = 0; i < numLanes; i++) { const laneY = (i * laneHeight) + (laneHeight / 2) - 5; for (let j = 0; j < markingsPerScreenRoughly; j++) { const initialX = (j * markingSpacing) - (markingSpacing * 2); this.roadMarkings.push(new RoadMarking(initialX, laneY, this.screenWidth)); } } }
        updateFpsCounter(now) { this.frameCount++; const elapsed = now - this.lastFpsUpdate; if (elapsed >= 1000) { this.fps = (this.frameCount * 1000) / elapsed; this.frameCount = 0; this.lastFpsUpdate = now; } }
        loadNewCars() { const now = performance.now(); if (now - this.lastOtherCarLoadTime < this.otherCarLoadInterval) return; this.lastOtherCarLoadTime = now; const currentCarCount = this.otherCars.length; if (currentCarCount >= MAX_CARS) return; if (this.availableEnemyImageData.length === 0) { if (this.enemyImagesData.length > 0) { this.availableEnemyImageData = [...this.enemyImagesData]; } else { return; } } if (this.availableEnemyImageData.length === 0) return; const availableSlots = MAX_CARS - currentCarCount; const numToAdd = Math.min(availableSlots, 2, this.availableEnemyImageData.length); for (let i = 0; i < numToAdd; i++) { if (this.availableEnemyImageData.length === 0) { if (this.enemyImagesData.length > 0) { this.availableEnemyImageData = [...this.enemyImagesData]; } else { break; } } if (this.availableEnemyImageData.length === 0) break; const randomIndex = Math.floor(Math.random() * this.availableEnemyImageData.length); const selectedImageData = this.availableEnemyImageData.splice(randomIndex, 1)[0]; if (selectedImageData) { const newCar = new OtherCar(selectedImageData, this.screenWidth, this.screenHeight, this.playerCar1, this.playerCar2); let spawnCollision = false; const newCarRect = newCar.getRect(); const spawnBuffer = 10; if (checkCollision(newCarRect, this.playerCar1.getRect()) || checkCollision(newCarRect, this.playerCar2.getRect())) { spawnCollision = true; } else { for (const other of this.otherCars) { const otherRect = other.getRect(); const bufferedOtherRect = { x: otherRect.x - spawnBuffer, y: otherRect.y - spawnBuffer, width: otherRect.width + spawnBuffer * 2, height: otherRect.height + spawnBuffer * 2 }; if (checkCollision(newCarRect, bufferedOtherRect)) { spawnCollision = true; break; } } } if (!spawnCollision) { this.otherCars.push(newCar); } else { this.availableEnemyImageData.push(selectedImageData); } } } }
        handlePlayerInput() {
            const now = performance.now();
            // Player 1
            let moveX1 = 0, moveY1 = 0;
            if (keysPressed['arrowleft']) moveX1 -= this.carSpeed;
            if (keysPressed['arrowright']) moveX1 += this.carSpeed;
            if (keysPressed['arrowup']) moveY1 -= this.carSpeed;
            if (keysPressed['arrowdown']) moveY1 += this.carSpeed;
            this.playerCar1.move(moveX1, moveY1);
            this.playerCar1.clampToScreen();

            if ((keysPressed[' '] || keysPressed['gp_shoot_p1']) && this.bulletsCar1.length < this.maxBullets) {
                if (now - this.lastShotTimeCar1 > this.shotCooldown) {
                    const bullet = new Bullet(this.playerCar1.x + this.playerCar1.width, this.playerCar1.y + this.playerCar1.height / 2 - 2.5, 20);
                    this.bulletsCar1.push(bullet);
                    this.lastShotTimeCar1 = now;
                }
            }
            // Player 2
            let moveX2 = 0, moveY2 = 0;
            if (keysPressed['a']) moveX2 -= this.carSpeed;
            if (keysPressed['d']) moveX2 += this.carSpeed;
            if (keysPressed['w']) moveY2 -= this.carSpeed;
            if (keysPressed['s']) moveY2 += this.carSpeed;
            this.playerCar2.move(moveX2, moveY2);
            this.playerCar2.clampToScreen();
            
            if ((keysPressed['f'] || keysPressed['gp_shoot_p2']) && this.bulletsCar2.length < this.maxBullets) {
                if (now - this.lastShotTimeCar2 > this.shotCooldown) {
                    const bullet = new Bullet(this.playerCar2.x + this.playerCar2.width, this.playerCar2.y + this.playerCar2.height / 2 - 2.5, 20);
                    this.bulletsCar2.push(bullet);
                    this.lastShotTimeCar2 = now;
                }
            }

            // Reset game
            if (keysPressed['r']) { this.playerCar1.x = 100; this.playerCar1.y = this.screenHeight / 2 - this.playerCar1.height - 20; this.playerCar2.x = 100; this.playerCar2.y = this.screenHeight / 2 + 20; this.bulletsCar1 = []; this.bulletsCar2 = []; }
        }
        moveOtherCars() { let newlyOffScreenCount = 0; const carIndicesToRemove = new Set(); this.otherCars.forEach((car, index) => { car.moveLeft(this.otherCarSpeed); if (car.x + car.width < 0) { if (!car.counted) { car.counted = true; newlyOffScreenCount++; } carIndicesToRemove.add(index); } }); if (newlyOffScreenCount > 0) { this.carsOutOfScreen += newlyOffScreenCount; } if (carIndicesToRemove.size > 0) { this.otherCars = this.otherCars.filter((_, index) => !carIndicesToRemove.has(index)); } }
        separateCars(obj1, obj2) { if (obj1 instanceof OtherCar && obj2 instanceof OtherCar && (obj1.isExiting || obj2.isExiting)) { return; } const rect1 = obj1.getRect(); const rect2 = obj2.getRect(); if (!rect1 || !rect2) return; const dx = (rect1.x + rect1.width / 2) - (rect2.x + rect2.width / 2); const dy = (rect1.y + rect1.height / 2) - (rect2.y + rect2.height / 2); const combinedHalfWidths = rect1.width / 2 + rect2.width / 2; const combinedHalfHeights = rect1.height / 2 + rect2.height / 2; if (Math.abs(dx) < combinedHalfWidths && Math.abs(dy) < combinedHalfHeights) { const overlapX = combinedHalfWidths - Math.abs(dx); const overlapY = combinedHalfHeights - Math.abs(dy); const separationFactor = 0.6; let moveX = 0, moveY = 0; if (overlapX < overlapY) { moveX = (overlapX / 2) * separationFactor * Math.sign(dx); if (Math.abs(dx) < 5) moveY = (Math.random() - 0.5) * 4; } else { moveY = (overlapY / 2) * separationFactor * Math.sign(dy); if (Math.abs(dy) < 5) moveX = (Math.random() - 0.5) * 4; } const obj1IsExitingEnemy = (obj1 instanceof OtherCar && obj1.isExiting); const obj2IsExitingEnemy = (obj2 instanceof OtherCar && obj2.isExiting); if (obj1IsExitingEnemy) { obj2.x -= moveX * 2; obj2.y -= moveY * 2; } else if (obj2IsExitingEnemy) { obj1.x += moveX * 2; obj1.y += moveY * 2; } else { obj1.x += moveX; obj1.y += moveY; obj2.x -= moveX; obj2.y -= moveY; } if (obj1 === this.playerCar1 || obj1 === this.playerCar2) { if (typeof obj1.clampToScreen === 'function') obj1.clampToScreen(); } if (obj2 === this.playerCar1 || obj2 === this.playerCar2) { if (typeof obj2.clampToScreen === 'function') obj2.clampToScreen(); } if (obj1 instanceof OtherCar && !obj1.isExiting && typeof obj1.clampToScreen === 'function') { obj1.clampToScreen(); } if (obj2 instanceof OtherCar && !obj2.isExiting && typeof obj2.clampToScreen === 'function') { obj2.clampToScreen(); } } }
        checkCollisions() { const now = performance.now(); this.otherCars.forEach(otherCar => { if (checkCollision(this.playerCar1.getRect(), otherCar.getRect())) { if (now - otherCar.lastCollisionTimePlayer1 > this.collisionCooldown) { this.player1CollisionCount++; otherCar.lastCollisionTimePlayer1 = now; } this.separateCars(this.playerCar1, otherCar); } if (checkCollision(this.playerCar2.getRect(), otherCar.getRect())) { if (now - otherCar.lastCollisionTimePlayer2 > this.collisionCooldown) { this.player2CollisionCount++; otherCar.lastCollisionTimePlayer2 = now; } this.separateCars(this.playerCar2, otherCar); } }); if (checkCollision(this.playerCar1.getRect(), this.playerCar2.getRect())) { this.separateCars(this.playerCar1, this.playerCar2); } for (let i = 0; i < this.otherCars.length; i++) { for (let j = i + 1; j < this.otherCars.length; j++) { const carI = this.otherCars[i]; const carJ = this.otherCars[j]; const dy = Math.abs((carI.y + carI.height / 2) - (carJ.y + carJ.height / 2)); if (dy < (carI.height + carJ.height)) { if (checkCollision(carI.getRect(), carJ.getRect())) { this.separateCars(carI, carJ); } } } } }
        checkBulletCollisions() { const bulletsToRemoveCar1 = new Set(); const bulletsToRemoveCar2 = new Set(); const carIndicesToRemove = new Set(); this.bulletsCar1.forEach((bullet, bulletIndex) => { bullet.update(); if (bullet.x > this.screenWidth) { bulletsToRemoveCar1.add(bulletIndex); } else { this.otherCars.forEach((car, carIndex) => { if (!carIndicesToRemove.has(carIndex) && !car.isExiting && checkCollision(bullet.getRect(), car.getRect())) { bulletsToRemoveCar1.add(bulletIndex); carIndicesToRemove.add(carIndex); this.carsRemovedByCar1++; return; } }); } }); this.bulletsCar2.forEach((bullet, bulletIndex) => { bullet.update(); if (bullet.x > this.screenWidth) { bulletsToRemoveCar2.add(bulletIndex); } else { this.otherCars.forEach((car, carIndex) => { if (!carIndicesToRemove.has(carIndex) && !car.isExiting && checkCollision(bullet.getRect(), car.getRect())) { bulletsToRemoveCar2.add(bulletIndex); carIndicesToRemove.add(carIndex); this.carsRemovedByCar2++; return; } }); } }); if (bulletsToRemoveCar1.size > 0) { this.bulletsCar1 = this.bulletsCar1.filter((_, index) => !bulletsToRemoveCar1.has(index)); } if (bulletsToRemoveCar2.size > 0) { this.bulletsCar2 = this.bulletsCar2.filter((_, index) => !bulletsToRemoveCar2.has(index)); } if (carIndicesToRemove.size > 0) { this.otherCars = this.otherCars.filter((_, index) => !carIndicesToRemove.has(index)); } }
        drawText(text, x, y, color = 'white', bgColor = 'rgba(0, 0, 0, 0.6)') { ctx.font = '20px Arial'; const textMetrics = ctx.measureText(text); const textWidth = textMetrics.width; const textHeight = parseInt(ctx.font, 10) * 1.2; ctx.fillStyle = bgColor; ctx.fillRect(x - 5, y - textHeight + 5, textWidth + 10, textHeight + 4); ctx.fillStyle = color; ctx.fillText(text, x, y); }
        draw() { ctx.fillStyle = '#3333AA'; ctx.fillRect(0, 0, this.screenWidth, this.screenHeight); this.roadMarkings.forEach(marking => marking.draw(ctx)); this.otherCars.forEach(car => car.draw(ctx)); this.playerCar1.draw(ctx); this.playerCar2.draw(ctx); this.bulletsCar1.forEach(bullet => bullet.draw(ctx)); this.bulletsCar2.forEach(bullet => bullet.draw(ctx)); const now = performance.now(); const timePlayedSeconds = Math.floor((now - this.startTime) / 1000); const hours = Math.floor(timePlayedSeconds / 3600); const minutes = Math.floor((timePlayedSeconds % 3600) / 60); const seconds = timePlayedSeconds % 60; this.updateFpsCounter(now); let yPos = 30; const lineH = 28; this.drawText(`Time: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`, 10, yPos); yPos += lineH; this.drawText(`P1 Hits: ${this.carsRemovedByCar1}`, 10, yPos); yPos += lineH; this.drawText(`P2 Hits: ${this.carsRemovedByCar2}`, 10, yPos); yPos += lineH; this.drawText(`Cars Offscreen: ${this.carsOutOfScreen}`, 10, yPos); yPos += lineH; this.drawText(`Cars On Screen: ${this.otherCars.length} / ${MAX_CARS}`, 10, yPos); yPos += lineH; this.drawText(`P1 Collisions: ${this.player1CollisionCount}`, 10, yPos); yPos += lineH; this.drawText(`P2 Collisions: ${this.player2CollisionCount}`, 10, yPos); yPos += lineH; this.drawText(`FPS: ${this.fps.toFixed(1)}`, 10, yPos); yPos += lineH; this.drawText(`P1 Bullets: ${this.bulletsCar1.length}`, 10, yPos); yPos += lineH; this.drawText(`P2 Bullets: ${this.bulletsCar2.length}`, 10, yPos); yPos += lineH; }
        update() { this.handlePlayerInput(); this.moveOtherCars(); this.roadMarkings.forEach(m => m.moveLeft(this.otherCarSpeed * 1.2)); this.checkCollisions(); this.checkBulletCollisions(); this.loadNewCars(); }
        gameLoop(timestamp) {
            // Poll gamepad state every frame, even when paused.
            pollGamepads();

            // If the game is paused, skip the update and draw loops.
            if (isGamePaused) {
                requestAnimationFrame(this.gameLoop.bind(this)); // Keep the loop alive
                return;
            }

            this.update();
            this.draw();
            requestAnimationFrame(this.gameLoop.bind(this));
        }
        start() { console.log("Starting game loop..."); if (!this.playerCar1 || !this.playerCar2 || !this.enemyImagesData) { console.error("Cannot start game, assets missing."); alert("Error: Game assets not loaded."); return; } this.startTime = performance.now(); this.lastFpsUpdate = this.startTime; requestAnimationFrame(this.gameLoop.bind(this)); }
    }

    // --- Game Initialization and Start ---
    console.log("DOM loaded. Starting image loading...");
    const potentialImagePaths = []; for (let i = 1; i <= MAX_IMAGES_TO_CHECK; i++) { const filename = i.toString().padStart(FILENAME_PADDING, '0') + IMAGE_EXTENSION; potentialImagePaths.push(`${IMAGE_FOLDER}/${filename}`); } console.log(`Probing for up to ${MAX_IMAGES_TO_CHECK} images...`);
    Promise.allSettled(potentialImagePaths.map(loadImage))
        .then(results => { console.log("Image loading probe finished."); const successfullyLoaded = []; results.forEach((result, index) => { if (result.status === 'fulfilled') { successfullyLoaded.push({ path: potentialImagePaths[index], image: result.value }); } });
            if (successfullyLoaded.length < 2) { console.error(`Error: Loaded only ${successfullyLoaded.length} images, need >= 2.`); alert(`Error: Loaded only ${successfullyLoaded.length} images from '${IMAGE_FOLDER}'. Need >= 2.`); return; } console.log(`Successfully loaded ${successfullyLoaded.length} images.`);
            successfullyLoaded.forEach(item => { loadedImages[item.path] = item.image; }); let availableImagePaths = successfullyLoaded.map(item => item.path); shuffleArray(availableImagePaths); const player1Path = availableImagePaths.pop(); const player2Path = availableImagePaths.pop(); const enemyImagePaths = availableImagePaths; console.log(`P1 uses: ${player1Path}`); console.log(`P2 uses: ${player2Path}`); console.log(`${enemyImagePaths.length} images for enemies.`);
            const player1Original = loadedImages[player1Path]; const player2Original = loadedImages[player2Path]; if (!player1Original || !player2Original) { throw new Error("Failed to get loaded player images."); } const player1TransformedData = createTransformedImage(player1Original, IMAGE_SCALE, PLAYER_CAR_ROTATION_DEGREES); const player2TransformedData = createTransformedImage(player2Original, IMAGE_SCALE, PLAYER_CAR_ROTATION_DEGREES);
            const enemyTransformedData = enemyImagePaths.map(path => loadedImages[path]).filter(img => img && img.width > 0 && img.height > 0).map(img => createTransformedImage(img, IMAGE_SCALE, OTHER_CAR_ROTATION_DEGREES)).filter(data => data && data.canvas && data.width > 0);
            if (!player1TransformedData || !player2TransformedData || !player1TransformedData.canvas || !player2TransformedData.canvas) { throw new Error("Failed to create transformed player images."); } if (enemyTransformedData.length === 0 && enemyImagePaths.length > 0) { console.warn("Some enemy images failed transformation."); } if (enemyTransformedData.length === 0 && successfullyLoaded.length >= 2) { console.warn("No valid enemy images available."); }
            console.log("Creating Game instance..."); const game = new Game(SCREEN_WIDTH, SCREEN_HEIGHT, CAR_SPEED, OTHER_CAR_SPEED, player1TransformedData, player2TransformedData, enemyTransformedData); game.start();
        })
        .catch(error => { console.error("Error during game initialization:", error); alert(`Game setup error: ${error.message}.`); });

}); // End DOMContentLoaded listener
