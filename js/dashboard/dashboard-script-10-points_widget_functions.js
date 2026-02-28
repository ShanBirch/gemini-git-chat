// ==========================================
// POINTS WIDGET FUNCTIONS
// ==========================================

const POINTS_FOR_FREE_WEEK = 200;
const MAX_LEVEL = 99;
const LEVEL_CURVE_MULTIPLIER = 0.07;
const LEVEL_CURVE_EXPONENT = 2.4;
const LEVEL_LINEAR_BONUS = 0.7;

// Calculate points required for a given level
function getPointsForLevel(level) {
    if (level <= 1) return 0;
    return Math.floor(LEVEL_CURVE_MULTIPLIER * Math.pow(level, LEVEL_CURVE_EXPONENT) + LEVEL_LINEAR_BONUS * level);
}

// Calculate user's current level from lifetime points
function calculateLevel(lifetimePoints) {
    let level = 1;

    while (level < MAX_LEVEL) {
        const pointsNeeded = getPointsForLevel(level + 1);
        if (lifetimePoints < pointsNeeded) break;
        level++;
    }

    const currentLevelPoints = getPointsForLevel(level);
    const nextLevelPoints = level < MAX_LEVEL ? getPointsForLevel(level + 1) : currentLevelPoints;
    const pointsIntoLevel = lifetimePoints - currentLevelPoints;
    const pointsNeededForNext = nextLevelPoints - currentLevelPoints;
    const progress = level >= MAX_LEVEL ? 100 : Math.min(100, Math.floor((pointsIntoLevel / pointsNeededForNext) * 100));

    return {
        level,
        currentLevelPoints,
        nextLevelPoints,
        pointsIntoLevel,
        pointsNeededForNext,
        progress,
        isMaxLevel: level >= MAX_LEVEL
    };
}

// Get level title based on level
function getLevelTitle(level) {
    if (level >= 99) return 'Legend';
    if (level >= 90) return 'Master';
    if (level >= 80) return 'Champion';
    if (level >= 70) return 'Expert';
    if (level >= 60) return 'Veteran';
    if (level >= 50) return 'Dedicated';
    if (level >= 40) return 'Committed';
    if (level >= 30) return 'Consistent';
    if (level >= 20) return 'Growing';
    if (level >= 10) return 'Rising';
    if (level >= 5) return 'Beginner';
    return 'Newcomer';
}

// Load and display user's points data
async function loadPointsWidget() {
    // Always show the widget (even with default values)
    const widget = document.getElementById('points-widget');
    if (widget) {
        widget.style.display = 'block';
    }

    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) {
            console.log('No user session, skipping points update to preserve cached level');
            return;
        }

        const userId = window.currentUser.id;

        // Try to get points data, fall back to defaults if table doesn't exist
        let pointsData = { current_points: 0, current_streak: 0 };
        try {
            const data = await window.db?.points?.getPoints(userId);
            if (data) {
                pointsData = data;
            }
        } catch (dbError) {
            console.log('Points table not set up yet, using defaults');
        }

        // Update points display
        updatePointsDisplay(pointsData);

    } catch (error) {
        console.error('Error loading points widget:', error);
        // Don't call updatePointsDisplay with zeroed-out defaults here;
        // it would reset level to 1 and overwrite the localStorage cache.
    }
}

// Expose to window for other scripts (stories.js) to refresh points
window.loadUserPoints = loadPointsWidget;
// Alias for learning-inline.js and other scripts that call refreshLevelDisplay
window.refreshLevelDisplay = loadPointsWidget;

// Update points display with current data
function updatePointsDisplay(pointsData) {
    const currentPoints = pointsData.current_points || 0;
    const lifetimePoints = pointsData.lifetime_points || 0;
    const currentStreak = pointsData.current_streak || 0;

    // Calculate level from lifetime points
    const levelData = calculateLevel(lifetimePoints);

    // Only update level-related UI when we have real data.
    // When lifetime_points is missing (0) but a cached level exists,
    // skip overwriting to prevent resetting a high-level user to level 1.
    const hasRealLevelData = lifetimePoints > 0 || !parseInt(localStorage.getItem('fitgotchi_level'));

    if (hasRealLevelData) {
        // Update level display
        const levelEl = document.getElementById('level-current');
        if (levelEl) {
            levelEl.textContent = levelData.level;
        }

        // Update SVG level ring progress (circumference = 2 * PI * 45 ≈ 283)
        const levelRingSvg = document.getElementById('level-ring-svg');
        if (levelRingSvg) {
            const circumference = 283;
            const offset = circumference - (levelData.progress / 100) * circumference;
            levelRingSvg.style.strokeDashoffset = offset;
        }

        // Update level title
        const levelTitleEl = document.getElementById('level-title');
        if (levelTitleEl) {
            levelTitleEl.textContent = getLevelTitle(levelData.level);
        }

        // Update level progress bar
        const levelProgressFill = document.getElementById('level-progress-fill');
        if (levelProgressFill) {
            levelProgressFill.style.width = `${levelData.progress}%`;
        }

        // Update level progress label
        const levelProgressLabel = document.getElementById('level-progress-label');
        if (levelProgressLabel) {
            if (levelData.isMaxLevel) {
                levelProgressLabel.textContent = 'MAX LEVEL - Legend!';
            } else {
                const xpToNext = levelData.pointsNeededForNext - levelData.pointsIntoLevel;
                levelProgressLabel.textContent = `${xpToNext} XP to Level ${levelData.level + 1}`;
            }
        }
    }

    // Update points number
    const pointsEl = document.getElementById('points-current');
    if (pointsEl) {
        pointsEl.textContent = currentPoints.toLocaleString();
    }

    // Update streak
    const streakEl = document.getElementById('streak-current');
    if (streakEl) {
        streakEl.textContent = currentStreak;
    }

    // Update progress bar
    const progressPercent = Math.min(100, (currentPoints / POINTS_FOR_FREE_WEEK) * 100);
    const progressFill = document.getElementById('points-progress-fill');
    if (progressFill) {
        progressFill.style.width = `${progressPercent}%`;
    }

    // Update progress label
    const progressLabel = document.getElementById('points-progress-label');
    if (progressLabel) {
        const remaining = POINTS_FOR_FREE_WEEK - currentPoints;
        if (currentPoints >= POINTS_FOR_FREE_WEEK) {
            progressLabel.textContent = 'Ready to redeem a free week!';
        } else {
            progressLabel.textContent = `${currentPoints}/${POINTS_FOR_FREE_WEEK} to free week`;
        }
    }

    // UPDATE FITGOTCHI WIDGET
    if (typeof window.updateFitGotchi === 'function') {
        window.updateFitGotchi(pointsData);
    }
}

// Redeem points for free week
async function redeemPointsForFreeWeek() {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) {
            alert('Please log in to redeem points');
            return;
        }

        const redeemBtn = document.getElementById('redeem-btn');
        if (redeemBtn) {
            redeemBtn.disabled = true;
            redeemBtn.textContent = 'Redeeming...';
        }

        const result = await window.db?.points?.redeemPoints(window.currentUser.id);

        if (result?.success) {
            showMilestoneToast({
                label: 'Free Week Unlocked!',
                points: -POINTS_FOR_FREE_WEEK
            });

            // Refresh points display
            await loadPointsWidget();

            alert(`Congratulations! You've earned 7 free days!\n\nYour subscription has been extended.`);
        } else {
            alert(result?.message || 'Could not redeem points. Please try again.');
            // Re-enable button
            if (redeemBtn) {
                redeemBtn.disabled = false;
                redeemBtn.textContent = 'Redeem Free Week!';
            }
        }
    } catch (error) {
        console.error('Error redeeming points:', error);
        alert('An error occurred. Please try again.');
    }
}

// Show milestone achievement toast
function showMilestoneToast(milestone) {
    const toast = document.createElement('div');
    toast.className = 'milestone-toast';
    toast.innerHTML = `
        <div class="milestone-icon">&#x1F389;</div>
        <div>
            <div class="milestone-title">${milestone.label}</div>
            ${milestone.points > 0 ? `<div class="milestone-points">+${milestone.points} points</div>` : ''}
        </div>
    `;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Show points earned toast
function showPointsEarnedToast(points, bonusPoints = 0, streak = 0) {
    const toast = document.createElement('div');
    toast.className = 'points-earned-toast';
    toast.innerHTML = `
        <div class="points-earned-main">+${points} pt${points > 1 ? 's' : ''}</div>
        ${bonusPoints > 0 ? `<div class="points-earned-bonus">+${bonusPoints} streak bonus!</div>` : ''}
        ${streak > 0 ? `<div class="points-earned-streak">&#x1F525; ${streak}</div>` : ''}
    `;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Play level-up sound effect using Web Audio API
function playLevelUpSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // Create a celebratory ascending arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        const noteDuration = 0.15;

        notes.forEach((freq, index) => {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + index * noteDuration);

            // Envelope
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime + index * noteDuration);
            gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + index * noteDuration + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + index * noteDuration + noteDuration);

            oscillator.start(audioCtx.currentTime + index * noteDuration);
            oscillator.stop(audioCtx.currentTime + index * noteDuration + noteDuration);
        });

        // Final triumphant chord
        const chordDelay = notes.length * noteDuration;
        const chordFreqs = [523.25, 659.25, 783.99]; // C major chord
        chordFreqs.forEach(freq => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + chordDelay);
            gain.gain.setValueAtTime(0, audioCtx.currentTime + chordDelay);
            gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + chordDelay + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + chordDelay + 0.5);
            osc.start(audioCtx.currentTime + chordDelay);
            osc.stop(audioCtx.currentTime + chordDelay + 0.5);
        });
    } catch (e) {
        console.log('Could not play level up sound:', e);
    }
}

// Create expanding glow rings effect
function createGlowRings() {
    const container = document.createElement('div');
    container.className = 'level-up-rings-container';

    for (let i = 0; i < 4; i++) {
        const ring = document.createElement('div');
        ring.className = 'level-up-ring';
        container.appendChild(ring);
    }

    document.body.appendChild(container);

    // Remove after animation completes
    setTimeout(() => container.remove(), 2000);
}

// Trigger victory animation on Shazie
function triggerVictoryAnimation() {
    const mv = document.getElementById('tamagotchi-model');
    if (!mv) return;

    function playVictoryAnim() {
        if (!mv.availableAnimations || !mv.availableAnimations.length) return;

        // Prioritise dance animations for level-up celebrations
        const victoryAnim = mv.availableAnimations.find(a =>
            a === 'dance' ||
            a === 'dance_1'
        ) || mv.availableAnimations.find(a =>
            a === 'clap' ||
            a === 'arms_up_still' ||
            a === 'laugh'
        ) || mv.availableAnimations.find(a =>
            a === 'greet' ||
            a === 'strut' ||
            a === 'warm_up'
        );

        if (victoryAnim) {
            mv.animationName = victoryAnim;
            mv.play();

            // Loop the dance: replay once after the first play to fill the celebration window
            setTimeout(() => {
                if (mv.animationName === victoryAnim) {
                    mv.currentTime = 0;
                    mv.play();
                }
            }, 2500);

            // Return to static stance after celebration
            setTimeout(() => {
                mv.pause();
                mv.currentTime = 0;
                mv.animationName = null;
                mv.removeAttribute('animation-name');
            }, 6000);
        }
    }

    // If model already has animations loaded, play immediately
    if (mv.availableAnimations && mv.availableAnimations.length) {
        playVictoryAnim();
    } else {
        // Wait for model to finish loading before playing animation
        mv.addEventListener('load', function onModelLoad() {
            mv.removeEventListener('load', onModelLoad);
            setTimeout(playVictoryAnim, 200);
        });
    }
}

// Show animation unlock notification
function showAnimationUnlockToast(animInfo) {
    const toast = document.createElement('div');
    toast.className = 'animation-unlock-toast';
    toast.innerHTML = `
        <div class="animation-unlock-icon">${animInfo.icon}</div>
        <div class="animation-unlock-title">New Move Unlocked!</div>
        <div class="animation-unlock-name">${animInfo.displayName}</div>
    `;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Check for newly unlocked animations when leveling up
function checkNewAnimationUnlocks(previousLevel, newLevel) {
    const mv = document.getElementById('tamagotchi-model');
    if (!mv || !mv.availableAnimations) return;

    // Check for milestone unlocks (character skin, battle mode, backgrounds)
    const MILESTONE_UNLOCKS = [
        { level: 5, displayName: 'Newcomer Skin', icon: '🧑', category: 'milestone' },
        { level: 5, displayName: 'Gym Background', icon: '🏋️', category: 'milestone' },
        { level: 10, displayName: 'Battle Mode', icon: '🥊', category: 'milestone' },
        { level: 10, displayName: 'Rising Skin', icon: '💪', category: 'milestone' },
    ];

    const newMilestones = MILESTONE_UNLOCKS.filter(m => previousLevel < m.level && newLevel >= m.level);
    newMilestones.forEach((milestone, index) => {
        setTimeout(() => {
            showAnimationUnlockToast(milestone);
        }, 1500 + (index * 3000));
    });

    // Find animations that were just unlocked
    const newlyUnlocked = ANIMATION_UNLOCKS.filter(unlock => {
        // Was locked before, unlocked now
        const wasLocked = previousLevel < unlock.unlockLevel;
        const isUnlockedNow = newLevel >= unlock.unlockLevel;

        // Check if this animation actually exists in the model
        const existsInModel = mv.availableAnimations.some(a =>
            a.toLowerCase() === unlock.name.toLowerCase()
        );

        return wasLocked && isUnlockedNow && existsInModel;
    });

    // Show unlock toasts with delay between each (after milestones)
    const milestoneDelay = newMilestones.length * 3000 + 1500;
    newlyUnlocked.forEach((unlock, index) => {
        setTimeout(() => {
            showAnimationUnlockToast(unlock);
        }, milestoneDelay + (index * 3500));
    });
}

// Trigger XP bar rainbow flash
function triggerXPBarRainbow() {
    const xpBar = document.getElementById('tamagotchi-xp-bar');
    if (xpBar) {
        xpBar.classList.add('xp-bar-rainbow');
        setTimeout(() => xpBar.classList.remove('xp-bar-rainbow'), 1500);
    }
}

/**
 * NEW LEVEL UP CELEBRATION SYSTEM
 * Shows celebration directly in the Tamagotchi widget instead of as a popup toast.
 * Auto-navigates to dashboard, plays dance animation, and animates the XP bar.
 * Persists pending celebration to localStorage so it survives page reloads.
 */
function triggerLevelUpCelebration(newLevel, title, previousLevel = null, lifetimePoints = 0, currentStreak = 0, previousProgress = 0) {
    if (window.isAdminViewing) return; // Admin view-as is read-only
    console.log('🎉 Level Up Celebration triggered!', { newLevel, title, previousLevel });

    // Persist celebration data so it can be recovered if page reloads mid-flow
    try {
        localStorage.setItem('pendingLevelUpCelebration', JSON.stringify({
            newLevel, title, previousLevel, lifetimePoints, currentStreak, previousProgress,
            timestamp: Date.now()
        }));
    } catch (e) { /* ignore storage errors */ }

    // Get the previous title for rank transition display
    const previousTitle = previousLevel ? getLevelTitle(previousLevel) : null;
    const showRankTransition = previousTitle && previousTitle !== title;

    // Calculate new progress percentage for the new level
    const newLevelData = calculateLevel(lifetimePoints);
    const newProgress = newLevelData.progress || 0;

    // Step 1: Navigate to dashboard if not already there
    if (currentActiveTab !== 'dashboard') {
        // Find the dashboard nav button
        const dashboardBtn = document.querySelector('.bottom-nav .nav-item');
        switchAppTab('dashboard', dashboardBtn);
        // Wait for navigation transition then scroll to top so character is visible
        setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            startCelebrationSequence();
        }, 500);
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        startCelebrationSequence();
    }

    function startCelebrationSequence() {
        const overlay = document.getElementById('tamagotchi-levelup-overlay');
        const banner = document.getElementById('levelup-banner');
        const statsBar = document.getElementById('tamagotchi-stats-bar');
        const xpBar = document.getElementById('tamagotchi-xp-bar');
        const levelDisplay = document.getElementById('tamagotchi-level');
        const rankDisplay = document.getElementById('tamagotchi-rank');
        const xpText = document.getElementById('tamagotchi-xp-text');

        if (!overlay || !banner) {
            console.log('Level up overlay elements not found, falling back to toast');
            showLevelUpToast(newLevel, title, previousLevel, lifetimePoints, currentStreak);
            clearPendingCelebration();
            return;
        }

        // Clear any existing celebration elements
        overlay.innerHTML = '';

        // Step 2: Play sound
        playLevelUpSound();

        // Step 3: Full-screen flash effect for impact
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,215,0,0.4);z-index:9998;pointer-events:none;animation:celebrationFlash 0.6s ease-out forwards;';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 700);

        // Step 4: Activate overlay and add effects
        overlay.classList.add('active');

        // Add burst effect
        const burst = document.createElement('div');
        burst.className = 'levelup-burst';
        overlay.appendChild(burst);

        // Add sparkle particles (more particles for bigger celebration)
        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                const sparkle = document.createElement('div');
                sparkle.className = 'levelup-sparkle';
                sparkle.style.left = `${10 + Math.random() * 80}%`;
                sparkle.style.bottom = `${10 + Math.random() * 40}%`;
                sparkle.style.animationDelay = `${Math.random() * 0.5}s`;
                sparkle.style.animationDuration = `${1.5 + Math.random()}s`;
                overlay.appendChild(sparkle);
            }, i * 40);
        }

        // Add rising stars
        const starPositions = [15, 30, 42, 58, 70, 85];
        starPositions.forEach((pos, i) => {
            setTimeout(() => {
                const star = document.createElement('div');
                star.className = 'levelup-star';
                star.textContent = '⭐';
                star.style.left = `${pos}%`;
                star.style.bottom = '30%';
                star.style.animationDelay = `${i * 0.12}s`;
                overlay.appendChild(star);
            }, 200 + i * 80);
        });

        // Add confetti - first wave
        const confettiColors = ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1', '#FF69B4', '#9B59B6'];
        for (let i = 0; i < 40; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.className = 'levelup-confetti';
                confetti.style.left = `${Math.random() * 100}%`;
                confetti.style.top = '-20px';
                confetti.style.backgroundColor = confettiColors[Math.floor(Math.random() * confettiColors.length)];
                confetti.style.animationDelay = `${Math.random() * 0.5}s`;
                confetti.style.animationDuration = `${2 + Math.random() * 1.5}s`;
                confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
                confetti.style.width = `${6 + Math.random() * 8}px`;
                confetti.style.height = `${6 + Math.random() * 8}px`;
                overlay.appendChild(confetti);
            }, i * 25);
        }

        // Second wave of confetti for sustained celebration
        setTimeout(() => {
            for (let i = 0; i < 25; i++) {
                setTimeout(() => {
                    const confetti = document.createElement('div');
                    confetti.className = 'levelup-confetti';
                    confetti.style.left = `${Math.random() * 100}%`;
                    confetti.style.top = '-20px';
                    confetti.style.backgroundColor = confettiColors[Math.floor(Math.random() * confettiColors.length)];
                    confetti.style.animationDelay = `${Math.random() * 0.3}s`;
                    confetti.style.animationDuration = `${2 + Math.random() * 1.5}s`;
                    confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
                    confetti.style.width = `${6 + Math.random() * 8}px`;
                    confetti.style.height = `${6 + Math.random() * 8}px`;
                    overlay.appendChild(confetti);
                }, i * 30);
            }
        }, 2000);

        // Step 5: Show level-up banner
        setTimeout(() => {
            banner.style.display = 'block';
            // Reset animation by removing and re-adding class
            banner.style.animation = 'none';
            banner.offsetHeight; // Trigger reflow
            banner.style.animation = 'bannerPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';

            // Update banner content
            document.getElementById('levelup-banner-number').textContent = newLevel;

            const rankContainer = document.getElementById('levelup-banner-rank');
            if (showRankTransition) {
                rankContainer.innerHTML = `
                    <div class="levelup-rank-transition">
                        <span class="levelup-rank-old">${previousTitle}</span>
                        <span class="levelup-rank-arrow">→</span>
                        <span class="levelup-rank-new">${title}</span>
                    </div>
                `;
            } else {
                rankContainer.textContent = title;
            }

            // Check for unlocked moves and display in banner
            const unlockedContainer = document.getElementById('levelup-unlocked-container');
            const unlockedIcon = document.getElementById('levelup-unlocked-icon');
            const unlockedText = document.getElementById('levelup-unlocked-text');

            if (unlockedContainer && previousLevel) {
                // Get newly unlocked animations for this level
                const mv = document.getElementById('tamagotchi-model');
                const availableAnims = mv?.availableAnimations || [];

                // Find animations unlocked at exactly this new level
                const newlyUnlocked = (typeof ANIMATION_UNLOCKS !== 'undefined' ? ANIMATION_UNLOCKS : []).filter(unlock => {
                    const wasLocked = previousLevel < unlock.unlockLevel;
                    const isUnlockedNow = newLevel >= unlock.unlockLevel;
                    const existsInModel = availableAnims.some(a =>
                        a.toLowerCase() === unlock.name.toLowerCase()
                    );
                    return wasLocked && isUnlockedNow && existsInModel;
                });

                if (newlyUnlocked.length > 0) {
                    // Show the first unlocked move (or combine if multiple)
                    const firstUnlock = newlyUnlocked[0];
                    unlockedIcon.textContent = firstUnlock.icon || '🎬';

                    if (newlyUnlocked.length === 1) {
                        unlockedText.textContent = firstUnlock.displayName;
                    } else {
                        // Multiple unlocks - show count
                        unlockedText.textContent = `${firstUnlock.displayName} +${newlyUnlocked.length - 1} more`;
                    }

                    unlockedContainer.style.display = 'block';
                    // Reset animation
                    unlockedContainer.style.animation = 'none';
                    unlockedContainer.offsetHeight;
                    unlockedContainer.style.animation = 'unlockSlideIn 0.5s ease-out 0.8s both';
                } else {
                    unlockedContainer.style.display = 'none';
                }
            } else if (unlockedContainer) {
                unlockedContainer.style.display = 'none';
            }
        }, 300);

        // Step 6: Trigger Shazie's celebration dance
        triggerVictoryAnimation();

        // Step 7: Animate XP bar (fill to 100%, then reset to new progress)
        if (xpBar) {
            // Set CSS variables for the animation
            xpBar.style.setProperty('--start-width', `${previousProgress}%`);
            xpBar.style.setProperty('--end-width', `${newProgress}%`);
            xpBar.classList.add('xp-bar-levelup-fill');

            setTimeout(() => {
                xpBar.classList.remove('xp-bar-levelup-fill');
                xpBar.style.width = `${newProgress}%`;
            }, 1600);
        }

        // Step 8: Update level number with animation
        if (levelDisplay) {
            setTimeout(() => {
                levelDisplay.textContent = newLevel;
                levelDisplay.classList.add('level-number-update');
                setTimeout(() => levelDisplay.classList.remove('level-number-update'), 600);
            }, 800);
        }

        // Step 9: Update rank display
        if (rankDisplay) {
            setTimeout(() => {
                rankDisplay.textContent = title.toUpperCase();
            }, 900);
        }

        // Step 10: Update XP text
        if (xpText && newLevelData) {
            setTimeout(() => {
                const pointsIntoLevel = newLevelData.pointsIntoLevel || 0;
                const pointsNeeded = newLevelData.pointsNeededForNext || 1;
                const nextLevel = newLevel + 1;
                xpText.textContent = newLevel >= 99
                    ? 'MAX LEVEL!'
                    : `${pointsIntoLevel} / ${pointsNeeded} XP to Level ${nextLevel}`;
            }, 1000);
        }

        // Step 11: Glow effect on stats bar
        if (statsBar) {
            statsBar.classList.add('stats-bar-celebrating');
            setTimeout(() => statsBar.classList.remove('stats-bar-celebrating'), 3000);
        }

        // Step 12: Check for newly unlocked animations
        if (previousLevel) {
            checkNewAnimationUnlocks(previousLevel, newLevel);
        }

        // Step 13: Auto-share level-up to feed
        shareLevelUpToFeed({
            newLevel: newLevel,
            previousLevel: previousLevel,
            title: title,
            lifetimePoints: lifetimePoints
        });

        // Step 14: Clean up after celebration (6.5 seconds - gives dance time to finish)
        setTimeout(() => {
            overlay.classList.remove('active');
            banner.style.display = 'none';
            banner.style.animation = '';
            overlay.innerHTML = '';
            // Reset unlocked move container
            const unlockedContainer = document.getElementById('levelup-unlocked-container');
            if (unlockedContainer) {
                unlockedContainer.style.display = 'none';
                unlockedContainer.style.animation = '';
            }
            // Clear localStorage flag - celebration completed successfully
            clearPendingCelebration();

            // Step 15: Show stat allocation modal after celebration ends
            // (grantStatPoints is called by the progression system hook, but the
            //  modal display is handled here to ensure correct timing)
            setTimeout(() => {
                if (typeof window.showStatAllocationModal === 'function') {
                    window.showStatAllocationModal();
                }
            }, 800);
        }, 6500);
    }
}

// Clear pending celebration from localStorage
function clearPendingCelebration() {
    try { localStorage.removeItem('pendingLevelUpCelebration'); } catch (e) { /* ignore */ }
}

// Check for and replay any pending celebration that was interrupted (e.g. page reload)
function checkPendingLevelUpCelebration() {
    try {
        const raw = localStorage.getItem('pendingLevelUpCelebration');
        if (!raw) return;
        const data = JSON.parse(raw);
        // Only replay if less than 2 minutes old (prevent stale celebrations)
        if (Date.now() - data.timestamp > 120000) {
            clearPendingCelebration();
            return;
        }
        console.log('🎉 Replaying pending level-up celebration from localStorage');
        clearPendingCelebration(); // Clear first to prevent infinite loop
        triggerLevelUpCelebration(
            data.newLevel,
            data.title,
            data.previousLevel,
            data.lifetimePoints,
            data.currentStreak || 0,
            data.previousProgress || 0
        );
    } catch (e) {
        clearPendingCelebration();
    }
}

// Show level up toast with celebration (legacy - kept as fallback)
function showLevelUpToast(newLevel, title, previousLevel = null, lifetimePoints = 0, currentStreak = 0) {
    // Get the previous title if we have previous level
    const previousTitle = previousLevel ? getLevelTitle(previousLevel) : null;
    const showTitleTransition = previousTitle && previousTitle !== title;

    // Build stats HTML
    const statsHtml = `
        <div class="level-up-stats">
            <div class="level-up-stat">
                <div class="level-up-stat-value">${lifetimePoints}</div>
                <div class="level-up-stat-label">Total XP</div>
            </div>
            <div class="level-up-stat">
                <div class="level-up-stat-value">${newLevel - (previousLevel || newLevel - 1)}</div>
                <div class="level-up-stat-label">Levels Gained</div>
            </div>
            <div class="level-up-stat">
                <div class="level-up-stat-value">${99 - newLevel}</div>
                <div class="level-up-stat-label">To Max</div>
            </div>
        </div>
    `;

    // Build streak bonus HTML if on a streak
    const streakHtml = currentStreak >= 2 ? `
        <div class="level-up-streak-bonus">
            <span>🔥</span> ${currentStreak} Day Streak!
        </div>
    ` : '';

    // Build title transition HTML
    const titleTransitionHtml = showTitleTransition ? `
        <div class="level-up-title-transition">
            <span class="level-up-old-title">${previousTitle}</span>
            <span class="level-up-arrow">→</span>
            <span class="level-up-new-title">${title}</span>
        </div>
    ` : `<div class="level-up-rank">${title}</div>`;

    const toast = document.createElement('div');
    toast.className = 'level-up-toast level-up-toast-enhanced';
    toast.innerHTML = `
        <div class="level-up-glow"></div>
        <div class="level-up-content">
            <div class="level-up-icon">⭐</div>
            <div class="level-up-text">
                <div class="level-up-title">LEVEL UP!</div>
                <div class="level-up-level">Level ${newLevel}</div>
                ${titleTransitionHtml}
                ${streakHtml}
                ${statsHtml}
            </div>
        </div>
    `;

    document.body.appendChild(toast);

    // Trigger all the celebration effects!
    playLevelUpSound();
    createGlowRings();
    triggerVictoryAnimation();
    triggerXPBarRainbow();

    // Auto-share level-up to feed
    shareLevelUpToFeed({
        newLevel: newLevel,
        previousLevel: previousLevel,
        title: title,
        lifetimePoints: lifetimePoints
    });

    // Check for newly unlocked animations
    if (previousLevel) {
        checkNewAnimationUnlocks(previousLevel, newLevel);
    }

    // Add level-up animation to the badge
    const levelBadge = document.getElementById('level-badge');
    if (levelBadge) {
        levelBadge.classList.add('level-up-animation');
        setTimeout(() => levelBadge.classList.remove('level-up-animation'), 600);
    }

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Track previous lifetime points to detect level-ups
let previousLifetimePoints = 0;

// Track current active tab and pending level-ups (only show level-up on home screen)
let currentActiveTab = 'dashboard';
let pendingLevelUp = null; // { level: number, title: string }

// Award points for a meal (called after successful meal logging)
async function awardPointsForMeal(mealLogId, photoTimestamp, aiConfidence, photoHash) {
    console.log('awardPointsForMeal called with:', { mealLogId, photoTimestamp, aiConfidence, photoHash });
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) {
            console.log('No user session for points');
            return null;
        }

        // Get current points to track level before awarding
        let pointsBefore = null;
        try {
            pointsBefore = await window.db?.points?.getPoints(window.currentUser.id);
        } catch (e) {
            console.log('Could not get previous points');
        }
        const previousLevelData = calculateLevel(pointsBefore?.lifetime_points || 0);
        const previousLevel = previousLevelData.level;
        const previousProgress = previousLevelData.progress || 0;

        // Get current time in HH:MM:SS format for meal timing bonus check
        const now = new Date();
        const mealTime = now.toTimeString().split(' ')[0]; // HH:MM:SS

        console.log('Calling window.db.points.awardPoints...');
        const result = await window.db?.points?.awardPoints(
            window.currentUser.id,
            'meal',
            mealLogId,
            { photoTimestamp, aiConfidence, photoHash, mealTime }
        );
        console.log('awardPoints result:', result);

        if (result?.success) {
            // Show points earned toast
            showPointsEarnedToast(
                result.pointsAwarded,
                result.bonusPoints,
                result.currentStreak
            );

            // Show meal timing bonus toast if earned
            if (result.mealOnTime && result.mealTimingBonus > 0) {
                setTimeout(() => {
                    showToast(`On-time meal! +${result.mealTimingBonus} bonus XP`, 'success');
                }, 400);
            }

            // Show milestone toasts
            if (result.milestonesUnlocked?.length > 0) {
                result.milestonesUnlocked.forEach((milestone, index) => {
                    setTimeout(() => showMilestoneToast(milestone), (index + 1) * 500);
                });
            }

            // Check for level-up
            const newLifetimePoints = result.newLifetimePoints || (pointsBefore?.lifetime_points || 0) + (result.pointsAwarded || 0) + (result.bonusPoints || 0);
            const newLevelData = calculateLevel(newLifetimePoints);
            if (newLevelData.level > previousLevel) {
                // Delay level-up celebration to appear after points toast
                const delayMs = (result.milestonesUnlocked?.length || 0) * 500 + 1000;
                setTimeout(() => {
                    // Use new in-Tamagotchi celebration (auto-navigates to dashboard)
                    triggerLevelUpCelebration(
                        newLevelData.level,
                        getLevelTitle(newLevelData.level),
                        previousLevel,
                        newLifetimePoints,
                        result.currentStreak || 0,
                        previousProgress
                    );
                }, delayMs);
            }

            // Refresh points widget
            await loadPointsWidget();

            // Refresh all challenge types (calories, XP, streak, etc.)
            if (typeof refreshChallengeProgress === 'function') {
                refreshChallengeProgress();
            }
        } else if (result?.error) {
            console.log('Points not awarded:', result.reason || result.error);
            // Optionally show a subtle message about why points weren't awarded
        }

        return result;
    } catch (error) {
        console.error('Error awarding points for meal:', error);
        return null;
    }
}

// Claim daily nutrition bonus (2 points for hitting within 20% of cal/macro goals)
async function claimDailyNutritionBonus() {
    // Use popup button if available, fall back to main button
    const btn = document.getElementById('popup-claim-btn') || document.getElementById('daily-log-btn');
    const hint = document.getElementById('popup-claim-hint') || document.getElementById('daily-log-hint');
    if (!btn) return;

    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) {
            if (hint) hint.textContent = 'Please log in to claim your daily bonus.';
            return;
        }

        // Disable button while processing
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.querySelector('span:nth-child(2)').textContent = 'Checking...';

        const today = getLocalDateString();

        // Get current points to track level before awarding
        let pointsBefore = null;
        try {
            pointsBefore = await window.db?.points?.getPoints(window.currentUser.id);
        } catch (e) {
            console.log('Could not get previous points');
        }
        const previousLevelData = calculateLevel(pointsBefore?.lifetime_points || 0);
        const previousLevel = previousLevelData.level;
        const previousProgress = previousLevelData.progress || 0;

        // Call the award-points endpoint with daily_log type
        const response = await fetch('/api/award-points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: window.currentUser.id,
                type: 'daily_log',
                referenceId: `daily_${today}`,
                nutritionDate: today,
                clientDate: getLocalDateString()
            })
        });

        const result = await response.json();

        if (result.success) {
            // Show success state on popup button
            btn.style.background = 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)';
            btn.innerHTML = `
                <span style="font-size: 1.3rem;">&#x1F389;</span>
                <span>Meals Logged for the Day</span>
                <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 20px; font-size: 0.85rem;">+${result.pointsAwarded} pts</span>
            `;
            btn.disabled = true;
            btn.style.opacity = '0.7';
            btn.style.cursor = 'default';
            if (hint) hint.textContent = 'Great job hitting your nutrition goals today!';

            // Also update the main Log button to show claimed state
            setDailyLogButtonClaimed();

            // Show points toast
            showPointsEarnedToast(result.pointsAwarded, result.bonusPoints || 0, result.currentStreak || 0);

            // Check for level-up
            const newLifetimePoints = result.newLifetimePoints || (pointsBefore?.lifetime_points || 0) + (result.pointsAwarded || 0) + (result.bonusPoints || 0);
            const newLevelData = calculateLevel(newLifetimePoints);
            if (newLevelData.level > previousLevel) {
                setTimeout(() => {
                    triggerLevelUpCelebration(
                        newLevelData.level,
                        getLevelTitle(newLevelData.level),
                        previousLevel,
                        newLifetimePoints,
                        result.currentStreak || 0,
                        previousProgress
                    );
                }, 1500);
            }

            // Refresh points widget
            await loadPointsWidget();

            // Refresh all challenge types (calories, XP, streak, etc.)
            if (typeof refreshChallengeProgress === 'function') {
                refreshChallengeProgress();
            }
        } else {
            // Handle specific errors
            btn.style.opacity = '1';
            if (result.error === 'Already claimed') {
                setDailyLogButtonClaimed();
            } else if (result.error === 'Goals not met') {
                btn.style.background = 'linear-gradient(135deg, #6c757d 0%, #495057 100%)';
                btn.style.boxShadow = '0 4px 12px rgba(108, 117, 125, 0.3)';
                btn.innerHTML = `
                    <span style="font-size: 1.3rem;">&#x274C;</span>
                    <span>Goals Not Met Yet</span>
                `;
                if (hint) hint.textContent = result.reason || 'Get closer to your calorie & macro goals, or finish your day without the bonus.';
                // Show "Finish Day Without Bonus" button in popup
                const finishDayBtn = document.getElementById('popup-finish-day-btn');
                const finishHint = document.getElementById('popup-finish-hint');
                if (finishDayBtn) finishDayBtn.style.display = 'flex';
                if (finishHint) finishHint.style.display = 'block';
                // Re-enable claim button after 3 seconds so they can try again
                setTimeout(() => {
                    resetDailyLogButton();
                }, 3000);
            } else if (result.error === 'No meals logged') {
                btn.style.background = 'linear-gradient(135deg, #6c757d 0%, #495057 100%)';
                btn.innerHTML = `
                    <span style="font-size: 1.3rem;">&#x1F37D;</span>
                    <span>Log Meals First</span>
                `;
                if (hint) hint.textContent = result.reason || 'Log at least one meal before claiming your bonus.';
                setTimeout(() => {
                    resetDailyLogButton();
                }, 3000);
            } else {
                btn.innerHTML = `
                    <span style="font-size: 1.3rem;">&#x26A0;</span>
                    <span>Something went wrong</span>
                `;
                if (hint) hint.textContent = result.reason || 'Please try again.';
                setTimeout(() => {
                    resetDailyLogButton();
                }, 3000);
            }
        }
    } catch (error) {
        console.error('Error claiming daily nutrition bonus:', error);
        btn.style.opacity = '1';
        btn.innerHTML = `
            <span style="font-size: 1.3rem;">&#x26A0;</span>
            <span>Error - Try Again</span>
        `;
        setTimeout(() => {
            resetDailyLogButton();
        }, 3000);
    }
}

// Finish day without bonus points (marks all meals as tracked for AI coach)
async function finishDayWithoutBonus() {
    const btn = document.getElementById('popup-finish-day-btn');
    const claimBtn = document.getElementById('popup-claim-btn') || document.getElementById('daily-log-btn');
    const hint = document.getElementById('popup-claim-hint') || document.getElementById('daily-log-hint');
    if (!btn) return;

    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;

        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.querySelector('span').textContent = 'Logging...';

        const today = getLocalDateString();

        const response = await fetch('/api/award-points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: window.currentUser.id,
                type: 'daily_log',
                referenceId: `daily_${today}`,
                nutritionDate: today,
                finishDay: true,
                clientDate: getLocalDateString()
            })
        });

        const result = await response.json();

        if (result.success || result.dayCompleted) {
            // Mark both buttons as day completed (no bonus)
            setDailyLogButtonDayCompleted();
            // Hide the finish day button
            btn.style.display = 'none';
            const finishHint = document.getElementById('popup-finish-hint');
            if (finishHint) finishHint.style.display = 'none';
            // Close the modal and return to nutrition page
            closeDailyScorePopup();
            // Refresh challenge progress (calories challenge counts completed days)
            if (typeof refreshChallengeProgress === 'function') {
                refreshChallengeProgress();
            }
        } else if (result.error === 'Already claimed') {
            setDailyLogButtonClaimed();
            btn.style.display = 'none';
            closeDailyScorePopup();
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.querySelector('span').textContent = 'Log Your Meals for the Day Anyway';
            if (hint) hint.textContent = result.reason || 'Something went wrong. Please try again.';
        }
    } catch (error) {
        console.error('Error finishing day:', error);
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.querySelector('span').textContent = 'Log Your Meals for the Day Anyway';
    }
}

// Set buttons to "Day Completed" state (no bonus earned)
function setDailyLogButtonDayCompleted() {
    const btn = document.getElementById('daily-log-btn');
    const hint = document.getElementById('daily-log-hint');
    if (btn) {
        btn.disabled = true;
        btn.style.background = 'linear-gradient(135deg, #6c757d 0%, #495057 100%)';
        btn.style.opacity = '0.7';
        btn.style.boxShadow = 'none';
        btn.style.cursor = 'default';
        btn.innerHTML = `
            <span style="font-size: 1.3rem;">&#x2705;</span>
            <span>Meals Logged for the Day</span>
        `;
    }
    if (hint) hint.textContent = 'Your meals are tracked for today. Try to hit your macros tomorrow for bonus points!';

    const popupBtn = document.getElementById('popup-claim-btn');
    const popupHint = document.getElementById('popup-claim-hint');
    if (popupBtn) {
        popupBtn.disabled = true;
        popupBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #495057 100%)';
        popupBtn.style.opacity = '0.7';
        popupBtn.style.cursor = 'default';
        popupBtn.innerHTML = `
            <span style="font-size: 1.3rem;">&#x2705;</span>
            <span>Meals Logged for the Day</span>
        `;
    }
    if (popupHint) popupHint.textContent = 'Your meals are tracked for today. Try to hit your macros tomorrow for bonus points!';

    // Hide finish day button
    const finishDayBtn = document.getElementById('popup-finish-day-btn');
    const finishHint = document.getElementById('popup-finish-hint');
    if (finishDayBtn) finishDayBtn.style.display = 'none';
    if (finishHint) finishHint.style.display = 'none';
}

function setDailyLogButtonClaimed() {
    const btn = document.getElementById('daily-log-btn');
    const hint = document.getElementById('daily-log-hint');
    if (btn) {
        btn.disabled = true;
        btn.style.background = 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)';
        btn.style.opacity = '0.7';
        btn.style.boxShadow = 'none';
        btn.style.cursor = 'default';
        btn.innerHTML = `
            <span style="font-size: 1.3rem;">&#x2705;</span>
            <span>Meals Logged for the Day</span>
        `;
    }
    if (hint) hint.textContent = 'Come back tomorrow for another chance!';

    // Also update popup claim button
    const popupBtn = document.getElementById('popup-claim-btn');
    const popupHint = document.getElementById('popup-claim-hint');
    if (popupBtn) {
        popupBtn.disabled = true;
        popupBtn.style.background = 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)';
        popupBtn.style.opacity = '0.7';
        popupBtn.style.cursor = 'default';
        popupBtn.innerHTML = `
            <span style="font-size: 1.3rem;">&#x2705;</span>
            <span>Meals Logged for the Day</span>
        `;
    }
    if (popupHint) popupHint.textContent = 'Come back tomorrow for another chance!';
}

function resetDailyLogButton() {
    const btn = document.getElementById('daily-log-btn');
    const hint = document.getElementById('daily-log-hint');
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.background = 'linear-gradient(135deg, var(--primary) 0%, #065f3a 100%)';
        btn.style.boxShadow = '0 4px 12px rgba(4, 106, 56, 0.3)';
        btn.style.cursor = 'pointer';
        btn.innerHTML = `
            <span style="font-size: 1.3rem;">&#x2705;</span>
            <span>Log Your Meals for the Day</span>
            <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 20px; font-size: 0.85rem;">+2 pts</span>
        `;
    }
    if (hint) hint.textContent = 'Hit within 20% of your calorie & macro goals to earn 2 bonus points';

    // Also reset popup claim button
    const popupBtn = document.getElementById('popup-claim-btn');
    const popupHint = document.getElementById('popup-claim-hint');
    if (popupBtn) {
        popupBtn.disabled = false;
        popupBtn.style.opacity = '1';
        popupBtn.style.background = 'linear-gradient(135deg, var(--primary) 0%, #065f3a 100%)';
        popupBtn.style.cursor = 'pointer';
        popupBtn.innerHTML = `
            <span style="font-size: 1.3rem;">&#x2705;</span>
            <span>Claim Daily Bonus</span>
            <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 20px; font-size: 0.85rem;">+2 pts</span>
        `;
    }
    if (popupHint) popupHint.textContent = 'Hit within 20% of your calorie & macro goals to earn 2 bonus points';

    // Also reset the finish-day button so it doesn't stay stuck on "Logging..."
    const finishBtn = document.getElementById('popup-finish-day-btn');
    if (finishBtn) {
        finishBtn.disabled = false;
        finishBtn.style.opacity = '1';
        finishBtn.style.display = 'none';
        finishBtn.innerHTML = '<span>Log Your Meals for the Day Anyway</span>';
    }
    const finishHint = document.getElementById('popup-finish-hint');
    if (finishHint) finishHint.style.display = 'none';
}

// Check if daily log bonus has already been claimed today (called from loadTodayNutrition)
async function checkDailyLogBonusStatus() {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;

        const today = getLocalDateString();

        // Check for points bonus claim
        const { data: existingClaim } = await window.supabaseClient
            .from('point_transactions')
            .select('id')
            .eq('user_id', window.currentUser.id)
            .eq('transaction_type', 'earn_daily_log')
            .gte('created_at', today + 'T00:00:00')
            .lte('created_at', today + 'T23:59:59')
            .limit(1)
            .maybeSingle();

        if (existingClaim) {
            setDailyLogButtonClaimed();
            return;
        }

        // Check if day was completed without bonus (finish day flow)
        const { data: dailyNutrition } = await window.supabaseClient
            .from('daily_nutrition')
            .select('day_completed')
            .eq('user_id', window.currentUser.id)
            .eq('nutrition_date', today)
            .single();

        if (dailyNutrition?.day_completed) {
            setDailyLogButtonDayCompleted();
        }
    } catch (error) {
        console.error('Error checking daily log bonus status:', error);
    }
}

// Award points for a workout (called after successful workout logging)
async function awardPointsForWorkout(workoutId, photoTimestamp = null, aiConfidence = null, photoHash = null) {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return null;

        // Get current points to track level before awarding
        let pointsBefore = null;
        try {
            pointsBefore = await window.db?.points?.getPoints(window.currentUser.id);
        } catch (e) {
            console.log('Could not get previous points');
        }
        const previousLevelData = calculateLevel(pointsBefore?.lifetime_points || 0);
        const previousLevel = previousLevelData.level;
        const previousProgress = previousLevelData.progress || 0;

        const result = await window.db?.points?.awardPoints(
            window.currentUser.id,
            'workout',
            workoutId,
            { photoTimestamp, aiConfidence, photoHash }
        );

        if (result?.success) {
            // Show points earned toast
            showPointsEarnedToast(
                result.pointsAwarded,
                result.bonusPoints,
                result.currentStreak
            );

            // Show milestone toasts
            if (result.milestonesUnlocked?.length > 0) {
                result.milestonesUnlocked.forEach((milestone, index) => {
                    setTimeout(() => showMilestoneToast(milestone), (index + 1) * 500);
                });
            }

            // Check for level-up
            const newLifetimePoints = result.newLifetimePoints || (pointsBefore?.lifetime_points || 0) + (result.pointsAwarded || 0) + (result.bonusPoints || 0);
            const newLevelData = calculateLevel(newLifetimePoints);
            if (newLevelData.level > previousLevel) {
                // Delay level-up celebration to appear after points toast
                const delayMs = (result.milestonesUnlocked?.length || 0) * 500 + 1000;
                setTimeout(() => {
                    // Use new in-Tamagotchi celebration (auto-navigates to dashboard)
                    triggerLevelUpCelebration(
                        newLevelData.level,
                        getLevelTitle(newLevelData.level),
                        previousLevel,
                        newLifetimePoints,
                        result.currentStreak || 0,
                        previousProgress
                    );
                }, delayMs);
            }

            // Refresh points widget
            await loadPointsWidget();

            // Refresh all challenge types (workouts, volume, XP, etc.)
            if (typeof refreshChallengeProgress === 'function') {
                refreshChallengeProgress();
            }
        }

        return result;
    } catch (error) {
        console.error('Error awarding points for workout:', error);
        return null;
    }
}

// Award points for achieving a personal best (1 point per PB)
async function awardPointsForPersonalBest(pbRefId, pbData) {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return null;

        // Get current points to track level before awarding
        let pointsBefore = null;
        try {
            pointsBefore = await window.db?.points?.getPoints(window.currentUser.id);
        } catch (e) {
            console.log('Could not get previous points');
        }
        const previousLevelData = calculateLevel(pointsBefore?.lifetime_points || 0);
        const previousLevel = previousLevelData.level;
        const previousProgress = previousLevelData.progress || 0;

        // Award point for personal best (type: 'personal_best')
        const result = await window.db?.points?.awardPoints(
            window.currentUser.id,
            'personal_best',
            pbRefId,
            {
                exercise: pbData.exercise,
                pbType: pbData.type, // 'weight' or 'reps'
                value: pbData.value,
                improvement: pbData.improvement
            }
        );

        if (result?.success) {
            // Show PB points toast
            const pbTypeText = pbData.type === 'weight' ? 'weight' : pbData.type === 'volume' ? 'volume' : 'reps';
            const toastMsg = pbData.type === 'volume'
                ? `+1 XP — Volume PR! ${pbData.value.toLocaleString()} kg total (+${pbData.improvement.toLocaleString()} kg)`
                : `+1 point for ${pbData.exercise} PB! (${pbTypeText})`;
            showToast(toastMsg, 'success');

            // Check for level-up
            const newLifetimePoints = result.newLifetimePoints || (pointsBefore?.lifetime_points || 0) + 1;
            const newLevelData = calculateLevel(newLifetimePoints);
            if (newLevelData.level > previousLevel) {
                setTimeout(() => {
                    // Use new in-Tamagotchi celebration (auto-navigates to dashboard)
                    triggerLevelUpCelebration(
                        newLevelData.level,
                        getLevelTitle(newLevelData.level),
                        previousLevel,
                        newLifetimePoints,
                        result.currentStreak || 0,
                        previousProgress
                    );
                }, 1500);
            }
        }

        return result;
    } catch (error) {
        console.error('Error awarding points for personal best:', error);
        return null;
    }
}

// ==========================================
// WORKOUT PHOTO VERIFICATION FUNCTIONS
// ==========================================

let capturedWorkoutFile = null;
let workoutPhotoBase64 = null;

// Capture workout completion screen and share to story
// Track which share type we're doing (story or groupchat)
let pendingWorkoutShareType = null;
let workoutPointsEarnedThisSession = { story: false, groupchat: false };

// --- Workout Camera (getUserMedia) ---
// Uses live camera feed instead of <input type="file" capture> which opens
// the gallery instead of the camera inside the Capacitor Android WebView.
let workoutCameraStream = null;
let workoutCameraFacingMode = 'environment';
let _workoutCameraCallback = null;

async function openWorkoutCamera(callback, label) {
    _workoutCameraCallback = callback;
    const modal = document.getElementById('workout-camera-modal');
    if (!modal) { 
        console.error('workout-camera-modal not found');
        showToast('Camera not available. Please try again.', 'error');
        return; 
    }

    // Update dynamic label
    const labelEl = document.getElementById('generic-camera-label');
    if (labelEl) labelEl.textContent = label || 'Take a photo';

    // Enter immersive mode (hide status bar) on native
    if (window.NativePermissions && window.NativePermissions.enterImmersiveMode) {
        try { window.NativePermissions.enterImmersiveMode(); } catch(e) {}
    }

    modal.style.display = 'flex';
    await startWorkoutCamera();
}

async function startWorkoutCamera() {
    stopWorkoutCamera();

    // Request native Android camera permission via bridge (same as unified camera)
    if (window.NativePermissions) {
        try {
            if (window.NativePermissions.isPermissionPermanentlyDenied &&
                window.NativePermissions.isPermissionPermanentlyDenied()) {
                showCameraPermissionSettingsDialog();
                closeWorkoutCamera();
                return;
            }
            if (!window.NativePermissions.hasCameraPermission()) {
                const granted = await new Promise((resolve) => {
                    window._onNativeCameraPermission = function(result) {
                        delete window._onNativeCameraPermission;
                        resolve(result);
                    };
                    window.NativePermissions.requestCameraPermission();
                    setTimeout(() => {
                        if (window._onNativeCameraPermission) {
                            delete window._onNativeCameraPermission;
                            resolve(false);
                        }
                    }, 60000);
                });
                if (!granted) {
                    showCameraPermissionSettingsDialog();
                    closeWorkoutCamera();
                    return;
                }
            }
        } catch (bridgeErr) {
            console.warn('NativePermissions bridge error:', bridgeErr);
        }
    }

    try {
        workoutCameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: workoutCameraFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false
        });
        const video = document.getElementById('workout-camera-video');
        video.srcObject = workoutCameraStream;
        video.style.opacity = '0';
        await video.play();
        video.style.opacity = '1';
    } catch (err) {
        console.error('Workout camera failed:', err);
        if (err.name === 'NotAllowedError') {
            showCameraPermissionSettingsDialog();
        } else {
            showToast('Could not access camera. Check permissions.', 'error');
        }
        closeWorkoutCamera();
    }
}

function stopWorkoutCamera() {
    if (workoutCameraStream) {
        workoutCameraStream.getTracks().forEach(t => t.stop());
        workoutCameraStream = null;
    }
    const video = document.getElementById('workout-camera-video');
    if (video) video.srcObject = null;
}

function closeWorkoutCamera() {
    stopWorkoutCamera();
    const modal = document.getElementById('workout-camera-modal');
    if (modal) modal.style.display = 'none';
    const video = document.getElementById('workout-camera-video');
    if (video) video.style.opacity = '0';
    // Exit immersive mode
    if (window.NativePermissions && window.NativePermissions.exitImmersiveMode) {
        try { window.NativePermissions.exitImmersiveMode(); } catch(e) {}
    }
}

function flipWorkoutCamera() {
    workoutCameraFacingMode = workoutCameraFacingMode === 'environment' ? 'user' : 'environment';
    startWorkoutCamera();
}

function captureWorkoutPhoto() {
    const video = document.getElementById('workout-camera-video');
    const canvas = document.getElementById('workout-camera-canvas');
    if (!video || !canvas || video.readyState < 2) {
        showToast('Camera not ready. Please wait a moment.', 'warning');
        return;
    }

    // Animate button
    const btn = document.getElementById('workout-capture-btn');
    if (btn) { btn.style.transform = 'scale(0.9)'; setTimeout(() => { btn.style.transform = ''; }, 150); }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
        if (!blob) {
            showToast('Failed to capture photo.', 'error');
            return;
        }
        const file = new File([blob], `workout-${Date.now()}.jpg`, { type: 'image/jpeg' });
        closeWorkoutCamera();
        if (typeof _workoutCameraCallback === 'function') {
            try {
                const result = _workoutCameraCallback(file);
                // Handle async callbacks - properly await them
                if (result && typeof result.then === 'function') {
                    await result.catch(err => {
                        console.error('Error in workout camera callback:', err);
                        showToast('Failed to process photo. Please try again.', 'error');
                    });
                }
            } catch (callbackErr) {
                console.error('Error calling workout camera callback:', callbackErr);
                showToast('Failed to process photo. Please try again.', 'error');
            }
            _workoutCameraCallback = null;
        }
    }, 'image/jpeg', 0.92);
}
// --- End Workout Camera ---

// Share workout to story - requires camera photo
function shareWorkoutToStory() {
    // Check if already earned story point this session
    if (workoutPointsEarnedThisSession.story) {
        showToast('You already earned the feed post point for this workout!', 'info');
        return;
    }

    // Check workout duration first - must be at least 15 minutes for points
    const successDurationEl = document.getElementById('success-duration');
    const durationText = successDurationEl ? successDurationEl.textContent : '00:00';
    const [mins, secs] = durationText.split(':').map(Number);
    const totalMinutes = mins + (secs / 60);

    if (totalMinutes < 15) {
        showToast(`Workout must be 15+ minutes for points (yours: ${mins}m ${secs}s)`, 'error');
        return;
    }

    pendingWorkoutShareType = 'story';

    // Open live camera (getUserMedia) instead of file input which opens gallery in WebView
    openWorkoutCamera((file) => {
        handleWorkoutPhotoCaptureFromFile(file);
    }, 'Take a workout photo');
}

// Share workout to group chat - requires camera photo
function shareWorkoutToGroupChat() {
    // Check if already earned groupchat point this session
    if (workoutPointsEarnedThisSession.groupchat) {
        showToast('You already earned the group chat point for this workout!', 'info');
        return;
    }

    // Check workout duration first - must be at least 15 minutes for points
    const successDurationEl = document.getElementById('success-duration');
    const durationText = successDurationEl ? successDurationEl.textContent : '00:00';
    const [mins, secs] = durationText.split(':').map(Number);
    const totalMinutes = mins + (secs / 60);

    if (totalMinutes < 15) {
        showToast(`Workout must be 15+ minutes for points (yours: ${mins}m ${secs}s)`, 'error');
        return;
    }

    pendingWorkoutShareType = 'groupchat';

    // Open live camera (getUserMedia) instead of file input which opens gallery in WebView
    openWorkoutCamera((file) => {
        handleWorkoutPhotoCaptureFromFile(file);
    }, 'Take a workout photo');
}

// Handle the captured workout photo (from file input - legacy/web fallback)
async function handleWorkoutPhotoCapture(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    handleWorkoutPhotoCaptureFromFile(file);
}

// Handle workout photo from a File object (used by both camera modal and file input)
async function handleWorkoutPhotoCaptureFromFile(file) {
    if (!file) return;

    const photoTimestamp = new Date().toISOString();

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Data = e.target.result;

        try {
            const photoHash = await window.db?.points?.generatePhotoHash(base64Data);

            if (pendingWorkoutShareType === 'story') {
                window.pendingStoryFile = file;
                window.pendingStoryBase64 = base64Data;
                window.pendingStoryType = 'image';
                window.pendingWorkoutPhotoData = {
                    timestamp: photoTimestamp,
                    hash: photoHash,
                    forPoints: true
                };

                // Open story modal
                const modal = document.getElementById('story-upload-modal');
                if (modal) modal.style.display = 'flex';

                // Set preview
                const previewImage = document.getElementById('story-preview-image');
                const previewVideo = document.getElementById('story-preview-video');
                const placeholder = document.getElementById('story-preview-placeholder');

                if (previewImage) {
                    previewImage.src = base64Data;
                    previewImage.style.display = 'block';
                }
                if (previewVideo) previewVideo.style.display = 'none';
                if (placeholder) placeholder.style.display = 'none';

                // Set caption
                const captionInput = document.getElementById('story-caption-input');
                if (captionInput) captionInput.value = 'Just finished my workout! 💪';

                // Enable upload button
                const uploadBtn = document.getElementById('story-upload-button');
                if (uploadBtn) {
                    uploadBtn.disabled = false;
                    uploadBtn.style.opacity = '1';
                }
            } else if (pendingWorkoutShareType === 'groupchat') {
                // Award point first, then go to group chat selection
                await awardWorkoutSharePoint('groupchat', photoTimestamp, photoHash);

                // Go to quick share modal for group chat selection
                openQuickShareModal();
            }
        } catch (error) {
            console.error('Error processing workout photo:', error);
            showToast('Failed to process photo. Please try again.', 'error');
        }
    };
    reader.readAsDataURL(file);
}

// Award point for workout share
async function awardWorkoutSharePoint(shareType, photoTimestamp, photoHash) {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return null;

        const workoutRefId = `workout_${shareType}_${Date.now()}`;
        const result = await window.db?.points?.awardPoints(
            window.currentUser.id,
            'workout',
            workoutRefId,
            { photoTimestamp, aiConfidence: 'high', photoHash }
        );

        if (result?.success) {
            // Mark as earned for this session
            if (shareType === 'story') {
                workoutPointsEarnedThisSession.story = true;
            } else {
                workoutPointsEarnedThisSession.groupchat = true;
                // Disable group chat share button on success screen
                const gcBtn = document.getElementById('share-workout-groupchat-btn');
                if (gcBtn) {
                    gcBtn.disabled = true;
                    gcBtn.style.opacity = '0.5';
                    gcBtn.style.cursor = 'default';
                    gcBtn.querySelector('span:last-child').textContent = 'Shared! +1 XP Earned';
                }
            }

            // Update UI
            const pointsAwarded = document.getElementById('workout-points-awarded');
            const pointsText = document.getElementById('workout-points-text');
            if (pointsAwarded) {
                pointsAwarded.style.display = 'block';
                if (pointsText) {
                    pointsText.textContent = '+1 XP Earned!';
                }
            }

            showToast(`+1 XP for sharing your workout${shareType === 'groupchat' ? ' to group chat' : ''}!`, 'success');

            // Refresh tamagotchi display to sync XP with database
            if (typeof window.refreshLevelDisplay === 'function') {
                window.refreshLevelDisplay();
            }

            // Trigger XP bar rainbow animation
            if (typeof window.triggerXPBarRainbow === 'function') {
                window.triggerXPBarRainbow();
            }

            return result;
        }
    } catch (error) {
        console.error('Error awarding workout share point:', error);
    }
    return null;
}

// Legacy function - kept for backward compatibility but now uses new flow
async function captureAndShareWorkout() {
    shareWorkoutToStory();
}

// Share workout as an aesthetic card to feed (with gym photo carousel)
async function shareWorkoutCardToFeed() {
    // Check if already earned story point this session
    if (workoutPointsEarnedThisSession.story) {
        showToast('You already earned the feed post point for this workout!', 'info');
        return;
    }

    // Check workout duration - must be at least 15 minutes for points
    const successDurationEl = document.getElementById('success-duration');
    const durationText = successDurationEl ? successDurationEl.textContent : '00:00';
    const [mins, secs] = durationText.split(':').map(Number);
    const totalMinutes = mins + (secs / 60);

    if (totalMinutes < 15) {
        showToast(`Workout must be 15+ minutes for points (yours: ${mins}m ${secs}s)`, 'error');
        return;
    }

    if (!completedWorkoutDataForShare) {
        showToast('No workout data to share', 'error');
        return;
    }

    // Store context so we know this is a card share
    window._pendingCardShare = true;

    // Open live camera (getUserMedia) instead of file input which opens gallery in WebView
    openWorkoutCamera((file) => {
        handleWorkoutCardPhotoCaptureFromFile(file);
    }, 'Take a workout photo');
}

// Handle the gym photo captured for workout card share (from file input - legacy/web fallback)
async function handleWorkoutCardPhotoCapture(event) {
    const file = event.target.files[0];
    if (!file) {
        window._pendingCardShare = false;
        return;
    }
    event.target.value = '';
    handleWorkoutCardPhotoCaptureFromFile(file);
}

// Handle workout card photo from a File object (used by both camera modal and file input)
async function handleWorkoutCardPhotoCaptureFromFile(file) {
    if (!file) {
        window._pendingCardShare = false;
        return;
    }

    const btn = document.getElementById('share-workout-card-btn');
    if (btn) {
        btn.disabled = true;
        btn.querySelector('span:last-child').textContent = 'Posting...';
    }

    try {
        // Compress photo first to avoid payload size issues
        const compressedFile = await compressMealImage(file);

        // Convert compressed photo to base64
        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(compressedFile);
        });

        // Build workout card data from completedWorkoutDataForShare
        const data = completedWorkoutDataForShare;
        const exerciseMap = {};
        (data.sets || []).forEach(set => {
            const name = set.exercise || set.exercise_name || 'Exercise';
            if (!exerciseMap[name]) {
                exerciseMap[name] = { name, sets: 0, bestKg: 0, bestReps: 0 };
            }
            exerciseMap[name].sets++;
            const kg = parseFloat(set.kg) || 0;
            const reps = parseInt(set.reps) || 0;
            if (kg > exerciseMap[name].bestKg) {
                exerciseMap[name].bestKg = kg;
                exerciseMap[name].bestReps = reps;
            } else if (kg === exerciseMap[name].bestKg && reps > exerciseMap[name].bestReps) {
                exerciseMap[name].bestReps = reps;
            }
        });

        const exercises = Object.values(exerciseMap).map(ex => ({
            name: ex.name,
            sets: ex.sets,
            best: ex.bestKg > 0 ? `${ex.sets}×${ex.bestReps} ${ex.bestKg}kg` : (ex.bestReps > 0 ? `${ex.sets}×${ex.bestReps}` : `${ex.sets} sets`)
        }));

        // Calculate total volume
        let totalVolume = 0;
        (data.sets || []).forEach(set => {
            const kg = parseFloat(set.kg) || 0;
            const reps = parseInt(set.reps) || 0;
            totalVolume += kg * reps;
        });

        // Build PBs data
        const pbs = (data.newPBs || []).map(pb => ({
            exercise: pb.exercise,
            type: pb.type,
            value: pb.value,
            reps: pb.reps,
            weight: pb.weight,
            improvement: pb.improvement
        }));

        const cardPayload = {
            card_type: 'workout',
            workout_name: data.workoutName || 'Workout',
            duration: data.duration || durationText,
            exercises: exercises,
            total_sets: data.sets ? data.sets.length : 0,
            total_volume: totalVolume > 0 ? totalVolume.toLocaleString() + ' kg' : null,
            pbs: pbs.length > 0 ? pbs : null
        };

        // Create story with photo + workout card data
        const story = await dbHelpers.stories.create(window.currentUser.id, {
            media_type: 'workout_card',
            media_url: base64Data,
            thumbnail_url: null,
            caption: JSON.stringify(cardPayload),
            duration: 5
        });

        console.log('Workout card story created:', story);

        // Award XP
        const photoTimestamp = new Date().toISOString();
        await awardWorkoutSharePoint('story', photoTimestamp, null);

        // Update button to show success
        if (btn) {
            btn.style.background = 'rgba(68, 255, 68, 0.3)';
            btn.style.border = '1px solid rgba(68, 255, 68, 0.5)';
            btn.innerHTML = '<span style="font-size:1.3rem;">✅</span><span style="font-size:0.95rem;">Shared! +1 XP</span>';
        }

        // Refresh feed if visible
        if (typeof loadPhotoFeed === 'function') {
            loadPhotoFeed('friends-photo-feed', 'friends-feed-empty');
        }

        showToast('Workout card shared to feed! +1 XP', 'success');

    } catch (error) {
        console.error('Error sharing workout card:', error);
        showToast('Failed to share workout card. Please try again.', 'error');

        if (btn) {
            btn.disabled = false;
            btn.querySelector('span:last-child').textContent = 'Share Workout Card (+1 XP)';
        }
    }

    window._pendingCardShare = false;
}

// Share a PB achievement card to feed
async function sharePBCardToFeed(pbData) {
    if (!pbData) return;

    try {
        const cardPayload = {
            card_type: 'pb',
            exercise: pbData.exercise,
            pb_type: pbData.type,
            value: pbData.value,
            reps: pbData.reps,
            weight: pbData.weight,
            improvement: pbData.improvement,
            previous: pbData.previous != null ? pbData.previous : (pbData.improvement ? pbData.value - pbData.improvement : null)
        };

        const story = await dbHelpers.stories.create(window.currentUser.id, {
            media_type: 'workout_card',
            media_url: '',
            thumbnail_url: null,
            caption: JSON.stringify(cardPayload),
            duration: 5
        });

        console.log('PB card story created:', story);

        // Refresh feed if visible
        if (typeof loadPhotoFeed === 'function') {
            loadPhotoFeed('friends-photo-feed', 'friends-feed-empty');
        }

        showToast('PB shared to feed!', 'success');

    } catch (error) {
        console.error('Error sharing PB card:', error);
        showToast('Failed to share PB. Please try again.', 'error');
    }
}

// Share daily nutrition summary card to feed
async function shareNutritionToFeed() {
    if (!window.currentUser) {
        showToast('You must be logged in to share', 'error');
        return;
    }

    const btn = document.getElementById('share-nutrition-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span style="font-size:1rem;">🥗</span><span style="font-size:0.85rem;">Sharing...</span>';
    }

    try {
        const userId = window.currentUser.id;
        const today = getLocalDateString();

        // Load today's nutrition data
        const { data: dailyData, error: dailyError } = await window.supabaseClient
            .from('daily_nutrition')
            .select('*')
            .eq('user_id', userId)
            .eq('nutrition_date', today)
            .single();

        if (dailyError || !dailyData || !dailyData.total_calories) {
            showToast('Log some meals first before sharing!', 'info');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span style="font-size:1rem;">🥗</span><span style="font-size:0.85rem;">Share Nutrition</span>';
            }
            return;
        }

        // Calculate score
        const scoreData = calculateNutritionScore(dailyData);
        const score = scoreData ? scoreData.total : 0;

        // Get meal count for today
        const { data: mealsData } = await window.supabaseClient
            .from('meal_logs')
            .select('id')
            .eq('user_id', userId)
            .eq('meal_date', today);

        const mealCount = mealsData ? mealsData.length : 0;

        // Get streak
        let streak = 0;
        try {
            const pointsData = await window.db?.points?.getPoints(userId);
            streak = pointsData?.current_streak || 0;
        } catch (e) {
            console.log('Could not get streak for nutrition card');
        }

        const cardPayload = {
            card_type: 'nutrition',
            score: score,
            calories: dailyData.total_calories || 0,
            calorie_goal: dailyData.calorie_goal || 2000,
            protein: dailyData.total_protein_g || 0,
            protein_goal: dailyData.protein_goal_g || 50,
            carbs: dailyData.total_carbs_g || 0,
            carbs_goal: dailyData.carbs_goal_g || 250,
            fat: dailyData.total_fat_g || 0,
            fat_goal: dailyData.fat_goal_g || 70,
            meal_count: mealCount,
            streak: streak
        };

        const story = await dbHelpers.stories.create(window.currentUser.id, {
            media_type: 'nutrition_card',
            media_url: '',
            thumbnail_url: null,
            caption: JSON.stringify(cardPayload),
            duration: 5
        });

        console.log('Nutrition card story created:', story);

        // Update button to show success
        if (btn) {
            btn.style.background = 'rgba(99, 102, 241, 0.2)';
            btn.style.border = '1px solid rgba(99, 102, 241, 0.4)';
            btn.innerHTML = '<span style="font-size:1rem;">✅</span><span style="font-size:0.85rem;">Shared!</span>';
        }

        // Refresh feed if visible
        if (typeof loadPhotoFeed === 'function') {
            loadPhotoFeed('friends-photo-feed', 'friends-feed-empty');
        }

        showToast('Nutrition card shared to feed!', 'success');

    } catch (error) {
        console.error('Error sharing nutrition card:', error);
        showToast('Failed to share. Please try again.', 'error');

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span style="font-size:1rem;">🥗</span><span style="font-size:0.85rem;">Share Nutrition</span>';
        }
    }
}

// Share level-up achievement card to feed
async function shareLevelUpToFeed(levelData) {
    if (!window.currentUser || !levelData) return;

    try {
        // Get streak
        let streak = 0;
        try {
            const session = await window.authHelpers?.getSession();
            if (session?.user) {
                const pointsData = await window.db?.points?.getPoints(window.currentUser.id);
                streak = pointsData?.current_streak || 0;
            }
        } catch (e) {
            console.log('Could not get streak for level-up card');
        }

        const cardPayload = {
            card_type: 'level_up',
            level: levelData.newLevel || levelData.level,
            title: levelData.title || getLevelTitle(levelData.newLevel || levelData.level),
            previous_level: levelData.previousLevel || null,
            previous_title: levelData.previousLevel ? getLevelTitle(levelData.previousLevel) : null,
            lifetime_xp: levelData.lifetimePoints || 0,
            streak: streak
        };

        const story = await dbHelpers.stories.create(window.currentUser.id, {
            media_type: 'level_up_card',
            media_url: '',
            thumbnail_url: null,
            caption: JSON.stringify(cardPayload),
            duration: 5
        });

        console.log('Level-up card story created:', story);

        // Refresh feed if visible
        if (typeof loadPhotoFeed === 'function') {
            loadPhotoFeed('friends-photo-feed', 'friends-feed-empty');
        }

        showToast('Level up shared to feed!', 'success');

    } catch (error) {
        console.error('Error sharing level-up card:', error);
        showToast('Failed to share level up. Please try again.', 'error');
    }
}

// ============================================
// ACTIVITY LOGGING SYSTEM
// Supports fitness classes, boxing, tennis, swimming, running, cycling, walking, yoga, dance, etc.
// ============================================

const ACTIVITY_TYPES = [
    { key: 'fitness_class', label: 'Fitness Class', emoji: '🏋️', color: '#dc2626' },
    { key: 'boxing',        label: 'Boxing',        emoji: '🥊', color: '#b91c1c' },
    { key: 'tennis',        label: 'Tennis',        emoji: '🎾', color: '#65a30d' },
    { key: 'swimming',      label: 'Swimming',      emoji: '🏊', color: '#0284c7' },
    { key: 'running',       label: 'Running',       emoji: '🏃', color: '#ea580c' },
    { key: 'cycling',       label: 'Cycling',       emoji: '🚴', color: '#7c3aed' },
    { key: 'walking',       label: 'Walking',       emoji: '🚶', color: '#059669' },
    { key: 'yoga',          label: 'Yoga',          emoji: '🧘', color: '#c026d3' },
    { key: 'dance',         label: 'Dance',         emoji: '💃', color: '#e11d48' },
    { key: 'hiking',        label: 'Hiking',        emoji: '🥾', color: '#854d0e' },
    { key: 'pilates',       label: 'Pilates',       emoji: '🤸', color: '#0d9488' },
    { key: 'martial_arts',  label: 'Martial Arts',  emoji: '🥋', color: '#1e293b' },
    { key: 'other',         label: 'Other',         emoji: '⚡', color: '#64748b' }
];

// MET values for calorie estimation (Metabolic Equivalent of Task)
// Source: Compendium of Physical Activities
const ACTIVITY_MET_VALUES = {
    walking:        { light: 2.5, moderate: 3.5, vigorous: 5.0 },
    running:        { light: 6.0, moderate: 8.0, vigorous: 11.0 },
    cycling:        { light: 4.0, moderate: 6.8, vigorous: 10.0 },
    swimming:       { light: 4.5, moderate: 6.0, vigorous: 9.8 },
    boxing:         { light: 5.5, moderate: 7.8, vigorous: 12.0 },
    tennis:         { light: 5.0, moderate: 7.3, vigorous: 10.0 },
    yoga:           { light: 2.5, moderate: 3.0, vigorous: 4.0 },
    dance:          { light: 3.5, moderate: 5.5, vigorous: 7.8 },
    pilates:        { light: 3.0, moderate: 4.0, vigorous: 5.0 },
    fitness_class:  { light: 4.5, moderate: 6.5, vigorous: 9.0 },
    hiking:         { light: 4.5, moderate: 6.0, vigorous: 8.0 },
    martial_arts:   { light: 5.0, moderate: 7.0, vigorous: 10.3 },
    other:          { light: 3.5, moderate: 5.0, vigorous: 7.0 }
};

function estimateCaloriesBurned(activityType, intensityLevel, durationMinutes, userWeightKg) {
    const mets = ACTIVITY_MET_VALUES[activityType] || ACTIVITY_MET_VALUES.other;
    const met = mets[intensityLevel] || mets.moderate;
    const hours = durationMinutes / 60;
    return Math.round(met * userWeightKg * hours);
}

// XP eligibility check for activities
function isActivityXPEligible(activityType, hasPhoto, venueVerifiable) {
    if (!hasPhoto) return false;
    // Walks/runs/hikes only get XP with a verifiable venue (treadmill, track, etc.)
    const outdoorOnlyTypes = ['walking', 'running', 'hiking'];
    if (outdoorOnlyTypes.includes(activityType)) {
        return venueVerifiable === true;
    }
    // All other activities with a verifiable venue photo get XP
    return venueVerifiable === true;
}

// Activity form state
let activityFormState = {
    selectedType: null,
    duration: 30,
    intensity: 'moderate',
    photoBase64: null,
    photoMimeType: null,
    userWeightKg: 70 // default, will be loaded from quiz_results
};

// Saved activity data for sharing after save
let savedActivityData = null;

function openLogActivityForm() {
    hideAllAppViews();
    document.getElementById('view-log-activity').style.display = 'block';
    document.querySelector('.bottom-nav').style.display = 'none';

    // Push navigation state for Android back button
    pushNavigationState('view-log-activity', () => closeLogActivity());

    // Reset form state
    activityFormState = {
        selectedType: null,
        duration: 30,
        intensity: 'moderate',
        photoBase64: null,
        photoMimeType: null,
        userWeightKg: 70
    };
    savedActivityData = null;

    // Reset form UI
    document.getElementById('activity-label-input').value = '';
    document.getElementById('activity-notes-input').value = '';
    document.getElementById('activity-duration-display').textContent = '30';
    document.getElementById('activity-photo-preview').style.display = 'none';
    document.getElementById('activity-photo-btn').style.display = 'flex';
    document.getElementById('activity-calories-display').textContent = '0';
    document.getElementById('activity-save-btn').disabled = false;
    document.getElementById('activity-save-btn').textContent = 'Log Activity';

    // Reset intensity to moderate
    selectActivityIntensity('moderate');

    // Build activity type grid
    const grid = document.getElementById('activity-type-grid');
    grid.innerHTML = ACTIVITY_TYPES.map(t => `
        <button onclick="selectActivityType('${t.key}')" id="activity-type-btn-${t.key}" style="padding: 14px 8px; border-radius: 14px; border: 2px solid var(--border); background: var(--card-bg); cursor: pointer; text-align: center; transition: all 0.2s;">
            <div style="font-size: 1.5rem;">${t.emoji}</div>
            <div style="font-weight: 700; font-size: 0.75rem; margin-top: 4px; color: var(--text-main);">${t.label}</div>
        </button>
    `).join('');

    // Load user weight for calorie estimation
    loadUserWeightForActivity();

    // Push navigation state
    window.history.pushState({ view: 'log-activity' }, '', '#log-activity');
}
window.openLogActivityForm = openLogActivityForm;

async function loadUserWeightForActivity() {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;
        const quiz = await window.dbHelpers?.quizResults?.getLatest(window.currentUser.id);
        if (quiz?.weight) {
            activityFormState.userWeightKg = parseFloat(quiz.weight) || 70;
            updateActivityCalories();
        }
    } catch (e) {
        console.error('Failed to load user weight for activity:', e);
    }
}

function selectActivityType(typeKey) {
    activityFormState.selectedType = typeKey;
    // Update UI - highlight selected
    ACTIVITY_TYPES.forEach(t => {
        const btn = document.getElementById(`activity-type-btn-${t.key}`);
        if (btn) {
            if (t.key === typeKey) {
                btn.style.border = `2px solid ${t.color}`;
                btn.style.background = `${t.color}15`;
                btn.style.transform = 'scale(1.05)';
            } else {
                btn.style.border = '2px solid var(--border)';
                btn.style.background = 'var(--card-bg)';
                btn.style.transform = 'scale(1)';
            }
        }
    });
    updateActivityCalories();
}
window.selectActivityType = selectActivityType;

function adjustActivityDuration(delta) {
    activityFormState.duration = Math.max(5, Math.min(300, activityFormState.duration + delta));
    document.getElementById('activity-duration-display').textContent = activityFormState.duration;
    updateActivityCalories();
}
window.adjustActivityDuration = adjustActivityDuration;

function selectActivityIntensity(level) {
    activityFormState.intensity = level;
    document.querySelectorAll('#activity-intensity-row .intensity-btn').forEach(btn => {
        const isSelected = btn.getAttribute('data-intensity') === level;
        btn.style.border = isSelected ? '2px solid #0ea5e9' : '2px solid var(--border)';
        btn.style.background = isSelected ? 'rgba(14,165,233,0.1)' : 'var(--card-bg)';
    });
    updateActivityCalories();
}
window.selectActivityIntensity = selectActivityIntensity;

function updateActivityCalories() {
    const type = activityFormState.selectedType || 'other';
    const cal = estimateCaloriesBurned(type, activityFormState.intensity, activityFormState.duration, activityFormState.userWeightKg);
    document.getElementById('activity-calories-display').textContent = cal;
}

function captureActivityPhoto() {
    // Use getUserMedia camera instead of file input (which opens gallery in Capacitor WebView)
    openWorkoutCamera((file) => {
        handleActivityPhotoCaptureFromFile(file);
    }, 'Take an activity photo');
}
window.captureActivityPhoto = captureActivityPhoto;

// Legacy handler for file input (kept for compatibility)
function handleActivityPhotoCapture(input) {
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    handleActivityPhotoCaptureFromFile(file);
}
window.handleActivityPhotoCapture = handleActivityPhotoCapture;

// Handle activity photo from a File object (used by both camera modal and file input)
function handleActivityPhotoCaptureFromFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Full = e.target.result;
        const base64Data = base64Full.split(',')[1];
        activityFormState.photoBase64 = base64Data;
        activityFormState.photoMimeType = file.type || 'image/jpeg';

        // Show preview
        document.getElementById('activity-photo-img').src = base64Full;
        document.getElementById('activity-photo-preview').style.display = 'block';
        document.getElementById('activity-photo-btn').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function removeActivityPhoto() {
    activityFormState.photoBase64 = null;
    activityFormState.photoMimeType = null;
    document.getElementById('activity-photo-preview').style.display = 'none';
    document.getElementById('activity-photo-btn').style.display = 'flex';
}
window.removeActivityPhoto = removeActivityPhoto;

async function saveActivity() {
    if (!activityFormState.selectedType) {
        showToast('Please select an activity type', 'error');
        return;
    }

    const saveBtn = document.getElementById('activity-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) {
            showToast('Please log in to save activities', 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Log Activity';
            return;
        }

        const activityType = activityFormState.selectedType;
        const duration = activityFormState.duration;
        const intensity = activityFormState.intensity;
        const label = document.getElementById('activity-label-input').value.trim();
        const notes = document.getElementById('activity-notes-input').value.trim();
        const calories = estimateCaloriesBurned(activityType, intensity, duration, activityFormState.userWeightKg);
        const metValues = ACTIVITY_MET_VALUES[activityType] || ACTIVITY_MET_VALUES.other;
        const metValue = metValues[intensity] || metValues.moderate;

        // Photo verification
        let venueVerifiable = false;
        let venueType = null;
        let aiConfidence = null;
        let detectedElements = [];
        let photoVerified = false;
        let xpEligible = false;

        if (activityFormState.photoBase64) {
            saveBtn.textContent = 'Verifying photo...';
            try {
                const verifyResponse = await fetch('/api/analyze-workout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageBase64: activityFormState.photoBase64,
                        mimeType: activityFormState.photoMimeType,
                        activityType: activityType
                    })
                });

                if (verifyResponse.ok) {
                    const verifyData = await verifyResponse.json();
                    if (verifyData.success) {
                        venueVerifiable = verifyData.venueVerifiable || false;
                        venueType = verifyData.venueType || 'unknown';
                        aiConfidence = verifyData.data?.confidence || 'low';
                        detectedElements = verifyData.data?.detectedElements || [];
                        photoVerified = verifyData.data?.isWorkoutPhoto || false;
                    }
                }
            } catch (verifyError) {
                console.error('Photo verification failed:', verifyError);
                // Continue without verification — no XP but still save
            }

            xpEligible = isActivityXPEligible(activityType, true, venueVerifiable);
        }

        saveBtn.textContent = 'Saving...';

        // Save to database
        const activityRecord = await window.dbHelpers?.activityLogs?.create(window.currentUser.id, {
            activity_type: activityType,
            activity_label: label || null,
            duration_minutes: duration,
            intensity: intensity,
            estimated_calories: calories,
            met_value: metValue,
            photo_url: activityFormState.photoBase64 ? 'photo_captured' : null,
            photo_verified: photoVerified,
            venue_type: venueType,
            venue_verifiable: venueVerifiable,
            ai_confidence: aiConfidence,
            detected_elements: detectedElements,
            xp_eligible: xpEligible,
            notes: notes || null
        });

        // Store for sharing
        const typeInfo = ACTIVITY_TYPES.find(t => t.key === activityType) || ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];
        savedActivityData = {
            id: activityRecord?.id,
            activity_type: activityType,
            activity_label: label || typeInfo.label,
            duration: duration,
            intensity: intensity,
            calories: calories,
            emoji: typeInfo.emoji,
            color: typeInfo.color,
            xpEligible: xpEligible,
            venueVerifiable: venueVerifiable,
            venueType: venueType,
            photoBase64: activityFormState.photoBase64,
            photoMimeType: activityFormState.photoMimeType
        };

        // Show success screen
        showActivitySuccess(savedActivityData);

    } catch (error) {
        console.error('Error saving activity:', error);
        showToast('Failed to save activity. Please try again.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Log Activity';
    }
}
window.saveActivity = saveActivity;

function showActivitySuccess(data) {
    hideAllAppViews();
    document.getElementById('view-activity-success').style.display = 'block';
    document.querySelector('.bottom-nav').style.display = 'none';

    // Push navigation state for Android back button
    pushNavigationState('view-activity-success', () => closeActivitySuccess());

    // Update success screen
    document.getElementById('activity-success-emoji').textContent = data.emoji;
    document.getElementById('activity-success-label').textContent = data.activity_label;
    document.getElementById('activity-success-duration').textContent = data.duration + ' min';
    document.getElementById('activity-success-calories').textContent = data.calories + ' kcal';

    const intensityEmojis = { light: '🚶', moderate: '🏃', vigorous: '🔥' };
    document.getElementById('activity-success-intensity').textContent = intensityEmojis[data.intensity] || '🏃';

    // XP status
    const xpStatus = document.getElementById('activity-xp-status');
    const noXpHint = document.getElementById('activity-no-xp-hint');

    if (data.xpEligible) {
        xpStatus.style.display = 'block';
        xpStatus.style.background = 'rgba(68, 255, 68, 0.2)';
        xpStatus.style.border = '2px solid rgba(68, 255, 68, 0.5)';
        xpStatus.innerHTML = '<div style="font-weight:700;">📸 Venue verified! Share to earn XP</div>';
        noXpHint.style.display = 'none';
    } else if (data.photoBase64) {
        xpStatus.style.display = 'block';
        xpStatus.style.background = 'rgba(255, 200, 50, 0.2)';
        xpStatus.style.border = '2px solid rgba(255, 200, 50, 0.5)';
        xpStatus.innerHTML = '<div style="font-weight:700;">📸 Photo taken but venue not verified for XP</div><div style="font-size:0.8rem; margin-top:4px; opacity:0.85;">Try a clearer photo showing gym equipment, court, or studio next time</div>';
        noXpHint.style.display = 'none';
    } else {
        xpStatus.style.display = 'none';
        noXpHint.style.display = 'block';
    }

    // Reset share button
    const shareBtn = document.getElementById('activity-share-btn');
    shareBtn.disabled = false;
    document.getElementById('activity-share-btn-text').textContent = data.xpEligible ? 'Share Activity Card (+1 XP)' : 'Share Activity Card';

    window.history.pushState({ view: 'activity-success' }, '', '#activity-success');
}

async function shareActivityCardToFeed() {
    if (!savedActivityData) {
        showToast('No activity data to share', 'error');
        return;
    }

    const shareBtn = document.getElementById('activity-share-btn');
    shareBtn.disabled = true;
    document.getElementById('activity-share-btn-text').textContent = 'Sharing...';

    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) {
            showToast('Please log in to share', 'error');
            shareBtn.disabled = false;
            document.getElementById('activity-share-btn-text').textContent = 'Share Activity Card';
            return;
        }

        // Build card payload for feed rendering
        const cardPayload = {
            card_type: 'activity',
            activity_type: savedActivityData.activity_type,
            activity_label: savedActivityData.activity_label,
            duration: savedActivityData.duration + ' min',
            intensity: savedActivityData.intensity,
            calories: savedActivityData.calories,
            emoji: savedActivityData.emoji,
            venue_type: savedActivityData.venueType
        };

        // Create story in feed
        const storyData = {
            media_type: 'workout_card',
            media_url: savedActivityData.photoBase64 ? `data:${savedActivityData.photoMimeType || 'image/jpeg'};base64,${savedActivityData.photoBase64}` : '',
            caption: JSON.stringify(cardPayload),
            duration: 5
        };

        await window.dbHelpers?.stories?.create(window.currentUser.id, storyData);

        // Award XP if eligible
        if (savedActivityData.xpEligible) {
            await awardWorkoutSharePoint('story', Date.now(), null);

            const xpStatus = document.getElementById('activity-xp-status');
            xpStatus.style.display = 'block';
            xpStatus.style.background = 'rgba(68, 255, 68, 0.2)';
            xpStatus.style.border = '2px solid rgba(68, 255, 68, 0.5)';
            xpStatus.innerHTML = '<div style="font-weight:700; font-size:1.1rem;">+1 XP Earned! 🎉</div>';
        }

        // Update activity log record
        if (savedActivityData.id) {
            try {
                await window.dbHelpers?.activityLogs?.update(savedActivityData.id, {
                    shared_to_feed: true,
                    xp_awarded: savedActivityData.xpEligible
                });
            } catch (e) {
                console.error('Failed to update activity log:', e);
            }
        }

        document.getElementById('activity-share-btn-text').textContent = '✅ Shared!';
        showToast('Activity shared to feed!', 'success');

        // Refresh feed in background
        if (typeof window.loadPhotoFeed === 'function') {
            window.loadPhotoFeed();
        }

    } catch (error) {
        console.error('Error sharing activity:', error);
        showToast('Failed to share. Please try again.', 'error');
        shareBtn.disabled = false;
        document.getElementById('activity-share-btn-text').textContent = 'Share Activity Card';
    }
}
window.shareActivityCardToFeed = shareActivityCardToFeed;

function closeLogActivity() {
    document.getElementById('view-log-activity').style.display = 'none';
    switchAppTab('movement-tab');
}
window.closeLogActivity = closeLogActivity;

function closeActivitySuccess() {
    // Grab activity info for rating before clearing
    const activityName = savedActivityData?.activity_label || savedActivityData?.activity_type || 'Activity';
    const activityId = savedActivityData?.id || null;

    document.getElementById('view-activity-success').style.display = 'none';
    switchAppTab('movement-tab');

    // Show post-workout rating modal for activity
    openWorkoutRatingModal(activityName, 'activity', activityId);
}
window.closeActivitySuccess = closeActivitySuccess;

// ============================================
// END ACTIVITY LOGGING SYSTEM
// ============================================

// Open story upload modal with a pre-loaded image
function openStoryUploadWithImage(file, base64Data, defaultCaption = '') {
    // Store the file for upload
    window.pendingStoryFile = file;
    window.pendingStoryBase64 = base64Data;
    window.pendingStoryType = 'image';

    // Show the story upload modal
    const modal = document.getElementById('story-upload-modal');
    if (modal) {
        modal.style.display = 'flex';
    }

    // Set the preview image
    const previewImage = document.getElementById('story-preview-image');
    const previewVideo = document.getElementById('story-preview-video');
    const placeholder = document.getElementById('story-preview-placeholder');

    if (previewImage) {
        previewImage.src = base64Data;
        previewImage.style.display = 'block';
    }
    if (previewVideo) previewVideo.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';

    // Set default caption
    const captionInput = document.getElementById('story-caption-input');
    if (captionInput) {
        captionInput.value = defaultCaption;
    }

    // Enable the upload button
    const uploadBtn = document.getElementById('story-upload-button');
    if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = '1';
    }
}

// Handle story file selection (from file picker)
function handleStoryFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const reader = new FileReader();

    reader.onload = function(e) {
        const base64Data = e.target.result;
        window.pendingStoryFile = file;
        window.pendingStoryBase64 = base64Data;
        window.pendingStoryType = isVideo ? 'video' : 'image';

        // Show preview
        const previewImage = document.getElementById('story-preview-image');
        const previewVideo = document.getElementById('story-preview-video');
        const placeholder = document.getElementById('story-preview-placeholder');

        if (isVideo) {
            if (previewVideo) {
                previewVideo.src = base64Data;
                previewVideo.style.display = 'block';
            }
            if (previewImage) previewImage.style.display = 'none';
        } else {
            if (previewImage) {
                previewImage.src = base64Data;
                previewImage.style.display = 'block';
            }
            if (previewVideo) previewVideo.style.display = 'none';
        }
        if (placeholder) placeholder.style.display = 'none';

        // Enable upload button
        const uploadBtn = document.getElementById('story-upload-button');
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.style.opacity = '1';
        }
    };

    reader.readAsDataURL(file);
    event.target.value = ''; // Reset for future selections
}

// Close story upload modal
function closeStoryUploadModal() {
    const modal = document.getElementById('story-upload-modal');
    if (modal) modal.style.display = 'none';

    // Reset state
    window.pendingStoryFile = null;
    window.pendingStoryBase64 = null;
    window.pendingStoryType = null;

    // Reset preview
    const previewImage = document.getElementById('story-preview-image');
    const previewVideo = document.getElementById('story-preview-video');
    const placeholder = document.getElementById('story-preview-placeholder');
    const captionInput = document.getElementById('story-caption-input');
    const uploadBtn = document.getElementById('story-upload-button');

    if (previewImage) { previewImage.src = ''; previewImage.style.display = 'none'; }
    if (previewVideo) { previewVideo.src = ''; previewVideo.style.display = 'none'; }
    if (placeholder) placeholder.style.display = 'flex';
    if (captionInput) captionInput.value = '';
    if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.style.opacity = '0.5'; }
}

// Upload story to database and storage
async function uploadStory() {
    if (!window.pendingStoryFile || !window.pendingStoryBase64) {
        alert('Please select a photo or video first');
        return;
    }

    const uploadBtn = document.getElementById('story-upload-button');
    const captionInput = document.getElementById('story-caption-input');
    const caption = captionInput ? captionInput.value.trim() : '';

    // Disable button and show loading
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
    }

    try {
        const userId = window.currentUser?.id;

        if (!userId) {
            throw new Error('Please sign in to share stories');
        }

        // Compress image if needed
        let fileToUpload = window.pendingStoryFile;
        if (window.pendingStoryType === 'image') {
            fileToUpload = await compressMealImage(window.pendingStoryFile);
        }

        // Check file size - if > 5MB, use Backblaze B2, otherwise use Base64
        const fileSizeMB = fileToUpload.size / (1024 * 1024);
        let mediaUrl;

        if (fileSizeMB > 5) {
            // Upload to Backblaze B2 for larger files
            if (uploadBtn) {
                uploadBtn.textContent = `Uploading ${Math.round(fileSizeMB)}MB...`;
            }

            const tempStoryId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
            const formData = new FormData();
            formData.append('file', fileToUpload);
            formData.append('userId', userId);
            formData.append('storyId', tempStoryId);

            const uploadResponse = await fetch('/api/upload-story-media', {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.error || 'Upload failed');
            }

            const uploadData = await uploadResponse.json();
            mediaUrl = uploadData.url;
        } else {
            // Use Base64 for smaller files (< 5MB)
            mediaUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(fileToUpload);
            });
        }

        // Save story to database
        const storyData = await dbHelpers.stories.create(userId, {
            media_type: window.pendingStoryType || 'image',
            media_url: mediaUrl,
            thumbnail_url: null,
            caption: caption,
            duration: 5
        });

        // Check if this is a verified workout share (from the workout success screen)
        if (window.pendingWorkoutPhotoData?.forPoints) {
            // Award workout point with verified photo data
            await awardWorkoutSharePoint('story', window.pendingWorkoutPhotoData.timestamp, window.pendingWorkoutPhotoData.hash);
            window.pendingWorkoutPhotoData = null; // Clear after use
        } else if (window.pendingStoryType === 'image') {
            // Regular story - analyze for workout points (in background)
            analyzeStoryForPoints(userId, storyData.id, window.pendingStoryBase64);
        }

        // Close modal and show success
        closeStoryUploadModal();
        showToast('Post shared!', 'success');

        // Refresh feed and stories
        if (typeof loadPhotoFeed === 'function') {
            loadPhotoFeed('friends-photo-feed', 'friends-feed-empty');
        }
        if (typeof loadStories === 'function') {
            loadStories();
        }

    } catch (error) {
        console.error('Error uploading story:', error);
        alert('Failed to upload story: ' + (error.message || 'Please try again'));
    } finally {
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Share Post';
        }
    }
}

// Analyze story for workout points
async function analyzeStoryForPoints(userId, storyId, imageBase64) {
    try {
        // Extract base64 data without prefix
        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

        const response = await fetch('/api/analyze-story-points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                storyId,
                imageBase64: base64Data
            })
        });

        const result = await response.json();

        if (result.success && result.pointsAwarded > 0) {
            console.log(`Workout point awarded! Total points: ${result.newTotal}`);
            // Optionally show a toast notification
            if (typeof showToast === 'function') {
                showToast(`+${result.pointsAwarded} point${result.pointsAwarded > 1 ? 's' : ''} for workout story!`, 'success');
            }
        }
    } catch (error) {
        console.error('Error analyzing story for points:', error);
        // Don't alert - this runs in background
    }
}

// Handle workout photo selection
async function handleWorkoutPhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Compress image first to avoid 502 errors on large photos
    capturedWorkoutFile = await compressMealImage(file);

    // Convert compressed image to base64 for preview and analysis
    workoutPhotoBase64 = await fileToBase64(capturedWorkoutFile);

    // Show preview modal
    const previewModal = document.getElementById('workout-preview-modal');
    const previewPhoto = document.getElementById('workout-preview-photo');

    if (previewModal && previewPhoto) {
        previewPhoto.src = workoutPhotoBase64;
        previewModal.style.display = 'flex';
    }

    // Reset file input for future selections
    event.target.value = '';
}

// Close workout preview modal
function closeWorkoutPreviewModal() {
    const previewModal = document.getElementById('workout-preview-modal');
    if (previewModal) {
        previewModal.style.display = 'none';
    }
    capturedWorkoutFile = null;
    workoutPhotoBase64 = null;

    // Hide any loading/error states
    const loading = document.getElementById('workout-photo-loading');
    const error = document.getElementById('workout-photo-error');
    if (loading) loading.style.display = 'none';
    if (error) error.style.display = 'none';
}

// Verify workout photo with Gemini AI
async function verifyWorkoutPhoto() {
    if (!capturedWorkoutFile || !workoutPhotoBase64) {
        alert('No photo captured. Please try again.');
        return;
    }

    const loadingEl = document.getElementById('workout-photo-loading');
    const errorEl = document.getElementById('workout-photo-error');
    const verifyBtn = document.getElementById('workout-verify-btn');

    // Check workout duration first - must be at least 15 minutes for points
    // Try success-duration first (on success screen), then fallback to workout-timer
    const successDurationEl = document.getElementById('success-duration');
    const workoutTimerEl = document.getElementById('workout-timer');
    const durationText = (successDurationEl && successDurationEl.textContent !== '00:00')
        ? successDurationEl.textContent
        : (workoutTimerEl ? workoutTimerEl.textContent : '00:00');
    const [mins, secs] = durationText.split(':').map(Number);
    const totalMinutes = mins + (secs / 60);

    if (totalMinutes < 15) {
        if (errorEl) {
            document.getElementById('workout-photo-error-text').textContent =
                `Workouts need to be at least 15 minutes to earn points. Your workout was ${mins} minute${mins !== 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''}. Keep going next time!`;
            errorEl.style.display = 'block';
        }
        return;
    }

    // Show loading
    if (loadingEl) loadingEl.style.display = 'block';
    if (verifyBtn) verifyBtn.disabled = true;

    try {
        // Get base64 data without prefix
        const base64Data = workoutPhotoBase64.split(',')[1];

        // Call Gemini API to verify workout photo
        const response = await fetch('/api/analyze-workout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                imageBase64: base64Data,
                mimeType: capturedWorkoutFile.type
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to verify workout photo');
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Verification failed');
        }

        const analysisData = result.data;

        // Check if photo is eligible for points
        if (!result.pointsEligible) {
            // Show why it wasn't eligible
            let reason = 'This photo could not be verified as a workout.';
            if (!analysisData.isWorkoutPhoto) {
                reason = 'This doesn\'t appear to be a workout photo. Try taking a photo at the gym, during exercise, or showing workout equipment.';
            } else if (analysisData.confidence === 'low') {
                reason = 'The photo quality or content couldn\'t be clearly verified. Try a clearer photo showing your workout.';
            } else if (analysisData.suspiciousIndicators?.length > 0) {
                reason = 'This photo appears to be a screenshot or stock image. Please take a real photo of your workout.';
            }

            if (errorEl) {
                document.getElementById('workout-photo-error-text').textContent = reason;
                errorEl.style.display = 'block';
            }
            if (loadingEl) loadingEl.style.display = 'none';
            if (verifyBtn) verifyBtn.disabled = false;
            return;
        }

        // Photo verified! Upload and save
        await saveVerifiedWorkoutPhoto(analysisData);

    } catch (error) {
        console.error('Error verifying workout photo:', error);
        if (errorEl) {
            document.getElementById('workout-photo-error-text').textContent = error.message || 'Failed to verify photo. Please try again.';
            errorEl.style.display = 'block';
        }
        if (loadingEl) loadingEl.style.display = 'none';
        if (verifyBtn) verifyBtn.disabled = false;
    }
}

// Save verified workout photo and award points
async function saveVerifiedWorkoutPhoto(analysisData) {
    const loadingEl = document.getElementById('workout-photo-loading');
    const loadingText = document.getElementById('workout-photo-loading-text');

    if (loadingText) loadingText.textContent = 'Saving workout...';

    try {
        const userId = window.currentUser?.id;

        if (!userId) {
            throw new Error('User not authenticated');
        }

        // Upload photo to B2
        const formData = new FormData();
        formData.append('file', capturedWorkoutFile);
        formData.append('userId', userId);

        const uploadResponse = await fetch('/api/upload-workout-photo', {
            method: 'POST',
            body: formData
        });

        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || 'Failed to upload photo');
        }

        const uploadData = await uploadResponse.json();
        const photoUrl = uploadData.url;

        // Generate photo hash for duplicate detection
        const photoHash = await window.db?.points?.generatePhotoHash(workoutPhotoBase64);

        // Save workout photo log to database
        const { data: savedLog, error: saveError } = await window.supabaseClient
            .from('workout_photo_logs')
            .insert({
                user_id: userId,
                photo_url: photoUrl,
                storage_path: uploadData.fileName,
                is_workout_photo: analysisData.isWorkoutPhoto,
                workout_type: analysisData.workoutType,
                detected_elements: analysisData.detectedElements || [],
                suspicious_indicators: analysisData.suspiciousIndicators || [],
                ai_confidence: analysisData.confidence,
                ai_notes: analysisData.notes,
                analysis_timestamp: new Date().toISOString(),
                points_eligible: true,
                photo_hash: photoHash
            })
            .select();

        if (saveError) {
            console.error('Error saving workout photo log:', saveError);
            // Continue anyway - we still want to award points
        }

        // Award points for the verified workout photo
        const workoutLogId = savedLog?.[0]?.id || `workout_photo_${Date.now()}`;
        const photoTimestamp = capturedWorkoutFile.lastModified
            ? new Date(capturedWorkoutFile.lastModified).toISOString()
            : null;

        const pointsResult = await awardPointsForWorkout(
            workoutLogId,
            photoTimestamp,
            analysisData.confidence,
            photoHash
        );

        // Update the saved log with points awarded
        if (savedLog?.[0]?.id && pointsResult?.pointsAwarded) {
            await window.supabaseClient
                .from('workout_photo_logs')
                .update({ points_awarded: pointsResult.pointsAwarded })
                .eq('id', savedLog[0].id);
        }

        // Close modal and show success
        closeWorkoutPreviewModal();

        // Update success screen to show points earned
        const photoSection = document.getElementById('workout-photo-section');
        const pointsAwarded = document.getElementById('workout-points-awarded');

        if (photoSection) photoSection.style.display = 'none';
        if (pointsAwarded) pointsAwarded.style.display = 'block';

        console.log('Workout photo verified and points awarded!', pointsResult);

    } catch (error) {
        console.error('Error saving workout photo:', error);
        const errorEl = document.getElementById('workout-photo-error');
        if (errorEl) {
            document.getElementById('workout-photo-error-text').textContent = error.message || 'Failed to save workout. Please try again.';
            errorEl.style.display = 'block';
        }
        if (loadingEl) loadingEl.style.display = 'none';
        const verifyBtn = document.getElementById('workout-verify-btn');
        if (verifyBtn) verifyBtn.disabled = false;
    }
}

// Upload workout photo to B2 storage
async function uploadWorkoutPhoto(file) {
    const userId = window.currentUser?.id;

    if (!userId) {
        throw new Error('User not authenticated');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);

    const response = await fetch('/api/upload-workout-photo', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload photo');
    }

    const data = await response.json();
    return data.url;
}

// Initialize points widget on dashboard load
document.addEventListener('DOMContentLoaded', function() {
    // Load points widget after a short delay to ensure auth is ready
    setTimeout(loadPointsWidget, 1000);
});
