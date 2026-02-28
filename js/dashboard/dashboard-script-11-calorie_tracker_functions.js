// ==========================================
// CALORIE TRACKER FUNCTIONS
// This file contains functions related to calorie tracking
// ==========================================

let mealCameraSource = 'widget'; // Track where camera was opened from
let mealCameraStream = null; // Camera stream (legacy, no longer used)
let capturedMealFile = null; // Captured meal photo file
let selectedMealType = 'breakfast'; // Default meal type
let selectedInputMethod = null; // 'photo', 'text', or 'voice'
let isRecordingVoice = false;
let speechRecognition = null;

// Auto-detect meal type based on current time
function autoDetectMealType() {
    const hour = new Date().getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour < 21) return 'dinner';
    return 'snack';
}

// Simple text input modal functions
let simpleMealInputInitialized = false;

function selectSimpleMealType(type) {
    selectedMealType = type;
    document.querySelectorAll('.simple-meal-type-bubble').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
}

function selectPhotoMealType(type) {
    selectedMealType = type;
    document.querySelectorAll('.meal-photo-type-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
}

function openMealTextInput(source) {
    console.log('openMealTextInput called, redirecting to new unified input modal');
    openMealInputModal(source);
    
    // Give modal a tiny moment to render, then select 'text' method
    setTimeout(() => {
        if (typeof selectInputMethod === 'function') {
            selectInputMethod('text');
        }
    }, 50);
}

function closeMealTextModal() {
    const modal = document.getElementById('meal-text-modal');
    if (modal) modal.classList.remove('visible');
}

async function submitSimpleMealText() {
    const textarea = document.getElementById('simple-meal-input');
    const submitBtn = document.getElementById('simple-meal-submit');
    
    if (!textarea) {
        console.error('simple-meal-input not found');
        showToast('Text input not available. Please refresh and try again.', 'error');
        return;
    }
    
    const description = textarea.value.trim();

    if (description.length < 3) {
        alert('Please describe what you ate.');
        return;
    }

    // Close modal immediately and show quick confirmation so user can continue
    closeMealTextModal();
    showToast('📝 Analysing your meal in the background...', 'info');

    // Capture meal type before it can be reset
    const capturedMealType = selectedMealType;

    // Run analysis in background — user can keep using the app
    analyzeMealInBackground({
        description: description,
        mealType: capturedMealType,
        inputMethod: 'text',
        saveFn: async (nutritionData) => {
            await saveMealLogWithType({
                foodItems: nutritionData.foodItems,
                totals: nutritionData.totals,
                micronutrients: nutritionData.micronutrients,
                confidence: nutritionData.confidence,
                notes: nutritionData.notes || description,
                mealType: capturedMealType,
                inputMethod: 'text',
                mealDescription: description
            });
        }
    });
}

// Open the meal input modal (primary entry point)
function openMealInputModal(source) {
    mealCameraSource = source || 'widget';
    selectedMealType = autoDetectMealType();
    selectedInputMethod = null;

    // Check if modal exists
    const modal = document.getElementById('meal-input-modal');
    if (!modal) {
        console.error('meal-input-modal not found');
        showToast('Meal input is not available. Please try again.', 'error');
        return;
    }

    // Reset UI state
    const methodsSection = document.getElementById('meal-input-methods');
    const textSection = document.getElementById('meal-text-section');
    const voiceSection = document.getElementById('meal-voice-section');
    const submitSection = document.getElementById('meal-submit-section');

    if (methodsSection) methodsSection.style.display = 'block';
    if (textSection) textSection.classList.remove('visible');
    if (voiceSection) voiceSection.classList.remove('visible');
    if (submitSection) submitSection.classList.remove('visible');

    // Reset text input
    const textInput = document.getElementById('meal-text-input');
    if (textInput) textInput.value = '';

    // Reset voice transcript
    const voiceTranscript = document.getElementById('voice-transcript');
    if (voiceTranscript) {
        voiceTranscript.textContent = 'Your spoken words will appear here...';
        voiceTranscript.dataset.final = '';
        voiceTranscript.classList.add('empty');
    }

    // Hide delete button
    const deleteBtn = document.getElementById('voice-transcript-delete');
    if (deleteBtn) deleteBtn.style.display = 'none';

    // Update meal type selection UI
    document.querySelectorAll('.meal-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === selectedMealType);
    });

    // Update submit button state
    updateSubmitButtonState();

    // Hide Spotify mini player during meal flow
    const spotifyMini = document.getElementById('spotify-now-playing');
    if (spotifyMini) spotifyMini.style.display = 'none';

    // Show modal
    if (modal) modal.classList.add('visible');
}

// Close meal input modal
function closeMealInputModal() {
    const modal = document.getElementById('meal-input-modal');
    if (modal) modal.classList.remove('visible');

    // Stop voice recording if active
    if (isRecordingVoice && speechRecognition) {
        speechRecognition.stop();
        isRecordingVoice = false;
    }

    // Restore Spotify mini player if music is playing and no other meal flow is active
    if (window._snpPlaying && !isMealFlowActive()) {
        const spotifyMini = document.getElementById('spotify-now-playing');
        if (spotifyMini) spotifyMini.style.display = 'block';
    }
}

// Select meal type
function selectMealType(type) {
    selectedMealType = type;
    document.querySelectorAll('.meal-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
}

// Select input method
function selectInputMethod(method) {
    selectedInputMethod = method;

    const methodsSection = document.getElementById('meal-input-methods');
    const textSection = document.getElementById('meal-text-section');
    const voiceSection = document.getElementById('meal-voice-section');
    const submitSection = document.getElementById('meal-submit-section');

    if (method === 'photo') {
        // Close modal and open camera
        closeMealInputModal();
        openMealCameraDirect(mealCameraSource);
    } else if (method === 'text') {
        // Show text input
        if (methodsSection) methodsSection.style.display = 'none';
        if (textSection) textSection.classList.add('visible');
        if (voiceSection) voiceSection.classList.remove('visible');
        if (submitSection) submitSection.classList.add('visible');

        // Focus text input
        setTimeout(() => {
            const textInput = document.getElementById('meal-text-input');
            if (textInput) textInput.focus();
        }, 100);
    } else if (method === 'voice') {
        // Show voice input
        if (methodsSection) methodsSection.style.display = 'none';
        if (textSection) textSection.classList.remove('visible');
        if (voiceSection) voiceSection.classList.add('visible');
        if (submitSection) submitSection.classList.add('visible');

        // Check for speech recognition support
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('Voice input is not supported in your browser. Please use Chrome or Safari.');
            selectInputMethod('text');
        }
    }

    updateSubmitButtonState();
}

// Update submit button state
function updateSubmitButtonState() {
    const submitBtn = document.getElementById('meal-submit-btn');
    if (!submitBtn) return;

    let hasContent = false;

    if (selectedInputMethod === 'text') {
        const textInput = document.getElementById('meal-text-input');
        hasContent = textInput && textInput.value.trim().length >= 3;
    } else if (selectedInputMethod === 'voice') {
        const voiceTranscript = document.getElementById('voice-transcript');
        hasContent = voiceTranscript && !voiceTranscript.classList.contains('empty') && voiceTranscript.textContent.trim().length >= 3;
    }

    submitBtn.disabled = !hasContent;
}

// Toggle voice recording
function toggleVoiceRecording() {
    if (isRecordingVoice) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

// Start voice recording
function startVoiceRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Voice input is not supported in your browser.');
        return;
    }

    // On native Android, request microphone permission before starting speech recognition
    // so the native "Allow microphone?" dialog appears instead of a silent denial.
    if (window.NativePermissions && typeof window.NativePermissions.hasMicrophonePermission === 'function') {
        if (!window.NativePermissions.hasMicrophonePermission()) {
            const statusText = document.getElementById('voice-status');
            if (statusText) statusText.textContent = 'Requesting microphone access...';
            // Set up callback for when permission result comes back
            window._onNativeMicrophonePermission = function(granted) {
                window._onNativeMicrophonePermission = null;
                if (granted) {
                    startVoiceRecording();
                } else {
                    if (statusText) statusText.textContent = 'Microphone access denied. Tap here to open Settings.';
                    if (statusText) statusText.style.cursor = 'pointer';
                    if (statusText) statusText.onclick = () => window.NativePermissions.openAppSettings();
                }
            };
            window.NativePermissions.requestMicrophonePermission();
            return;
        }
    }

    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'en-US';

    const recordBtn = document.getElementById('voice-record-btn');
    const statusText = document.getElementById('voice-status');
    const transcript = document.getElementById('voice-transcript');

    speechRecognition.onstart = function() {
        isRecordingVoice = true;
        if (recordBtn) recordBtn.classList.add('recording');
        if (statusText) statusText.textContent = 'Listening... Tap to stop';
        if (transcript) {
            transcript.textContent = '';
            transcript.dataset.final = '';
            transcript.classList.remove('empty');
        }
    };

    speechRecognition.onresult = function(event) {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
                finalTranscript += result[0].transcript;
            } else {
                interimTranscript += result[0].transcript;
            }
        }

        if (transcript) {
            const currentFinal = transcript.dataset.final || '';
            transcript.dataset.final = currentFinal + finalTranscript;
            transcript.textContent = transcript.dataset.final + interimTranscript;

            // Show delete button and remove empty state when there's content
            if (transcript.textContent.trim().length > 0) {
                transcript.classList.remove('empty');
                const deleteBtn = document.getElementById('voice-transcript-delete');
                if (deleteBtn) deleteBtn.style.display = 'block';
            }
        }

        updateSubmitButtonState();
    };

    speechRecognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        if (statusText) {
            if (event.error === 'not-allowed') {
                statusText.textContent = 'Microphone access denied. Please enable it in settings.';
            } else {
                statusText.textContent = 'Error: ' + event.error + '. Tap to try again.';
            }
        }
        stopVoiceRecording();
    };

    speechRecognition.onend = function() {
        stopVoiceRecording();
    };

    try {
        speechRecognition.start();
    } catch (e) {
        console.error('Failed to start speech recognition:', e);
        alert('Failed to start voice input. Please check microphone permissions.');
    }
}

// Stop voice recording
function stopVoiceRecording() {
    if (speechRecognition) {
        try {
            speechRecognition.stop();
        } catch (e) {
            console.log('Speech recognition already stopped');
        }
    }

    isRecordingVoice = false;

    const recordBtn = document.getElementById('voice-record-btn');
    const statusText = document.getElementById('voice-status');
    const transcript = document.getElementById('voice-transcript');

    if (recordBtn) recordBtn.classList.remove('recording');
    if (statusText) statusText.textContent = 'Tap the microphone to record again';

    // Check if we got any content
    if (transcript && (!transcript.textContent || transcript.textContent.trim().length === 0)) {
        transcript.textContent = 'Your spoken words will appear here...';
        transcript.classList.add('empty');
    }

    updateSubmitButtonState();
}

// Clear voice transcript
function clearVoiceTranscript() {
    const transcript = document.getElementById('voice-transcript');
    const deleteBtn = document.getElementById('voice-transcript-delete');
    const statusText = document.getElementById('voice-status');

    if (transcript) {
        transcript.textContent = 'Your spoken words will appear here...';
        transcript.dataset.final = '';
        transcript.classList.add('empty');
    }

    if (deleteBtn) {
        deleteBtn.style.display = 'none';
    }

    if (statusText) {
        statusText.textContent = 'Tap the microphone and describe your meal';
    }

    updateSubmitButtonState();
}

// Submit meal description (text or voice)
async function submitMealDescription() {
    let description = '';

    if (selectedInputMethod === 'text') {
        const textInput = document.getElementById('meal-text-input');
        description = textInput ? textInput.value.trim() : '';
    } else if (selectedInputMethod === 'voice') {
        const voiceTranscript = document.getElementById('voice-transcript');
        description = voiceTranscript ? voiceTranscript.textContent.trim() : '';
    }

    if (description.length < 3) {
        alert('Please describe what you ate.');
        return;
    }

    // Capture values before closing (modal resets them)
    const capturedMealType = selectedMealType;
    const capturedInputMethod = selectedInputMethod;

    // Close modal immediately so user can continue using the app
    closeMealInputModal();
    showToast('📝 Analysing your meal in the background...', 'info');

    // Run analysis in background
    analyzeMealInBackground({
        description: description,
        mealType: capturedMealType,
        inputMethod: capturedInputMethod,
        saveFn: async (nutritionData) => {
            await saveMealLogWithType({
                foodItems: nutritionData.foodItems,
                totals: nutritionData.totals,
                micronutrients: nutritionData.micronutrients,
                confidence: nutritionData.confidence,
                notes: nutritionData.notes,
                mealType: capturedMealType,
                inputMethod: capturedInputMethod,
                mealDescription: description
            });
        }
    });
}

// ========== Recent Meals Feature ==========

// Track which recent meal is currently selected for confirm step
let _selectedRecentMealIndex = null;

// Open the recent meals modal and load data
async function openRecentMealsModal() {
    const modal = document.getElementById('recent-meals-modal');
    if (modal) modal.classList.add('visible');
    showRecentMealsList();
    await loadRecentMeals();
}

// Close the recent meals modal
function closeRecentMealsModal() {
    const modal = document.getElementById('recent-meals-modal');
    if (modal) modal.classList.remove('visible');
    _selectedRecentMealIndex = null;
}

// Toggle between the list view and the confirm view
function showRecentMealsList() {
    const list = document.getElementById('recent-meals-list');
    const confirm = document.getElementById('recent-meal-confirm');
    const title = document.getElementById('recent-meals-title');
    if (list) list.style.display = '';
    if (confirm) confirm.classList.remove('active');
    if (title) title.textContent = 'Recent Meals';
    _selectedRecentMealIndex = null;
}

function showRecentMealConfirm(index) {
    const meal = window._recentMealsData && window._recentMealsData[index];
    if (!meal) return;

    _selectedRecentMealIndex = index;

    const foodNames = getRecentMealName(meal);
    const cal = Math.round(meal.calories || 0);
    const protein = Math.round(meal.protein_g || 0);
    const carbs = Math.round(meal.carbs_g || 0);
    const fat = Math.round(meal.fat_g || 0);

    const nameEl = document.getElementById('recent-meal-confirm-name');
    const macrosEl = document.getElementById('recent-meal-confirm-macros');
    if (nameEl) nameEl.textContent = foodNames;
    if (macrosEl) macrosEl.textContent = cal + ' cal \u00B7 P: ' + protein + 'g \u00B7 C: ' + carbs + 'g \u00B7 F: ' + fat + 'g';

    const list = document.getElementById('recent-meals-list');
    const confirm = document.getElementById('recent-meal-confirm');
    const title = document.getElementById('recent-meals-title');
    if (list) list.style.display = 'none';
    if (confirm) confirm.classList.add('active');
    if (title) title.textContent = 'Add Meal';
}

// Helper to get display name for a meal
function getRecentMealName(meal) {
    if (Array.isArray(meal.food_items) && meal.food_items.length > 0) {
        return meal.food_items.map(function(item) { return item.name; }).join(', ');
    }
    return meal.meal_description || 'Meal';
}

// Load recent meals from the database (unique meals from last 30 days)
async function loadRecentMeals() {
    var listEl = document.getElementById('recent-meals-list');
    if (!listEl) return;

    listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);">Loading recent meals...</div>';

    try {
        if (!window.supabaseClient) return;
        var userId = window.currentUser?.id;
        if (!userId) return;

        var thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        var sinceDate = getLocalDateString(thirtyDaysAgo);

        var { data: meals, error } = await window.supabaseClient
            .from('meal_logs')
            .select('food_items, calories, protein_g, carbs_g, fat_g, fiber_g, micronutrients, meal_description, photo_url, meal_type, notes')
            .eq('user_id', userId)
            .gte('meal_date', sinceDate)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Error loading recent meals:', error);
            listEl.innerHTML = '<div class="recent-meals-empty"><p>Could not load recent meals.</p></div>';
            return;
        }

        if (!meals || meals.length === 0) {
            listEl.innerHTML = '<div class="recent-meals-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><p>No recent meals yet.<br><span style="font-size:0.85rem;">Your logged meals will appear here.</span></p></div>';
            return;
        }

        var uniqueMeals = deduplicateRecentMeals(meals);
        renderRecentMealsList(listEl, uniqueMeals);

    } catch (err) {
        console.error('Error in loadRecentMeals:', err);
        listEl.innerHTML = '<div class="recent-meals-empty"><p>Something went wrong.</p></div>';
    }
}

// Deduplicate by sorted food item names
function deduplicateRecentMeals(meals) {
    var seen = new Map();
    for (var i = 0; i < meals.length; i++) {
        var key = getMealKey(meals[i]);
        if (!seen.has(key)) seen.set(key, meals[i]);
    }
    return Array.from(seen.values());
}

function getMealKey(meal) {
    if (Array.isArray(meal.food_items) && meal.food_items.length > 0) {
        return meal.food_items.map(function(item) { return (item.name || '').toLowerCase().trim(); }).sort().join('|');
    }
    if (meal.meal_description) return meal.meal_description.toLowerCase().trim();
    return 'meal-' + meal.calories + '-' + meal.protein_g;
}

// Render the list of recent meals
function renderRecentMealsList(container, meals) {
    if (!meals || meals.length === 0) {
        container.innerHTML = '<div class="recent-meals-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><p>No recent meals yet.<br><span style="font-size:0.85rem;">Your logged meals will appear here.</span></p></div>';
        return;
    }

    var html = '';
    for (var i = 0; i < meals.length; i++) {
        var meal = meals[i];
        var foodNames = getRecentMealName(meal);
        var cal = Math.round(meal.calories || 0);
        var protein = Math.round(meal.protein_g || 0);
        var carbs = Math.round(meal.carbs_g || 0);
        var fat = Math.round(meal.fat_g || 0);

        var hasPhoto = meal.photo_url && meal.photo_url.trim() !== '' && meal.photo_url !== 'text-input';
        var iconHtml = hasPhoto
            ? '<div class="recent-meal-icon"><img src="' + meal.photo_url + '" alt="" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML=\'&#127869;\'"></div>'
            : '<div class="recent-meal-icon">&#127869;</div>';

        html += '<div class="recent-meal-item" onclick="showRecentMealConfirm(' + i + ')">'
            + iconHtml
            + '<div class="recent-meal-info">'
            + '<div class="recent-meal-name">' + foodNames + '</div>'
            + '<div class="recent-meal-macros">' + cal + ' cal &middot; P: ' + protein + 'g &middot; C: ' + carbs + 'g &middot; F: ' + fat + 'g</div>'
            + '</div>'
            + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" style="flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg>'
            + '</div>';
    }

    container.innerHTML = html;
    window._recentMealsData = meals;
}

function openCameraWithCallback(callback) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.capture = 'environment';
    fileInput.style.display = 'none';
    let hasProcessedFile = false;
    fileInput.onchange = function(e) {
        if (hasProcessedFile) return;
        hasProcessedFile = true;
        const file = e.target.files[0];
        callback(file);
    };
    // For iOS Safari compatibility
    document.body.appendChild(fileInput);
    fileInput.click();
    setTimeout(() => { document.body.removeChild(fileInput); }, 100);
}

// "Add with Photo" — opens camera, uploads photo, saves meal + awards XP
function recentMealAddWithPhoto() {
    var meal = window._recentMealsData && window._recentMealsData[_selectedRecentMealIndex];
    if (!meal) return;

    // Close modal
    closeRecentMealsModal();

    // Open getUserMedia camera instead of file input (which opens gallery in Capacitor WebView)
    openCameraWithCallback(async function(file) {
        if (!file || !file.type.startsWith('image/')) {
            showToast('No valid photo taken. Meal not added.', 'error');
            return;
        }

        showToast('Uploading photo and saving meal...', 'info');

        try {
            // Compress the photo before uploading (phone photos can be 5-15MB)
            var compressedFile = await compressMealImage(file);

            // Upload the photo
            var photoUrl = await uploadMealPhoto(compressedFile);

            // Save the meal with the photo URL
            var mealType = typeof autoDetectMealType === 'function' ? autoDetectMealType() : 'snack';
            if (typeof selectedMealType !== 'undefined') {
                selectedMealType = mealType;
            }

            var savedMeal = await saveMealLog({
                photoUrl: photoUrl,
                foodItems: meal.food_items || [],
                totals: {
                    calories: parseFloat(meal.calories) || 0,
                    protein_g: parseFloat(meal.protein_g) || 0,
                    carbs_g: parseFloat(meal.carbs_g) || 0,
                    fat_g: parseFloat(meal.fat_g) || 0,
                    fiber_g: parseFloat(meal.fiber_g) || 0
                },
                micronutrients: meal.micronutrients || {},
                confidence: 'high',
                notes: meal.notes || getRecentMealName(meal),
                mealType: mealType
            });

            // Award XP points since there's a photo
            if (savedMeal && savedMeal[0]?.id) {
                try {
                    var photoTimestamp = file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString();
                    var base64ForHash = null;
                    if (typeof fileToBase64 === 'function') {
                        base64ForHash = await fileToBase64(file);
                    }
                    var photoHash = null;
                    if (window.db?.points?.generatePhotoHash && base64ForHash) {
                        photoHash = await window.db.points.generatePhotoHash(base64ForHash);
                    }
                    if (typeof awardPointsForMeal === 'function') {
                        await awardPointsForMeal(savedMeal[0].id, photoTimestamp, 'high', photoHash);
                    }
                } catch (pointsErr) {
                    console.error('Error awarding points (meal still saved):', pointsErr);
                }
            }

            if (typeof recalculateDailyNutrition === 'function') await recalculateDailyNutrition();
            if (typeof loadTodayNutrition === 'function') await loadTodayNutrition();
            try { if (typeof loadMicronutrientInsights === 'function') await loadMicronutrientInsights(); } catch(e) {}
            try { if (typeof checkMealBadges === 'function') checkMealBadges(); } catch(e) {}

            showToast('Meal added with photo! +1 XP', 'success');

        } catch (err) {
            console.error('Error adding recent meal with photo:', err);
            showToast('Failed to add meal: ' + (err.message || 'Please try again.'), 'error');
        }
    }, 'Take a meal photo');
}

// "Quick Add" — saves meal without photo (no XP)
async function recentMealQuickAdd() {
    var meal = window._recentMealsData && window._recentMealsData[_selectedRecentMealIndex];
    if (!meal) return;

    var foodNames = getRecentMealName(meal);

    closeRecentMealsModal();
    showToast('Adding "' + foodNames.substring(0, 40) + '"...', 'info');

    try {
        var mealType = autoDetectMealType();
        selectedMealType = mealType;

        await saveMealLog({
            foodItems: meal.food_items || [],
            totals: {
                calories: parseFloat(meal.calories) || 0,
                protein_g: parseFloat(meal.protein_g) || 0,
                carbs_g: parseFloat(meal.carbs_g) || 0,
                fat_g: parseFloat(meal.fat_g) || 0,
                fiber_g: parseFloat(meal.fiber_g) || 0
            },
            micronutrients: meal.micronutrients || {},
            confidence: 'high',
            notes: meal.notes || foodNames,
            mealType: mealType
        });

        await recalculateDailyNutrition();
        await loadTodayNutrition();
        try { await loadMicronutrientInsights(); } catch(e) {}
        try { if (typeof checkMealBadges === 'function') checkMealBadges(); } catch(e) {}

        showToast('"' + foodNames.substring(0, 30) + '" added!', 'success');

    } catch (err) {
        console.error('Error quick-adding recent meal:', err);
        showToast('Failed to add meal. Please try again.', 'error');
    }
}

// ========== End Recent Meals Feature ==========

// Background meal analysis — fires off the API call and saves results without blocking the UI
async function analyzeMealInBackground({ description, mealType, inputMethod, saveFn }) {
    try {
        showToast('Analyzing your meal...', 'info');
        
        const response = await fetch('/.netlify/functions/analyze-meal-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, mealType })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to analyze meal. Server returned error.');
        }

        const result = await response.json();

        if (!result.success || !result.data) {
            throw new Error('Invalid response from analysis. Please try again.');
        }

        const nutritionData = result.data;

        // Save using the provided save function
        await saveFn(nutritionData);

        // Refresh the UI with new data
        await recalculateDailyNutrition();
        await loadTodayNutrition();

        // Refresh micronutrient bars
        await loadMicronutrientInsights();

        // Check meal badges
        try { if (typeof checkMealBadges === 'function') checkMealBadges(); } catch(e) {}

        // Notify user of success
        showMealAnalysisSuccess(nutritionData);

    } catch (error) {
        console.error('Background meal analysis error:', error);
        showMealAnalysisError(error.message || 'Failed to analyze meal. Please try again.');
    }
}

// Save meal log with meal type and input method
async function saveMealLogWithType(mealData) {
    const userId = window.currentUser?.id;

    if (!userId) {
        throw new Error('User not authenticated');
    }

    const now = new Date();
    const mealDate = getLocalDateString(now);
    const mealTime = now.toTimeString().split(' ')[0];

    const insertData = {
            user_id: userId,
            meal_date: mealDate,
            meal_time: mealTime,
            meal_type: mealData.mealType || selectedMealType,
            food_items: mealData.foodItems,
            calories: mealData.totals.calories,
            protein_g: mealData.totals.protein_g,
            carbs_g: mealData.totals.carbs_g,
            fat_g: mealData.totals.fat_g,
            fiber_g: mealData.totals.fiber_g,
            micronutrients: mealData.micronutrients,
            notes: mealData.notes,
            ai_confidence: mealData.confidence,
            input_method: mealData.inputMethod || 'photo',
            meal_description: mealData.mealDescription || null,
            analysis_timestamp: new Date().toISOString()
    };

    // Always include photo fields — use 'text-input' sentinel when no photo
    // to satisfy any NOT NULL constraint and match existing UI checks
    insertData.photo_url = mealData.photoUrl || 'text-input';
    insertData.storage_path = mealData.photoUrl || 'text-input';

    const { data, error } = await window.supabaseClient
        .from('meal_logs')
        .insert(insertData)
        .select();

    if (error) {
        console.error('Error saving meal log:', error);
        throw error;
    }

    return data;
}

// Add event listener for text input
document.addEventListener('DOMContentLoaded', function() {
    const textInput = document.getElementById('meal-text-input');
    if (textInput) {
        textInput.addEventListener('input', updateSubmitButtonState);
    }

    // Initialize meal reminder settings
    loadMealReminderSettings().then(() => { checkAndShowNotificationStatus(); updateActiveRemindersStatus(); });

    // Check for URL parameters to open meal input modal
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'log') {
        const mealType = urlParams.get('type') || autoDetectMealType();
        const method = urlParams.get('method') || 'photo';

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);

        // Open meal input modal after a short delay for page load
        setTimeout(() => {
            openMealInputModal('notification');
            selectMealType(mealType);
            if (method !== 'photo') {
                selectInputMethod(method);
            }
        }, 500);
    }
});

// Listen for messages from service worker (meal reminder clicks)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'open_meal_input') {
            const mealType = event.data.mealType || autoDetectMealType();
            const action = event.data.action;

            // Open meal input modal
            openMealInputModal('notification');
            selectMealType(mealType);

            // If user clicked the text/describe button, go to text input
            if (action === 'log_text') {
                selectInputMethod('text');
            }
        }
    });
}

// ==========================================
// MEAL REMINDER SETTINGS FUNCTIONS
// ==========================================

// Handle tapping the meal reminders header row to expand/collapse
function toggleMealReminderSection(event) {
    // If the click was on the toggle switch itself, let onchange handle it
    if (event.target.closest('.toggle-switch')) return;
    const toggle = document.getElementById('meal-reminders-toggle');
    const timesContainer = document.getElementById('meal-reminder-times');
    if (!toggle || !timesContainer) return;
    if (toggle.checked) {
        // Reminders are on: toggle the section visibility
        const isVisible = timesContainer.style.display !== 'none';
        timesContainer.style.display = isVisible ? 'none' : 'block';
    } else {
        // Reminders are off: activate the toggle (which will show the section)
        toggle.checked = true;
        toggleMealReminders(true);
    }
}

// Toggle meal reminders on/off
async function toggleMealReminders(enabled) {
    const timesContainer = document.getElementById('meal-reminder-times');
    if (timesContainer) {
        timesContainer.style.display = enabled ? 'block' : 'none';
    }

    // Request notification permission if enabling
    if (enabled) {
        let permissionGranted = false;

        if (window.NativePush && window.NativePush.isNativeApp()) {
            // Native app: use the Java bridge for reliable permission request
            const result = await window.NativePush.requestPermission();
            permissionGranted = (result === 'granted');
            if (!permissionGranted) {
                // Show a nicer dialog with a button to open Settings
                showNotificationBlockedDialog();
                const toggle = document.getElementById('meal-reminders-toggle');
                if (toggle) toggle.checked = false;
                if (timesContainer) timesContainer.style.display = 'none';
                return;
            }
        } else if ('Notification' in window) {
            // Web: use browser Notification API
            const permission = await Notification.requestPermission();
            permissionGranted = (permission === 'granted');
            if (!permissionGranted) {
                alert('Please enable notifications to receive meal reminders.');
                const toggle = document.getElementById('meal-reminders-toggle');
                if (toggle) toggle.checked = false;
                if (timesContainer) timesContainer.style.display = 'none';
                return;
            }
        }

        // Show notification status feedback
        updateNotificationStatusUI(permissionGranted);
    } else {
        // Hiding status when disabled
        updateNotificationStatusUI(false);
    }

    await saveMealReminderSettings();
    updateActiveRemindersStatus();
}

// Update the notification status banner in the meal reminders UI
function updateNotificationStatusUI(granted) {
    const banner = document.getElementById('notification-status-banner');
    if (!banner) return;

    if (granted) {
        banner.style.display = 'block';
        banner.style.background = 'linear-gradient(135deg, #e8f5e9, #f1f8e9)';
        banner.style.border = '1px solid #c8e6c9';
        banner.style.color = '#2e7d32';
        banner.innerHTML = 'Notifications enabled — your FitGotchi will remind you at the times below!';
    } else {
        // Show a warning if the toggle is on but notifications aren't granted
        const toggle = document.getElementById('meal-reminders-toggle');
        if (toggle && toggle.checked) {
            banner.style.display = 'block';
            banner.style.background = 'linear-gradient(135deg, #fff3e0, #ffe0b2)';
            banner.style.border = '1px solid #ffcc80';
            banner.style.color = '#e65100';
            banner.innerHTML = 'Notifications are turned off in your device settings. <span style="text-decoration:underline; cursor:pointer; font-weight:600;" onclick="showNotificationBlockedDialog()">Tap to fix</span>';
        } else {
            banner.style.display = 'none';
        }
    }
}

// Check and display notification status on settings load
async function checkAndShowNotificationStatus() {
    const toggle = document.getElementById('meal-reminders-toggle');
    if (!toggle || !toggle.checked) return;

    if (window.NativePermissions && typeof window.NativePermissions.hasNotificationPermission === 'function') {
        // Use the Java bridge for most accurate Android permission state
        updateNotificationStatusUI(window.NativePermissions.hasNotificationPermission());
    } else if (window.NativePush && window.NativePush.isNativeApp()) {
        const status = await window.NativePush.checkPermission();
        updateNotificationStatusUI(status === 'granted');
    } else if ('Notification' in window) {
        updateNotificationStatusUI(Notification.permission === 'granted');
    }
}

// Show a dialog when notifications are blocked, with a button to open Settings
function showNotificationBlockedDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'notif-blocked-dialog';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10020; display:flex; align-items:center; justify-content:center; animation:fadeIn 0.2s ease-out;';

    overlay.innerHTML = '<div style="background:white; border-radius:16px; padding:24px; margin:20px; max-width:320px; width:100%; text-align:center; box-shadow:0 8px 32px rgba(0,0,0,0.2);">'
        + '<div style="width:56px; height:56px; background:linear-gradient(135deg, #fff3e0, #ffe0b2); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">'
        + '<svg viewBox="0 0 24 24" style="width:28px; height:28px; fill:#f57c00;"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>'
        + '</div>'
        + '<h3 style="margin:0 0 8px; font-size:1.1rem; color:#1a1a1a;">Notifications Blocked</h3>'
        + '<p style="margin:0 0 16px; font-size:0.85rem; color:#666; line-height:1.5;">To receive meal reminders, you need to allow notifications in your device settings.</p>'
        + '<button id="notif-open-settings-btn" style="width:100%; padding:10px 16px; border-radius:8px; border:none; background:var(--primary); color:white; font-weight:600; font-size:0.9rem; cursor:pointer; margin-bottom:8px;">Open Settings</button>'
        + '<button onclick="document.getElementById(\'notif-blocked-dialog\').remove()" style="width:100%; padding:10px 16px; border-radius:8px; border:1px solid #ddd; background:transparent; color:#666; font-weight:500; font-size:0.9rem; cursor:pointer;">Cancel</button>'
        + '</div>';

    document.body.appendChild(overlay);

    // Wire up the "Open Settings" button
    document.getElementById('notif-open-settings-btn').onclick = function() {
        if (window.NativePermissions && window.NativePermissions.openAppSettings) {
            window.NativePermissions.openAppSettings();
        } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            window.Capacitor.Plugins.App.openUrl({ url: 'app-settings:' }).catch(function() {});
        }
        overlay.remove();
    };

    // Dismiss on backdrop tap
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.remove();
    });
}

// Listen for notification permission changes when the app resumes from Settings.
// The Java bridge calls window._onPermissionRecheck(bool) in onResume().
window._onPermissionRecheck = function(notifEnabled) {
    // Update the meal reminder UI if the toggle is on
    var toggle = document.getElementById('meal-reminders-toggle');
    if (toggle && toggle.checked) {
        updateNotificationStatusUI(notifEnabled);
        if (notifEnabled) {
            updateActiveRemindersStatus();
        }
    }

    // Update permissions modal buttons if visible
    var permModal = document.getElementById('native-permissions-modal');
    if (permModal && permModal.style.display !== 'none') {
        updatePermBtn('notif', notifEnabled ? 'granted' : 'denied');

        // Also recheck camera and microphone when returning from app settings,
        // since the user may have toggled those in device settings too.
        // Use getUserMedia probes that resolve quickly without showing OS dialogs
        // (permission is already decided at this point).
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(function(s) { s.getTracks().forEach(function(t){t.stop();}); updatePermBtn('camera', 'granted'); })
            .catch(function() {
                var camBtn = document.getElementById('perm-btn-camera');
                if (camBtn && (camBtn.classList.contains('requesting-btn') || camBtn.classList.contains('denied-btn'))) {
                    updatePermBtn('camera', 'denied');
                }
            });
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function(s) { s.getTracks().forEach(function(t){t.stop();}); updatePermBtn('mic', 'granted'); })
            .catch(function() {
                var micBtn = document.getElementById('perm-btn-mic');
                if (micBtn && (micBtn.classList.contains('requesting-btn') || micBtn.classList.contains('denied-btn'))) {
                    updatePermBtn('mic', 'denied');
                }
            });
    }
};

// Recheck health permission when the app resumes (e.g. after returning from
// Health Connect). Called by the Java bridge in onResume().
window._recheckHealthPermission = async function() {
    var permModal = document.getElementById('native-permissions-modal');
    if (!permModal || permModal.style.display === 'none') return;

    // Use the lightweight probe (queries steps) instead of init() which
    // calls requestAuthorization() and may re-open the Health Connect UI
    try {
        if (window.NativeHealth) {
            var ok = typeof window.NativeHealth.checkPermission === 'function'
                ? await window.NativeHealth.checkPermission()
                : await window.NativeHealth.init();
            if (ok) {
                updatePermBtn('health', 'granted');
                return;
            }
        }
    } catch (e) {
        console.log('[Permissions] Health recheck:', e);
    }
    // User returned without granting — reset from "requesting" to allow retry
    var btn = document.getElementById('perm-btn-health');
    if (btn && btn.classList.contains('requesting-btn')) {
        updatePermBtn('health', 'denied');
    }
};

// Recheck location permission when the app resumes (e.g. after returning
// from device Settings). Called by the Java bridge in onResume().
window._recheckLocationPermission = function(locationEnabled) {
    var permModal = document.getElementById('native-permissions-modal');
    if (permModal && permModal.style.display !== 'none') {
        updatePermBtn('location', locationEnabled ? 'granted' : 'denied');
    }
};

// Comprehensive recheck of all permissions when returning from app settings.
// Called by the Java bridge in onResume() alongside the individual rechecks.
window._recheckAllPermissions = function() {
    var permModal = document.getElementById('native-permissions-modal');
    if (!permModal || permModal.style.display === 'none') return;

    // Notification
    if (window.NativePermissions && typeof window.NativePermissions.hasNotificationPermission === 'function') {
        updatePermBtn('notif', window.NativePermissions.hasNotificationPermission() ? 'granted' : 'denied');
    }
    // Location
    if (window.NativePermissions && typeof window.NativePermissions.hasLocationPermission === 'function') {
        updatePermBtn('location', window.NativePermissions.hasLocationPermission() ? 'granted' : 'denied');
    }
    // Camera probe
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(function(s) { s.getTracks().forEach(function(t){t.stop();}); updatePermBtn('camera', 'granted'); })
        .catch(function() {
            var camBtn = document.getElementById('perm-btn-camera');
            if (camBtn && !camBtn.classList.contains('granted-btn')) updatePermBtn('camera', 'denied');
        });
    // Microphone probe
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function(s) { s.getTracks().forEach(function(t){t.stop();}); updatePermBtn('mic', 'granted'); })
        .catch(function() {
            var micBtn = document.getElementById('perm-btn-mic');
            if (micBtn && !micBtn.classList.contains('granted-btn')) updatePermBtn('mic', 'denied');
        });
    // Health — delegate to the existing recheck
    if (typeof window._recheckHealthPermission === 'function') {
        window._recheckHealthPermission();
    }
};

// Check if error indicates missing table (table not created yet)
function isMealReminderTableMissing(error) {
    if (!error) return false;
    // PGRST116 = no rows found (not a missing table error)
    // PGRST205 = relation not found in schema cache (PostgREST error)
    // 42P01 = relation does not exist (PostgreSQL error)
    return error.code === 'PGRST205' || error.code === '42P01' ||
           error.message?.includes('relation') ||
           error.message?.includes('does not exist') ||
           error.message?.includes('Could not find the table');
}

// Apply meal reminder settings to UI
function applyMealReminderSettingsToUI(data) {
    const toggle = document.getElementById('meal-reminders-toggle');
    const timesContainer = document.getElementById('meal-reminder-times');

    if (toggle) toggle.checked = data.reminders_enabled;
    if (timesContainer) {
        timesContainer.style.display = data.reminders_enabled ? 'block' : 'none';
    }

    // Set checkbox states
    const breakfastCheck = document.getElementById('breakfast-reminder-check');
    const lunchCheck = document.getElementById('lunch-reminder-check');
    const dinnerCheck = document.getElementById('dinner-reminder-check');

    if (breakfastCheck) breakfastCheck.checked = data.breakfast_reminder;
    if (lunchCheck) lunchCheck.checked = data.lunch_reminder;
    if (dinnerCheck) dinnerCheck.checked = data.dinner_reminder;

    // Set time inputs (convert from time to HH:MM format)
    const breakfastTime = document.getElementById('breakfast-reminder-time');
    const lunchTime = document.getElementById('lunch-reminder-time');
    const dinnerTime = document.getElementById('dinner-reminder-time');

    if (breakfastTime && data.breakfast_time) {
        breakfastTime.value = data.breakfast_time.substring(0, 5);
    }
    if (lunchTime && data.lunch_time) {
        lunchTime.value = data.lunch_time.substring(0, 5);
    }
    if (dinnerTime && data.dinner_time) {
        dinnerTime.value = data.dinner_time.substring(0, 5);
    }
}

// Load meal reminder settings from localStorage (fallback)
function loadMealReminderSettingsFromLocalStorage() {
    const saved = localStorage.getItem('meal_reminder_settings');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            applyMealReminderSettingsToUI(data);
            return true;
        } catch (e) {
            console.error('Error parsing localStorage meal reminder settings:', e);
        }
    }
    return false;
}

// Save meal reminder settings to localStorage (fallback)
function saveMealReminderSettingsToLocalStorage(settings) {
    try {
        localStorage.setItem('meal_reminder_settings', JSON.stringify(settings));
        console.log('Meal reminder settings saved to localStorage');
        return true;
    } catch (e) {
        console.error('Error saving meal reminder settings to localStorage:', e);
        return false;
    }
}

// Load meal reminder settings from database
async function loadMealReminderSettings() {
    try {
        const user = await window.supabaseClient?.auth?.getUser();
        const userId = user?.data?.user?.id;
        if (!userId) {
            // Not logged in, try localStorage
            loadMealReminderSettingsFromLocalStorage();
            return;
        }

        const { data, error } = await window.supabaseClient
            .from('meal_reminder_preferences')
            .select('*')
            .eq('user_id', userId)
            .single();

        // If table doesn't exist, fall back to localStorage
        if (isMealReminderTableMissing(error)) {
            console.log('Meal reminder table not found, using localStorage fallback');
            loadMealReminderSettingsFromLocalStorage();
            return;
        }

        // PGRST116 = no rows found (expected for new users)
        if (error && error.code !== 'PGRST116') {
            console.error('Error loading meal reminder settings:', error);
            // Try localStorage as fallback
            loadMealReminderSettingsFromLocalStorage();
            return;
        }

        if (data) {
            applyMealReminderSettingsToUI(data);
            // Schedule local notifications on native app
            if (window.NativePush && typeof window.NativePush.scheduleMealReminders === 'function') {
                window.NativePush.scheduleMealReminders(data);
            }
        } else {
            // No DB data, try localStorage
            loadMealReminderSettingsFromLocalStorage();
        }
    } catch (e) {
        console.error('Error loading meal reminder settings:', e);
        // Try localStorage as fallback
        loadMealReminderSettingsFromLocalStorage();
    }
}

// Save meal reminder settings to database
async function saveMealReminderSettings() {
    // Get current UI values
    const remindersEnabled = document.getElementById('meal-reminders-toggle')?.checked || false;
    const breakfastEnabled = document.getElementById('breakfast-reminder-check')?.checked || false;
    const lunchEnabled = document.getElementById('lunch-reminder-check')?.checked || false;
    const dinnerEnabled = document.getElementById('dinner-reminder-check')?.checked || false;

    const breakfastTime = document.getElementById('breakfast-reminder-time')?.value || '08:00';
    const lunchTime = document.getElementById('lunch-reminder-time')?.value || '12:30';
    const dinnerTime = document.getElementById('dinner-reminder-time')?.value || '18:30';

    // Get user's timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const settings = {
        reminders_enabled: remindersEnabled,
        breakfast_reminder: breakfastEnabled,
        lunch_reminder: lunchEnabled,
        dinner_reminder: dinnerEnabled,
        breakfast_time: breakfastTime + ':00',
        lunch_time: lunchTime + ':00',
        dinner_time: dinnerTime + ':00',
        timezone: timezone,
        updated_at: new Date().toISOString()
    };

    // Always save to localStorage as backup
    saveMealReminderSettingsToLocalStorage(settings);

    try {
        const user = await window.supabaseClient?.auth?.getUser();
        const userId = user?.data?.user?.id;
        if (!userId) {
            // Not logged in, localStorage save is sufficient
            return;
        }

        // Add user_id for database save
        const dbSettings = { ...settings, user_id: userId };

        const { error } = await window.supabaseClient
            .from('meal_reminder_preferences')
            .upsert(dbSettings, { onConflict: 'user_id' });

        // If table doesn't exist, localStorage fallback is already done
        if (isMealReminderTableMissing(error)) {
            console.log('Meal reminder table not found, settings saved to localStorage only');
            return;
        }

        if (error) {
            console.error('Error saving meal reminder settings to database:', error);
        } else {
            console.log('Meal reminder settings saved to database');
        }
    } catch (e) {
        console.error('Error saving meal reminder settings:', e);
        // localStorage save already done above
    }

    // Schedule local notifications on native app
    if (window.NativePush && typeof window.NativePush.scheduleMealReminders === 'function') {
        window.NativePush.scheduleMealReminders(settings);
    }
}

// Save meal reminders with confirmation popup
async function saveAndConfirmMealReminders() {
    const btn = document.getElementById('save-meal-reminders-btn');
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:white; animation:spin 1s linear infinite;"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Saving...';
    }

    await saveMealReminderSettings();

    // Build confirmation message based on enabled meals
    const breakfastOn = document.getElementById('breakfast-reminder-check')?.checked;
    const lunchOn = document.getElementById('lunch-reminder-check')?.checked;
    const dinnerOn = document.getElementById('dinner-reminder-check')?.checked;

    const breakfastTime = document.getElementById('breakfast-reminder-time')?.value || '08:00';
    const lunchTime = document.getElementById('lunch-reminder-time')?.value || '12:30';
    const dinnerTime = document.getElementById('dinner-reminder-time')?.value || '18:30';

    function formatTime(t) {
        const [h, m] = t.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour % 12 || 12;
        return h12 + ':' + m + ' ' + ampm;
    }

    const meals = [];
    if (breakfastOn) meals.push('Breakfast at ' + formatTime(breakfastTime));
    if (lunchOn) meals.push('Lunch at ' + formatTime(lunchTime));
    if (dinnerOn) meals.push('Dinner at ' + formatTime(dinnerTime));

    // Restore button
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:white;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Save Reminders';
    }

    // Show confirmation popup
    const overlay = document.createElement('div');
    overlay.id = 'meal-reminder-confirmation';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10020; display:flex; align-items:center; justify-content:center; animation:fadeIn 0.2s ease-out;';

    const mealListHTML = meals.length > 0
        ? meals.map(function(m) { return '<div style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:0.88rem; color:#333;"><svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:#22c55e; flex-shrink:0;"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>' + m + '</div>'; }).join('')
        : '<div style="padding:6px 0; font-size:0.88rem; color:#666;">No meals selected for reminders</div>';

    overlay.innerHTML = '<div style="background:white; border-radius:16px; padding:24px; margin:20px; max-width:320px; width:100%; text-align:center; box-shadow:0 8px 32px rgba(0,0,0,0.2); animation:fadeInUp 0.3s ease-out;">'
        + '<div style="width:56px; height:56px; background:linear-gradient(135deg, #e8f5e9, #c8e6c9); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">'
        + '<svg viewBox="0 0 24 24" style="width:28px; height:28px; fill:#22c55e;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
        + '</div>'
        + '<h3 style="margin:0 0 6px; font-size:1.1rem; color:#1a1a1a;">Reminders Saved!</h3>'
        + '<p style="margin:0 0 16px; font-size:0.85rem; color:#666;">You\'ll be reminded for your meals:</p>'
        + '<div style="text-align:left; background:#f8faf8; border-radius:10px; padding:10px 14px; margin-bottom:16px;">'
        + mealListHTML
        + '</div>'
        + '<button onclick="document.getElementById(\'meal-reminder-confirmation\').remove()" style="width:100%; padding:10px 16px; border-radius:8px; border:none; background:var(--primary); color:white; font-weight:600; font-size:0.9rem; cursor:pointer;">Got it!</button>'
        + '</div>';

    document.body.appendChild(overlay);

    // Also dismiss if tapping outside the popup
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.remove();
    });

    // Collapse the reminder settings back after saving
    const timesContainer = document.getElementById('meal-reminder-times');
    if (timesContainer) {
        timesContainer.style.display = 'none';
    }

    // Update the persistent status indicator
    updateActiveRemindersStatus();
}

// Show persistent "Notifications On" status so user always knows what reminders are set
function updateActiveRemindersStatus() {
    const statusDiv = document.getElementById('active-reminders-status');
    const listDiv = document.getElementById('active-reminders-list');
    if (!statusDiv || !listDiv) return;

    const remindersOn = document.getElementById('meal-reminders-toggle')?.checked;
    if (!remindersOn) {
        statusDiv.style.display = 'none';
        return;
    }

    // Check saved settings from localStorage
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('meal_reminder_settings')); } catch(e) {}
    if (!saved) {
        statusDiv.style.display = 'none';
        return;
    }

    function fmtTime(t) {
        if (!t) return '';
        var parts = t.replace(':00', '').split(':');
        var h = parseInt(parts[0]);
        var m = parts[1] || '00';
        var ampm = h >= 12 ? 'PM' : 'AM';
        return (h % 12 || 12) + ':' + m + ' ' + ampm;
    }

    var lines = [];
    if (saved.breakfast_reminder) lines.push('Breakfast at ' + fmtTime(saved.breakfast_time));
    if (saved.lunch_reminder) lines.push('Lunch at ' + fmtTime(saved.lunch_time));
    if (saved.dinner_reminder) lines.push('Dinner at ' + fmtTime(saved.dinner_time));

    if (lines.length === 0) {
        statusDiv.style.display = 'none';
        return;
    }

    listDiv.textContent = 'You will be reminded: ' + lines.join(' \u2022 ');
    statusDiv.style.display = 'block';
}

// Open unified camera for meal photos + barcode scanning
function openMealCameraDirect(source) {
    console.log('openMealCameraDirect called from:', source);
    mealCameraSource = source || 'widget';
    openUnifiedCamera();
}

// Keep original function name for backwards compatibility but redirect to new modal
function openMealCamera(source) {
    console.log('openMealCamera called - opening input modal');
    // Now opens the new meal input modal instead of directly opening camera
    openMealInputModal(source);
}

// Legacy camera function - kept for compatibility but no longer used directly
function _legacyOpenMealCamera(source) {
    console.log('_legacyOpenMealCamera called from:', source);
    mealCameraSource = source || 'widget';

    // Create file input to trigger native camera
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.capture = 'environment'; // Opens native camera app
    fileInput.style.display = 'none';

    let hasProcessedFile = false;

    fileInput.onchange = function(e) {
        if (hasProcessedFile) return; // Prevent double-processing
        hasProcessedFile = true;

        const file = e.target.files[0];
        if (!file) {
            console.log('No photo selected from camera');
            cleanup();
            return;
        }

        console.log('Meal photo captured:', file.name, file.type, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB');

        // Validate it's an image
        if (!file.type.startsWith('image/')) {
            alert('Invalid file type. Please take a photo.');
            cleanup();
            return;
        }

        // Set as captured meal file
        capturedMealFile = file;

        // Show preview in modal
        const reader = new FileReader();
        reader.onload = function(e) {
            showMealPhotoPreview(e.target.result);
        };
        reader.onerror = function(error) {
            console.error('FileReader error:', error);
            alert('Failed to load photo. Please try again.');
            cleanup();
        };
        reader.readAsDataURL(file);

        // Clean up after processing
        setTimeout(cleanup, 500);
    };

    function cleanup() {
        try {
            if (fileInput && fileInput.parentNode) {
                fileInput.parentNode.removeChild(fileInput);
            }
        } catch (e) {
            console.log('Cleanup error (non-critical):', e);
        }
    }

    // Handle cancel
    fileInput.addEventListener('cancel', function() {
        console.log('Camera cancelled by user');
        cleanup();
    });

    // Fallback cleanup after 2 minutes
    setTimeout(() => {
        if (!hasProcessedFile) {
            console.log('Camera timeout - cleaning up');
            cleanup();
        }
    }, 120000);

    // Add to DOM and trigger
    document.body.appendChild(fileInput);

    // Small delay to ensure proper triggering on all devices
    setTimeout(() => {
        try {
            fileInput.click();
        } catch (error) {
            console.error('Failed to trigger camera:', error);
            alert('Camera unavailable. Please check your browser permissions.');
            cleanup();
        }
    }, 100);
}

// Show meal photo preview in modal
function showMealPhotoPreview(dataUrl) {
    const previewModal = document.getElementById('meal-preview-modal');
    const previewPhoto = document.getElementById('meal-preview-photo');

    if (!previewModal || !previewPhoto) {
        console.error('Preview modal elements not found');
        return;
    }

    // Auto-detect meal type and highlight the correct pill
    selectedMealType = autoDetectMealType();
    document.querySelectorAll('.meal-photo-type-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === selectedMealType);
    });

    // Hide Spotify mini player during meal flow
    const spotifyMini = document.getElementById('spotify-now-playing');
    if (spotifyMini) spotifyMini.style.display = 'none';

    // Show modal with preview
    previewPhoto.src = dataUrl;
    previewModal.style.display = 'flex';
}

// Close meal preview modal
function closeMealPreviewModal() {
    const previewModal = document.getElementById('meal-preview-modal');
    if (previewModal) {
        previewModal.style.display = 'none';
    }

    // Clear the food description input
    const descInput = document.getElementById('meal-photo-description');
    if (descInput) descInput.value = '';

    capturedMealFile = null;

    // Restore Spotify mini player if music is playing and no other meal flow is active
    if (window._snpPlaying && !isMealFlowActive()) {
        const spotifyMini = document.getElementById('spotify-now-playing');
        if (spotifyMini) spotifyMini.style.display = 'block';
    }
}

// Retake meal photo from preview
function retakeMealPhotoFromPreview() {
    closeMealPreviewModal();
    // Reopen camera with same source
    openMealCamera(mealCameraSource);
}

// Legacy functions - no longer needed with native camera

// Use captured meal photo for analysis
async function useMealPhoto() {
    if (!capturedMealFile) {
        alert('No photo captured. Please try again.');
        return;
    }

    // Store file reference before closing modal (modal clears capturedMealFile)
    const fileToAnalyze = capturedMealFile;

    // Get meal description from the text input
    const descInput = document.getElementById('meal-photo-description');
    let mealDescription = descInput ? descInput.value.trim() : '';

    // Close preview modal
    closeMealPreviewModal();

    // Show loading state
    showMealAnalysisLoading();

    // Compress image first to avoid 502 errors on large photos
    const compressedFile = await compressMealImage(fileToAnalyze);

    // Convert compressed image to base64
    const base64 = await fileToBase64(compressedFile);
    const base64Data = base64.split(',')[1]; // Remove data:image/jpeg;base64, prefix

    // Retry logic - try up to 5 times
    const maxAttempts = 5;
    let attempt = 1;
    let success = false;
    let nutritionData = null;
    let lastError = null;

    while (!success && attempt <= maxAttempts) {
        try {
            // Update loading message with retry attempt
            if (attempt > 1) {
                showMealAnalysisLoading(`Analyzing meal... (attempt ${attempt})`);
            }

            // Call Gemini API via edge function
            console.log(`Analyzing food photo (attempt ${attempt})...`);
            const response = await fetch('/.netlify/functions/analyze-food', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageBase64: base64Data,
                    mimeType: fileToAnalyze.type,
                    description: mealDescription
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
                throw new Error(errorData.error || `Failed to analyze food photo (${response.status})`);
            }

            const result = await response.json();

            if (!result.success || !result.data) {
                throw new Error('Invalid response from analysis');
            }

            nutritionData = result.data;
            success = true;

        } catch (error) {
            console.error(`Error analyzing meal (attempt ${attempt}):`, error);
            lastError = error;

            // If not the last attempt, wait before retrying (exponential backoff)
            if (attempt < maxAttempts) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            attempt++;
        }
    }

    // Check if we failed after all attempts
    if (!success) {
        const errorDetails = lastError?.message || "Unknown error";
        showMealAnalysisError(`Failed after ${maxAttempts} attempts. Error: ${errorDetails}`);
        return;
    }

    // Success - save meal to database
    try {
        // Upload photo to Supabase Storage
        const photoUrl = await uploadMealPhoto(fileToAnalyze);

        // Save meal log to database
        const savedMeal = await saveMealLog({
            photoUrl,
            foodItems: nutritionData.foodItems,
            totals: nutritionData.totals,
            micronutrients: nutritionData.micronutrients,
            confidence: nutritionData.confidence,
            notes: nutritionData.notes
        });

        // Award points for the meal (with anti-cheat data)
        if (savedMeal && savedMeal[0]?.id) {
            try {
                // Get photo timestamp from file
                const photoTimestamp = fileToAnalyze.lastModified ? new Date(fileToAnalyze.lastModified).toISOString() : null;

                // Generate photo hash for duplicate detection
                const photoHash = await window.db?.points?.generatePhotoHash(base64);

                // Award points
                await awardPointsForMeal(
                    savedMeal[0].id,
                    photoTimestamp,
                    nutritionData.confidence,
                    photoHash
                );
            } catch (pointsError) {
                console.error('Error awarding points (meal still saved):', pointsError);
                // Don't throw - meal was saved successfully, points are bonus
            }
        }

        // Recalculate daily nutrition totals
        await recalculateDailyNutrition();

        // Refresh display
        await loadTodayNutrition();

        // Refresh micronutrient bars
        await loadMicronutrientInsights();

        // Check meal badges
        try { if (typeof checkMealBadges === 'function') checkMealBadges(); } catch(e) {}

        // Show success message
        showMealAnalysisSuccess(nutritionData);

    } catch (error) {
        console.error('Error saving meal:', error);
        showMealAnalysisError(error.message);
    }
}

// Handle meal photo selection
async function handleMealPhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Compress image first (do this before background so user sees quick response)
    const compressedFile = await compressMealImage(file);
    const base64 = await fileToBase64(compressedFile);
    const base64Data = base64.split(',')[1];

    // Reset file input immediately
    event.target.value = '';

    // Show quick confirmation and let user continue
    showToast('📸 Analysing your photo in the background...', 'info');

    // Run everything else in the background
    analyzePhotoInBackground(file, compressedFile, base64, base64Data);
}

// Background photo analysis with retry logic
async function analyzePhotoInBackground(originalFile, compressedFile, base64, base64Data) {
    const maxAttempts = 5;
    let attempt = 1;
    let success = false;
    let nutritionData = null;
    let lastError = null;

    while (!success && attempt <= maxAttempts) {
        try {
            console.log(`Analyzing food photo (attempt ${attempt})...`);
            const response = await fetch('/.netlify/functions/analyze-food', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: base64Data,
                    mimeType: originalFile.type
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
                throw new Error(errorData.error || `Failed to analyze food photo (${response.status})`);
            }

            const result = await response.json();

            if (!result.success || !result.data) {
                throw new Error('Invalid response from analysis');
            }

            nutritionData = result.data;
            success = true;
            console.log('Food analysis complete:', nutritionData);

        } catch (error) {
            console.error(`Error analyzing meal (attempt ${attempt}):`, error);
            lastError = error;

            if (attempt < maxAttempts) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            attempt++;
        }
    }

    if (!success) {
        const errorDetails = lastError?.message || "Unknown error";
        showMealAnalysisError(`Failed after ${maxAttempts} attempts. Error: ${errorDetails}`);
        return;
    }

    // Success - save meal to database
    try {
        const photoUrl = await uploadMealPhoto(originalFile);

        const savedMeal = await saveMealLog({
            photoUrl,
            foodItems: nutritionData.foodItems,
            totals: nutritionData.totals,
            micronutrients: nutritionData.micronutrients,
            confidence: nutritionData.confidence,
            notes: nutritionData.notes
        });

        // Award points
        if (savedMeal && savedMeal[0]?.id) {
            try {
                const photoTimestamp = originalFile.lastModified ? new Date(originalFile.lastModified).toISOString() : null;
                const photoHash = await window.db?.points?.generatePhotoHash(base64);
                await awardPointsForMeal(savedMeal[0].id, photoTimestamp, nutritionData.confidence, photoHash);
            } catch (pointsError) {
                console.error('Error awarding points (meal still saved):', pointsError);
            }
        }

        await recalculateDailyNutrition();
        await loadTodayNutrition();
        await loadMicronutrientInsights();
        showMealAnalysisSuccess(nutritionData);

    } catch (error) {
        console.error('Error saving meal:', error);
        showMealAnalysisError(error.message);
    }
}

// Convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Compress image for meal analysis (reduces large phone photos to reasonable size)
// Max 1280px dimension, 70% JPEG quality - plenty for food recognition
async function compressMealImage(file) {
    return new Promise((resolve) => {
        // Skip if already small (< 1MB)
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB < 1) {
            console.log(`Meal image already small (${fileSizeMB.toFixed(1)}MB), skipping compression`);
            resolve(file);
            return;
        }

        console.log(`Compressing meal image: ${fileSizeMB.toFixed(1)}MB`);

        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        img.onload = () => {
            // Calculate new dimensions (max 1280px on longest side)
            const maxDim = 1280;
            let width = img.width;
            let height = img.height;

            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to blob with reduced quality
            canvas.toBlob((blob) => {
                if (blob) {
                    const newSizeMB = blob.size / (1024 * 1024);
                    console.log(`Meal image compressed: ${fileSizeMB.toFixed(1)}MB → ${newSizeMB.toFixed(1)}MB`);
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                } else {
                    console.warn('Meal image compression failed, using original');
                    resolve(file);
                }
            }, 'image/jpeg', 0.7);
        };

        img.onerror = () => {
            console.warn('Failed to load image for compression, using original');
            resolve(file);
        };

        // Load the image
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

// Upload meal photo to Backblaze B2
async function uploadMealPhoto(file) {
    const userId = window.currentUser?.id;

    if (!userId) {
        throw new Error('User not authenticated');
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);

    // Upload to B2 via edge function
    const response = await fetch('/api/upload-meal-photo', {
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

// Helper function to get local date in YYYY-MM-DD format
// This ensures the date is based on user's local timezone, not UTC
// Get user's dietary preference from storage
function getUserDietaryPreference() {
    // Check localStorage first (fastest)
    const stored = localStorage.getItem('dietaryPreference');
    if (stored) return stored;
    // Fallback to sessionStorage userProfile
    try {
        const profile = JSON.parse(sessionStorage.getItem('userProfile') || '{}');
        if (profile.dietary_preference) {
            localStorage.setItem('dietaryPreference', profile.dietary_preference);
            return profile.dietary_preference;
        }
    } catch (e) {}
    return null; // Not set
}

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Save meal log to database
async function saveMealLog(mealData) {
    const userId = window.currentUser?.id;

    if (!userId) {
        throw new Error('User not authenticated');
    }

    const now = new Date();
    const mealDate = getLocalDateString(now);
    const mealTime = now.toTimeString().split(' ')[0];

    const insertData = {
            user_id: userId,
            meal_date: mealDate,
            meal_time: mealTime,
            meal_type: mealData.mealType || selectedMealType,
            food_items: mealData.foodItems,
            calories: mealData.totals.calories,
            protein_g: mealData.totals.protein_g,
            carbs_g: mealData.totals.carbs_g,
            fat_g: mealData.totals.fat_g,
            fiber_g: mealData.totals.fiber_g,
            micronutrients: mealData.micronutrients,
            notes: mealData.notes,
            ai_confidence: mealData.confidence,
            analysis_timestamp: new Date().toISOString()
    };

    // Always include photo fields — use 'text-input' sentinel when no photo
    // to satisfy any NOT NULL constraint and match existing UI checks
    insertData.photo_url = mealData.photoUrl || 'text-input';
    insertData.storage_path = mealData.photoUrl || 'text-input';

    const { data, error } = await window.supabaseClient
        .from('meal_logs')
        .insert(insertData)
        .select();

    if (error) {
        console.error('Error saving meal log:', error);
        throw error;
    }

    return data;
}

// Manually recalculate and update daily nutrition totals
async function recalculateDailyNutrition() {
    try {
        if (!window.supabaseClient) { console.log('Supabase not initialized'); return; }
        const userId = window.currentUser?.id;

        if (!userId) {
            console.log('User not authenticated');
            return;
        }

        const today = getLocalDateString();

        console.log('Recalculating nutrition for user:', userId, 'date:', today);

        // Get all meals for today
        const { data: meals, error: mealsError } = await window.supabaseClient
            .from('meal_logs')
            .select('*')
            .eq('user_id', userId)
            .eq('meal_date', today);

        if (mealsError) {
            console.error('Error fetching meals for recalculation:', mealsError);
            return;
        }

        console.log('Found meals:', meals?.length || 0, meals);

        // Calculate totals
        const totals = {
            total_calories: 0,
            total_protein_g: 0,
            total_carbs_g: 0,
            total_fat_g: 0,
            total_fiber_g: 0,
            meal_count: 0
        };

        if (meals && meals.length > 0) {
            meals.forEach(meal => {
                totals.total_calories += parseFloat(meal.calories) || 0;
                totals.total_protein_g += parseFloat(meal.protein_g) || 0;
                totals.total_carbs_g += parseFloat(meal.carbs_g) || 0;
                totals.total_fat_g += parseFloat(meal.fat_g) || 0;
                totals.total_fiber_g += parseFloat(meal.fiber_g) || 0;
            });
            totals.meal_count = meals.length;
        }

        console.log('Calculated totals:', totals);

        // Get existing goals or use defaults
        const { data: existingData } = await window.supabaseClient
            .from('daily_nutrition')
            .select('calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g')
            .eq('user_id', userId)
            .eq('nutrition_date', today)
            .maybeSingle();

        console.log('Existing goals:', existingData);

        // Prepare upsert data
        const upsertData = {
            user_id: userId,
            nutrition_date: today,
            total_calories: totals.total_calories,
            total_protein_g: totals.total_protein_g,
            total_carbs_g: totals.total_carbs_g,
            total_fat_g: totals.total_fat_g,
            total_fiber_g: totals.total_fiber_g,
            meal_count: totals.meal_count,
            // Preserve existing goals or use defaults
            calorie_goal: existingData?.calorie_goal || 2000,
            protein_goal_g: existingData?.protein_goal_g || 50,
            carbs_goal_g: existingData?.carbs_goal_g || 250,
            fat_goal_g: existingData?.fat_goal_g || 70
        };

        console.log('Upserting data:', upsertData);

        // Upsert into daily_nutrition
        const { data: upsertResult, error: upsertError } = await window.supabaseClient
            .from('daily_nutrition')
            .upsert(upsertData, { onConflict: 'user_id,nutrition_date' })
            .select();

        if (upsertError) {
            console.error('Error updating daily nutrition:', upsertError);
        } else {
            console.log('Daily nutrition updated successfully:', upsertResult);
        }

    } catch (error) {
        console.error('Error in recalculateDailyNutrition:', error);
    }
}

// Check if it's a new day and reset if needed
function checkAndResetNewDay() {
    const today = getLocalDateString();
    const lastDate = localStorage.getItem('lastCalorieTrackerDate');

    if (lastDate !== today) {
        console.log('New day detected, resetting calorie tracker data');
        localStorage.setItem('lastCalorieTrackerDate', today);
        // Clear cached nutrition since it's a new day
        localStorage.removeItem('cachedNutritionData');
        return true;
    }
    return false;
}

// Save today's nutrition data to localStorage cache
function cacheNutritionData(nutritionData, mealsData) {
    try {
        const cachePayload = {
            date: getLocalDateString(),
            nutrition: nutritionData,
            meals: mealsData || [],
            timestamp: Date.now()
        };
        localStorage.setItem('cachedNutritionData', JSON.stringify(cachePayload));
    } catch (e) {
        console.warn('Failed to cache nutrition data:', e);
    }
}

// Load cached nutrition data from localStorage (returns null if stale or missing)
function getCachedNutritionData() {
    try {
        const raw = localStorage.getItem('cachedNutritionData');
        if (!raw) return null;
        const cached = JSON.parse(raw);
        // Only use cache if it's for today
        if (cached.date !== getLocalDateString()) {
            localStorage.removeItem('cachedNutritionData');
            return null;
        }
        return cached;
    } catch (e) {
        localStorage.removeItem('cachedNutritionData');
        return null;
    }
}

// Render cached nutrition data instantly on page load (before network calls)
function renderCachedNutrition() {
    const cached = getCachedNutritionData();
    if (cached && cached.nutrition) {
        console.log('Rendering cached nutrition data for instant load');
        updateNutritionUI(cached.nutrition, cached.meals);
        return true;
    }
    return false;
}

// Load weekly metrics (last 7 days)
async function loadWeeklyMetrics(userId) {
    try {
        if (!userId) {
            console.log('User not authenticated');
            return;
        }

        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // Last 7 days including today

        const startDate = getLocalDateString(sevenDaysAgo);
        const endDate = getLocalDateString(today);

        console.log('Loading weekly metrics from', startDate, 'to', endDate);

        // Fetch last 7 days of nutrition data
        const { data: weeklyData, error: weeklyError } = await window.supabaseClient
            .from('daily_nutrition')
            .select('*')
            .eq('user_id', userId)
            .gte('nutrition_date', startDate)
            .lte('nutrition_date', endDate)
            .order('nutrition_date', { ascending: true });

        if (weeklyError) {
            console.error('Error loading weekly metrics:', weeklyError);
            return;
        }

        console.log('Weekly data loaded:', weeklyData);

        // Calculate weekly totals and averages
        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;
        let daysWithData = 0;

        if (weeklyData && weeklyData.length > 0) {
            weeklyData.forEach(day => {
                if (day.total_calories > 0) {
                    totalCalories += day.total_calories || 0;
                    totalProtein += day.total_protein_g || 0;
                    totalCarbs += day.total_carbs_g || 0;
                    totalFat += day.total_fat_g || 0;
                    daysWithData++;
                }
            });
        }

        const weeklyMetrics = {
            totalCalories: Math.round(totalCalories),
            avgCalories: daysWithData > 0 ? Math.round(totalCalories / daysWithData) : 0,
            totalProtein: Math.round(totalProtein),
            totalCarbs: Math.round(totalCarbs),
            totalFat: Math.round(totalFat),
            daysWithData,
            dailyData: weeklyData || []
        };

        console.log('Weekly metrics calculated:', weeklyMetrics);

        // Update weekly metrics UI
        updateWeeklyMetricsUI(weeklyMetrics);

    } catch (error) {
        console.error('Error in loadWeeklyMetrics:', error);
    }
}

// Load today's nutrition data
async function loadTodayNutrition() {
    try {
        // Check if it's a new day
        checkAndResetNewDay();

        if (!window.supabaseClient) { console.log('Supabase not initialized'); return; }
        const userId = window.currentUser?.id;

        if (!userId) {
            console.log('User not authenticated');
            return;
        }

        const today = getLocalDateString();

        // Load daily nutrition summary
        const { data: dailyData, error: dailyError } = await window.supabaseClient
            .from('daily_nutrition')
            .select('*')
            .eq('user_id', userId)
            .eq('nutrition_date', today)
            .single();

        if (dailyError && dailyError.code !== 'PGRST116') { // PGRST116 is "not found"
            console.error('Error loading daily nutrition:', dailyError);
        }

        // Check if we need to fetch personalized goals from quiz_results
        // This handles the case where daily_nutrition doesn't exist for today
        // or has default goals instead of personalized ones
        let nutritionDataWithGoals = dailyData;
        const hasPersonalizedGoals = dailyData && dailyData.calorie_goal && dailyData.calorie_goal !== 2000;

        if (!hasPersonalizedGoals) {
            console.log('No personalized goals in daily_nutrition, fetching from quiz_results...');

            // Fetch user's personalized goals from quiz_results
            const { data: quizData, error: quizError } = await window.supabaseClient
                .from('quiz_results')
                .select('calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g')
                .eq('user_id', userId)
                .order('taken_at', { ascending: false })
                .limit(1)
                .single();

            if (quizError && quizError.code !== 'PGRST116') {
                console.error('Error loading quiz results:', quizError);
            }

            if (quizData && quizData.calorie_goal) {
                console.log('Found personalized goals in quiz_results:', quizData);

                // Merge quiz goals with daily data (or create new object)
                nutritionDataWithGoals = {
                    ...(dailyData || {}),
                    calorie_goal: quizData.calorie_goal,
                    protein_goal_g: quizData.protein_goal_g,
                    carbs_goal_g: quizData.carbs_goal_g,
                    fat_goal_g: quizData.fat_goal_g
                };

                // Also save the goals to daily_nutrition for today so they persist
                try {
                    await window.supabaseClient
                        .from('daily_nutrition')
                        .upsert({
                            user_id: userId,
                            nutrition_date: today,
                            calorie_goal: quizData.calorie_goal,
                            protein_goal_g: quizData.protein_goal_g,
                            carbs_goal_g: quizData.carbs_goal_g,
                            fat_goal_g: quizData.fat_goal_g,
                            total_calories: dailyData?.total_calories || 0,
                            total_protein_g: dailyData?.total_protein_g || 0,
                            total_carbs_g: dailyData?.total_carbs_g || 0,
                            total_fat_g: dailyData?.total_fat_g || 0,
                            total_fiber_g: dailyData?.total_fiber_g || 0
                        }, {
                            onConflict: 'user_id,nutrition_date'
                        });
                    console.log('Saved personalized goals to daily_nutrition for today');
                } catch (saveError) {
                    console.error('Error saving goals to daily_nutrition:', saveError);
                }
            }
        }

        // Load individual meals
        const { data: mealsData, error: mealsError } = await window.supabaseClient
            .from('meal_logs')
            .select('*')
            .eq('user_id', userId)
            .eq('meal_date', today)
            .order('meal_time', { ascending: true });

        if (mealsError) {
            console.error('Error loading meals:', mealsError);
        }

        // Load weekly metrics
        await loadWeeklyMetrics(userId);

        // Update UI with personalized goals
        updateNutritionUI(nutritionDataWithGoals, mealsData);

        // Cache the loaded data for instant rendering next time
        cacheNutritionData(nutritionDataWithGoals, mealsData);

        // Check if daily log bonus already claimed today
        checkDailyLogBonusStatus();

    } catch (error) {
        console.error('Error in loadTodayNutrition:', error);
    }
}

// Update weekly metrics UI
function updateWeeklyMetricsUI(metrics) {
    // Update total weekly calories
    updateElement('weekly-total-calories', metrics.totalCalories);
    updateElement('weekly-avg-calories', metrics.avgCalories);
    updateElement('weekly-days-logged', metrics.daysWithData);

    // Update daily breakdown if elements exist
    const dailyBreakdownContainer = document.getElementById('weekly-daily-breakdown');
    if (dailyBreakdownContainer && metrics.dailyData.length > 0) {
        let html = '';
        metrics.dailyData.forEach(day => {
            const date = new Date(day.nutrition_date);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const calories = Math.round(day.total_calories || 0);
            const percentage = day.calorie_goal > 0 ? Math.min((calories / day.calorie_goal) * 100, 100) : 0;

            html += `
                <div class="weekly-day-item">
                    <div class="weekly-day-header">
                        <span class="weekly-day-name">${dayName}</span>
                        <span class="weekly-day-calories">${calories} cal</span>
                    </div>
                    <div class="progress-bar-small">
                        <div class="progress-fill" style="width: ${percentage}%; background: var(--primary);"></div>
                    </div>
                </div>
            `;
        });
        dailyBreakdownContainer.innerHTML = html;
    }
}

// ============================================================
// ENHANCED NUTRITION TAB FEATURES
// ============================================================

// --- 1. Daily Nutrition Score (0-100) ---
function calculateNutritionScore(dailyData) {
    if (!dailyData || !dailyData.calorie_goal) return null;

    const calorieGoal = dailyData.calorie_goal || 2000;
    const proteinGoal = dailyData.protein_goal_g || 50;
    const carbsGoal = dailyData.carbs_goal_g || 250;
    const fatGoal = dailyData.fat_goal_g || 70;

    const calories = dailyData.total_calories || 0;
    const protein = dailyData.total_protein_g || 0;
    const carbs = dailyData.total_carbs_g || 0;
    const fat = dailyData.total_fat_g || 0;

    if (calories === 0) return null;

    // Score each macro: 100 if on target, decreases as you deviate
    function macroScore(actual, goal) {
        if (goal === 0) return 100;
        const ratio = actual / goal;
        // Perfect = 1.0, penalize for over or under
        const deviation = Math.abs(1 - ratio);
        return Math.max(0, Math.round(100 - (deviation * 120)));
    }

    const calScore = macroScore(calories, calorieGoal);
    const proScore = macroScore(protein, proteinGoal);
    const carbScore = macroScore(carbs, carbsGoal);
    const fatScore = macroScore(fat, fatGoal);

    // Weighted average: calories 40%, protein 25%, carbs 20%, fat 15%
    const total = Math.round(calScore * 0.4 + proScore * 0.25 + carbScore * 0.2 + fatScore * 0.15);

    return { total, calScore, proScore, carbScore, fatScore };
}

// --- Calorie Projection ("If every day were like today...") ---
async function updateCalorieProjection(dailyData) {
    const projectionEl = document.getElementById('popup-calorie-projection');
    if (!projectionEl) return;

    const todayCalories = dailyData?.total_calories || 0;
    if (todayCalories === 0) {
        projectionEl.style.display = 'none';
        return;
    }

    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) { projectionEl.style.display = 'none'; return; }

        const userId = window.currentUser.id;

        // Get user's quiz data (weight, goal_weight, tdee)
        const quiz = await window.dbHelpers?.quizResults?.getLatest(userId);
        if (!quiz || !quiz.tdee) { projectionEl.style.display = 'none'; return; }

        const tdee = parseFloat(quiz.tdee);
        if (!tdee || tdee <= 0) { projectionEl.style.display = 'none'; return; }

        // Get current weight: prefer latest weigh-in, fallback to quiz weight
        let currentWeightKg = parseFloat(quiz.weight) || 70;
        try {
            const latestWeighIn = await window.dbHelpers?.weighIns?.getLatest(userId);
            if (latestWeighIn?.weight_kg) {
                currentWeightKg = parseFloat(latestWeighIn.weight_kg);
            }
        } catch (e) {
            // Use quiz weight as fallback
        }

        const goalWeightKg = parseFloat(quiz.goal_weight) || currentWeightKg;

        // Calculate projection: 1 kg of body fat ≈ 7,700 calories
        const dailySurplus = todayCalories - tdee;
        const CALORIES_PER_KG = 7700;
        const PROJECTION_DAYS = 35; // 5 weeks
        const projectedChangeKg = (dailySurplus * PROJECTION_DAYS) / CALORIES_PER_KG;
        const projectedWeightKg = currentWeightKg + projectedChangeKg;

        // Clamp to reasonable bounds (don't show negative weight or extreme projections)
        const clampedProjectedKg = Math.max(30, Math.min(300, projectedWeightKg));

        // Check unit preference
        const preferLbs = localStorage.getItem('weightUnitPreference') === 'lbs';
        const projectedDisplay = preferLbs
            ? (clampedProjectedKg * 2.20462).toFixed(1)
            : clampedProjectedKg.toFixed(1);
        const unitDisplay = preferLbs ? 'lbs' : 'kg';

        // Determine direction relative to goal
        const isLosingTowardGoal = goalWeightKg < currentWeightKg && projectedChangeKg < -0.1;
        const isGainingTowardGoal = goalWeightKg > currentWeightKg && projectedChangeKg > 0.1;
        const isMaintaining = Math.abs(projectedChangeKg) <= 0.1;

        // Set visual style based on direction
        projectionEl.className = 'calorie-projection-section';
        if (isLosingTowardGoal || isGainingTowardGoal) {
            projectionEl.classList.add('projection-losing'); // green = on track
        } else if (isMaintaining) {
            projectionEl.classList.add('projection-maintaining');
        } else {
            projectionEl.classList.add('projection-gaining'); // amber = moving away from goal
        }

        // Update text
        const textEl = document.getElementById('projection-text');
        const valueEl = document.getElementById('projection-weight-value');
        const unitEl = document.getElementById('projection-weight-unit');

        if (textEl) textEl.textContent = 'If every day were like today, you\'d weigh';
        if (valueEl) valueEl.textContent = projectedDisplay;
        if (unitEl) unitEl.textContent = unitDisplay;

        projectionEl.style.display = 'block';
    } catch (err) {
        console.error('Error calculating calorie projection:', err);
        projectionEl.style.display = 'none';
    }
}

function updateNutritionScoreUI(dailyData) {
    const scoreData = calculateNutritionScore(dailyData);
    const valueEl = document.getElementById('nutrition-score-value');
    const gradeEl = document.getElementById('nutrition-score-grade');
    const circleEl = document.getElementById('nutrition-score-circle');

    if (!scoreData || !valueEl) return;

    valueEl.textContent = scoreData.total;

    // Update grade text
    let grade = 'Keep going!';
    if (scoreData.total >= 90) grade = 'Excellent!';
    else if (scoreData.total >= 75) grade = 'Great job!';
    else if (scoreData.total >= 60) grade = 'Good progress';
    else if (scoreData.total >= 40) grade = 'Getting there';
    if (gradeEl) gradeEl.textContent = grade;

    // Update ring
    if (circleEl) {
        const circumference = 2 * Math.PI * 42;
        const offset = circumference * (1 - scoreData.total / 100);
        circleEl.style.strokeDashoffset = offset;

        // Color based on score
        if (scoreData.total >= 75) circleEl.style.stroke = 'var(--primary)';
        else if (scoreData.total >= 50) circleEl.style.stroke = '#f59e0b';
        else circleEl.style.stroke = '#ef4444';
    }

    // Update breakdown
    const breakdownEl = document.getElementById('score-breakdown');
    if (breakdownEl) {
        breakdownEl.innerHTML = `
            <div class="score-breakdown-item"><span class="score-dot" style="background: var(--primary);"></span> Cal ${scoreData.calScore}%</div>
            <div class="score-breakdown-item"><span class="score-dot" style="background: #3b82f6;"></span> Pro ${scoreData.proScore}%</div>
            <div class="score-breakdown-item"><span class="score-dot" style="background: #f59e0b;"></span> Carb ${scoreData.carbScore}%</div>
            <div class="score-breakdown-item"><span class="score-dot" style="background: #ef4444;"></span> Fat ${scoreData.fatScore}%</div>
        `;
    }

    // Also update popup score elements
    const popupValueEl = document.getElementById('popup-score-value');
    const popupGradeEl = document.getElementById('popup-score-grade');
    const popupCircleEl = document.getElementById('popup-score-circle');
    const popupBreakdownEl = document.getElementById('popup-score-breakdown');

    if (popupValueEl) popupValueEl.textContent = scoreData.total;
    if (popupGradeEl) popupGradeEl.textContent = grade;
    if (popupCircleEl) {
        const circumference = 2 * Math.PI * 42;
        const offset = circumference * (1 - scoreData.total / 100);
        popupCircleEl.style.strokeDashoffset = offset;
        if (scoreData.total >= 75) popupCircleEl.style.stroke = 'var(--primary)';
        else if (scoreData.total >= 50) popupCircleEl.style.stroke = '#f59e0b';
        else popupCircleEl.style.stroke = '#ef4444';
    }
    if (popupBreakdownEl) {
        popupBreakdownEl.innerHTML = `
            <div class="score-breakdown-item"><span class="score-dot" style="background: var(--primary);"></span> Cal ${scoreData.calScore}%</div>
            <div class="score-breakdown-item"><span class="score-dot" style="background: #3b82f6;"></span> Pro ${scoreData.proScore}%</div>
            <div class="score-breakdown-item"><span class="score-dot" style="background: #f59e0b;"></span> Carb ${scoreData.carbScore}%</div>
            <div class="score-breakdown-item"><span class="score-dot" style="background: #ef4444;"></span> Fat ${scoreData.fatScore}%</div>
        `;
    }

    // Update calorie projection in popup
    updateCalorieProjection(dailyData);
}

// --- Daily Score Popup ---
function openDailyScorePopup() {
    // Don't open popup if already claimed/completed for the day
    const mainBtn = document.getElementById('daily-log-btn');
    if (mainBtn && mainBtn.disabled) return;

    // Reset the finish-day button state in case it was stuck from a previous attempt
    const finishBtn = document.getElementById('popup-finish-day-btn');
    if (finishBtn) {
        finishBtn.disabled = false;
        finishBtn.style.opacity = '1';
        finishBtn.style.display = 'none';
        finishBtn.innerHTML = '<span>Log Your Meals for the Day Anyway</span>';
    }
    const finishHint = document.getElementById('popup-finish-hint');
    if (finishHint) finishHint.style.display = 'none';

    const overlay = document.getElementById('score-popup-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeDailyScorePopup(event) {
    if (event && event.target !== event.currentTarget) return;
    const overlay = document.getElementById('score-popup-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// --- 2. Streak Tracker ---
async function loadStreakData() {
    // Immediately show cached streak so UI doesn't flash 0 while loading
    const cachedStreak = localStorage.getItem('cachedNutritionStreak');
    if (cachedStreak) {
        const cached = parseInt(cachedStreak) || 0;
        const countEl = document.getElementById('streak-count');
        if (countEl) countEl.textContent = cached;
        const inlineCountEl = document.getElementById('streak-inline-count');
        if (inlineCountEl) inlineCountEl.textContent = cached;
    }

    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;

        const userId = window.currentUser.id;
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Check point_transactions for daily_log claims to determine streak
        const { data: claims, error } = await window.supabaseClient
            .from('point_transactions')
            .select('created_at')
            .eq('user_id', userId)
            .eq('transaction_type', 'earn_daily_log')
            .gte('created_at', getLocalDateString(thirtyDaysAgo))
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading streak:', error);
            // Fallback: use daily_nutrition table
            await loadStreakFromNutrition(userId);
            return;
        }

        // Calculate streak from daily log claims
        const claimedDates = new Set();
        (claims || []).forEach(c => {
            const d = c.created_at.split('T')[0];
            claimedDates.add(d);
        });

        // Also check daily_nutrition for days with data (broader definition of streak)
        const { data: nutritionDays } = await window.supabaseClient
            .from('daily_nutrition')
            .select('nutrition_date, total_calories')
            .eq('user_id', userId)
            .gte('nutrition_date', getLocalDateString(thirtyDaysAgo))
            .order('nutrition_date', { ascending: false });

        const loggedDates = new Set();
        (nutritionDays || []).forEach(d => {
            if (d.total_calories > 0) loggedDates.add(d.nutrition_date);
        });

        // Calculate streak (consecutive days with logged nutrition)
        // If today has no data yet, start from yesterday so the streak doesn't
        // appear as 0 at the beginning of each day before any meals are logged
        let streak = 0;
        const checkDate = new Date(today);
        const todayStr = getLocalDateString(today);
        if (!loggedDates.has(todayStr) && !claimedDates.has(todayStr)) {
            checkDate.setDate(checkDate.getDate() - 1);
        }
        for (let i = 0; i < 100; i++) {
            const ds = getLocalDateString(checkDate);
            if (loggedDates.has(ds) || claimedDates.has(ds)) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }

        // Cache streak in localStorage for instant display on next load
        localStorage.setItem('cachedNutritionStreak', String(streak));

        renderStreakUI(streak, loggedDates);
    } catch (err) {
        console.error('Error in loadStreakData:', err);
    }
}

async function loadStreakFromNutrition(userId) {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: nutritionDays } = await window.supabaseClient
        .from('daily_nutrition')
        .select('nutrition_date, total_calories')
        .eq('user_id', userId)
        .gte('nutrition_date', getLocalDateString(thirtyDaysAgo))
        .order('nutrition_date', { ascending: false });

    const loggedDates = new Set();
    (nutritionDays || []).forEach(d => {
        if (d.total_calories > 0) loggedDates.add(d.nutrition_date);
    });

    // If today has no data yet, start from yesterday so streak doesn't reset to 0
    let streak = 0;
    const checkDate = new Date(today);
    const todayStr = getLocalDateString(today);
    if (!loggedDates.has(todayStr)) {
        checkDate.setDate(checkDate.getDate() - 1);
    }
    for (let i = 0; i < 100; i++) {
        if (loggedDates.has(getLocalDateString(checkDate))) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }

    // Cache streak in localStorage for instant display on next load
    localStorage.setItem('cachedNutritionStreak', String(streak));

    renderStreakUI(streak, loggedDates);
}

function renderStreakUI(streak, loggedDates) {
    const countEl = document.getElementById('streak-count');
    if (countEl) countEl.textContent = streak;

    // Update inline streak badge in Daily Nutrition Tracker header
    const inlineCountEl = document.getElementById('streak-inline-count');
    if (inlineCountEl) inlineCountEl.textContent = streak;

    // Streak bonuses from config
    const bonuses = [
        { days: 7, points: 5 },
        { days: 14, points: 10 },
        { days: 30, points: 25 },
        { days: 60, points: 50 },
        { days: 100, points: 100 }
    ];

    // Find next bonus
    const nextBonus = bonuses.find(b => b.days > streak) || bonuses[bonuses.length - 1];
    const nextBonusEl = document.getElementById('streak-next-bonus');
    if (nextBonusEl) {
        if (streak >= 100) {
            nextBonusEl.textContent = '+100 pts earned!';
        } else {
            nextBonusEl.textContent = `+${nextBonus.points} pts at ${nextBonus.days}d`;
        }
    }

    const targetLabel = document.getElementById('streak-target-label');
    if (targetLabel) {
        if (streak >= 100) {
            targetLabel.textContent = 'Max streak bonus reached!';
        } else {
            targetLabel.textContent = `Next: ${nextBonus.days}-day (${nextBonus.points} pts)`;
        }
    }

    // Progress bar toward next bonus
    const progressEl = document.getElementById('streak-progress-fill');
    if (progressEl && nextBonus) {
        const prevBonus = bonuses.filter(b => b.days <= streak).pop();
        const start = prevBonus ? prevBonus.days : 0;
        const pct = Math.min(100, ((streak - start) / (nextBonus.days - start)) * 100);
        progressEl.style.width = pct + '%';
    }

    // Render 7-day dots
    const gridEl = document.getElementById('streak-days-grid');
    if (gridEl) {
        const today = new Date();
        let html = '';
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const ds = getLocalDateString(d);
            const dayName = d.toLocaleDateString('en-US', { weekday: 'narrow' });
            const isFilled = loggedDates && loggedDates.has(ds);
            const isToday = i === 0;
            html += `<div class="streak-day-dot${isFilled ? ' filled' : ''}${isToday ? ' today' : ''}">${dayName}</div>`;
        }
        gridEl.innerHTML = html;
    }
}

// --- 3. Multi-Week History ---
async function loadMultiWeekData(numWeeks = 4) {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;

        // Update nav buttons
        document.querySelectorAll('#multi-week-nav button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent.includes(numWeeks)) btn.classList.add('active');
        });

        const userId = window.currentUser.id;
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - (numWeeks * 7));
        const startDateStr = getLocalDateString(startDate);

        // Fetch nutrition and weigh-ins in parallel
        const [nutritionResult, weighInResult] = await Promise.allSettled([
            window.supabaseClient
                .from('daily_nutrition')
                .select('*')
                .eq('user_id', userId)
                .gte('nutrition_date', startDateStr)
                .order('nutrition_date', { ascending: true }),
            window.supabaseClient
                .from('daily_weigh_ins')
                .select('*')
                .eq('user_id', userId)
                .gte('weigh_in_date', startDateStr)
                .order('weigh_in_date', { ascending: true })
        ]);

        const nutritionData = nutritionResult.status === 'fulfilled' ? (nutritionResult.value.data || []) : [];
        const weighInData = weighInResult.status === 'fulfilled' ? (weighInResult.value.data || []) : [];

        // Group into weeks
        const weeks = [];
        for (let i = 0; i < numWeeks; i++) {
            const weekStart = new Date(startDate);
            weekStart.setDate(weekStart.getDate() + (i * 7));
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);

            // Filter data for this week
            const weekNutrition = nutritionData.filter(d => {
                const date = new Date(d.nutrition_date + 'T12:00:00');
                return date >= weekStart && date < weekEnd;
            });

            const weekWeights = weighInData.filter(d => {
                const date = new Date(d.weigh_in_date + 'T12:00:00');
                return date >= weekStart && date < weekEnd;
            });

            // Calculate weekly aggregates
            const daysLogged = weekNutrition.length;
            const totalCal = weekNutrition.reduce((sum, d) => sum + (d.total_calories || 0), 0);
            const totalPro = weekNutrition.reduce((sum, d) => sum + (d.total_protein_g || 0), 0);
            const totalCarb = weekNutrition.reduce((sum, d) => sum + (d.total_carbs_g || 0), 0);
            const totalFat = weekNutrition.reduce((sum, d) => sum + (d.total_fat_g || 0), 0);

            const avgCal = daysLogged > 0 ? totalCal / daysLogged : 0;
            const avgPro = daysLogged > 0 ? totalPro / daysLogged : 0;
            const avgCarb = daysLogged > 0 ? totalCarb / daysLogged : 0;
            const avgFat = daysLogged > 0 ? totalFat / daysLogged : 0;

            // Calculate average weight for the week
            const avgWeight = weekWeights.length > 0
                ? weekWeights.reduce((sum, w) => sum + (parseFloat(w.weight_kg) || 0), 0) / weekWeights.length
                : 0;

            weeks.push({
                start: getLocalDateString(weekStart),
                totalCal: Math.round(totalCal),
                avgCal: Math.round(avgCal),
                avgPro: Math.round(avgPro),
                avgCarb: Math.round(avgCarb),
                avgFat: Math.round(avgFat),
                avgWeight: avgWeight > 0 ? parseFloat(avgWeight.toFixed(1)) : 0,
                daysLogged: daysLogged
            });
        }

        renderMultiWeekUI(weeks);
    } catch (err) {
        console.error('Error in loadMultiWeekData:', err);
    }
}

function renderMultiWeekUI(weeks) {
    const container = document.getElementById('multi-week-sparklines');
    const compareGrid = document.getElementById('week-compare-grid');
    if (!container) return;

    if (!weeks || weeks.length === 0 || weeks.every(w => w.avgCal === 0)) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 0.85rem;">Log meals for at least 2 weeks to see trends</p>';
        if (compareGrid) compareGrid.innerHTML = '';
        return;
    }

    const preferLbs = localStorage.getItem('weightUnitPreference') === 'lbs';
    const weightSuffix = preferLbs ? ' lbs' : ' kg';

    // Prepare data for rendering
    weeks.forEach(w => {
        if (w.avgWeight > 0) {
            w.avgWeightDisplay = preferLbs ? parseFloat((w.avgWeight * 2.20462).toFixed(1)) : w.avgWeight;
        } else {
            w.avgWeightDisplay = 0;
        }
    });

    // Build sparklines for calories, protein, carbs, fat + NEW Total Intake and Weight
    const metrics = [
        { key: 'totalCal', label: 'Total Intake', color: '#8b5cf6', suffix: ' kcal' },
        { key: 'avgWeightDisplay', label: 'Weight', color: '#7BA883', suffix: weightSuffix },
        { key: 'avgCal', label: 'Avg Calories', color: 'var(--primary)', suffix: ' kcal' },
        { key: 'avgPro', label: 'Protein', color: '#3b82f6', suffix: ' g' },
        { key: 'avgCarb', label: 'Carbs', color: '#f59e0b', suffix: ' g' },
        { key: 'avgFat', label: 'Fat', color: '#ef4444', suffix: ' g' }
    ];

    let html = '';
    metrics.forEach(metric => {
        const values = weeks.map(w => w[metric.key]);
        const max = Math.max(...values, 1);
        const min = Math.min(...values.filter(v => v > 0));
        const current = values[values.length - 1];
        const previous = values.length >= 2 ? values[values.length - 2] : current;

        // Trend
        let trendClass = 'neutral';
        let trendText = '--';
        if (previous > 0 && current > 0) {
            const pctChange = Math.round(((current - previous) / previous) * 100);
            if (pctChange > 2) { trendClass = 'up'; trendText = '+' + pctChange + '%'; }
            else if (pctChange < -2) { trendClass = 'down'; trendText = pctChange + '%'; }
            else { trendText = '~0%'; }
        }

        // Build SVG sparkline
        const svgWidth = 120;
        const svgHeight = 30;
        const padding = 4;
        const points = values.map((v, i) => {
            const x = padding + (i / (values.length - 1 || 1)) * (svgWidth - padding * 2);
            const y = max > min ? svgHeight - padding - ((v - min) / (max - min)) * (svgHeight - padding * 2) : svgHeight / 2;
            return `${x},${y}`;
        }).join(' ');

        html += `
            <div class="sparkline-row">
                <div class="sparkline-label">${metric.label}</div>
                <svg class="sparkline-svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
                    <polyline points="${points}" fill="none" stroke="${metric.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    ${values.map((v, i) => {
                        const x = padding + (i / (values.length - 1 || 1)) * (svgWidth - padding * 2);
                        const y = max > min ? svgHeight - padding - ((v - min) / (max - min)) * (svgHeight - padding * 2) : svgHeight / 2;
                        return `<circle cx="${x}" cy="${y}" r="3" fill="${metric.color}" opacity="${i === values.length - 1 ? 1 : 0.4}"/>`;
                    }).join('')}
                </svg>
                <div class="sparkline-value">${current.toLocaleString()}${metric.suffix}</div>
                <div class="sparkline-trend ${trendClass}">${trendText}</div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Comparison stats: this week vs last week
    if (compareGrid && weeks.length >= 2) {
        const thisWeek = weeks[weeks.length - 1];
        const lastWeek = weeks[weeks.length - 2];

        compareGrid.innerHTML = `
            <div class="week-compare-stat">
                <div class="stat-value">${thisWeek.avgCal}</div>
                <div class="stat-label">Avg Cal/Day (This Week)</div>
            </div>
            <div class="week-compare-stat">
                <div class="stat-value">${lastWeek.avgCal}</div>
                <div class="stat-label">Avg Cal/Day (Last Week)</div>
            </div>
            <div class="week-compare-stat">
                <div class="stat-value">${thisWeek.daysLogged}/7</div>
                <div class="stat-label">Days Logged (This Week)</div>
            </div>
            <div class="week-compare-stat">
                <div class="stat-value">${lastWeek.daysLogged}/7</div>
                <div class="stat-label">Days Logged (Last Week)</div>
            </div>
        `;
    }
}

// --- 4. Micronutrient Insights ---
async function loadMicronutrientInsights() {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;

        const today = getLocalDateString();

        const { data: meals, error } = await window.supabaseClient
            .from('meal_logs')
            .select('micronutrients, food_items, calories, protein_g')
            .eq('user_id', window.currentUser.id)
            .eq('meal_date', today);

        if (error) {
            console.error('Error loading micronutrients:', error);
            return;
        }

        // Aggregate micronutrients from meal data
        // Map from stored DB keys (with unit suffixes) to display keys
        const keyMap = {
            iron: ['iron_mg', 'iron'],
            vitamin_c: ['vitamin_c_mg', 'vitamin_c'],
            calcium: ['calcium_mg', 'calcium'],
            b12: ['b12_mcg', 'b12'],
            omega3: ['omega3_g', 'omega3'],
            zinc: ['zinc_mg', 'zinc'],
            vitamin_d: ['vitamin_d_mcg', 'vitamin_d'],
            iodine: ['iodine_mcg', 'iodine'],
            selenium: ['selenium_mcg', 'selenium'],
            folate: ['folate_mcg', 'folate'],
            potassium: ['potassium_mg', 'potassium'],
            magnesium: ['magnesium_mg', 'magnesium'],
            vitamin_a: ['vitamin_a_mcg', 'vitamin_a'],
            vitamin_e: ['vitamin_e_mg', 'vitamin_e'],
            vitamin_k: ['vitamin_k_mcg', 'vitamin_k']
        };
        const totals = { iron: 0, vitamin_c: 0, calcium: 0, b12: 0, omega3: 0, zinc: 0, vitamin_d: 0, iodine: 0, selenium: 0, folate: 0, potassium: 0, magnesium: 0, vitamin_a: 0, vitamin_e: 0, vitamin_k: 0 };
        let mealCount = 0;

        (meals || []).forEach(meal => {
            mealCount++;
            if (meal.micronutrients && typeof meal.micronutrients === 'object') {
                Object.keys(totals).forEach(k => {
                    const aliases = keyMap[k] || [k];
                    for (const alias of aliases) {
                        if (meal.micronutrients[alias]) {
                            totals[k] += parseFloat(meal.micronutrients[alias]) || 0;
                            break;
                        }
                    }
                });
            }
        });

        // Daily totals for today
        const dailyTotals = {};
        Object.keys(totals).forEach(k => { dailyTotals[k] = Math.round(totals[k]); });

        renderMicronutrientUI(dailyTotals, mealCount);
    } catch (err) {
        console.error('Error in loadMicronutrientInsights:', err);
    }
}

function renderMicronutrientUI(dailyAvg, mealCount) {
    const grid = document.getElementById('tracker-micro-grid');
    if (!grid) return;

    const userDiet = getUserDietaryPreference();

    // Adjust RDAs based on diet — vegans/vegetarians need more iron (non-heme absorption is lower)
    const ironRda = (userDiet === 'vegan' || userDiet === 'vegetarian') ? 32 : 18;
    // B12 is critical for vegans (no natural dietary source)
    const b12Rda = 2.4;

    // RDA values (daily recommended for adults), adjusted per diet
    const nutrients = [
        { key: 'iron', name: 'Iron', rda: ironRda, unit: 'mg', icon: '&#x1FA78;', barColor: '#ef4444' },
        { key: 'vitamin_c', name: 'Vitamin C', rda: 90, unit: 'mg', icon: '&#x1F34A;', barColor: '#f97316' },
        { key: 'calcium', name: 'Calcium', rda: 1000, unit: 'mg', icon: '&#x1F9B4;', barColor: '#22c55e' },
        { key: 'b12', name: 'B12', rda: b12Rda, unit: 'mcg', icon: '&#x1F9EC;', barColor: '#6366f1' },
        { key: 'omega3', name: 'Omega-3', rda: 1.6, unit: 'g', icon: '&#x1F41F;', barColor: '#0ea5e9' },
        { key: 'zinc', name: 'Zinc', rda: 11, unit: 'mg', icon: '&#x1F6E1;', barColor: '#a855f7' },
        { key: 'vitamin_d', name: 'Vitamin D', rda: 15, unit: 'mcg', icon: '&#x2600;', barColor: '#eab308' },
        { key: 'iodine', name: 'Iodine', rda: 150, unit: 'mcg', icon: '&#x1F30A;', barColor: '#14b8a6' },
        { key: 'selenium', name: 'Selenium', rda: 55, unit: 'mcg', icon: '&#x1FAA8;', barColor: '#78716c' },
        { key: 'folate', name: 'Folate', rda: 400, unit: 'mcg', icon: '&#x1F96C;', barColor: '#16a34a' },
        { key: 'potassium', name: 'Potassium', rda: 2600, unit: 'mg', icon: '&#x1F34C;', barColor: '#d97706' },
        { key: 'magnesium', name: 'Magnesium', rda: 400, unit: 'mg', icon: '&#x1FAB6;', barColor: '#8b5cf6' },
        { key: 'vitamin_a', name: 'Vitamin A', rda: 900, unit: 'mcg', icon: '&#x1F955;', barColor: '#ea580c' },
        { key: 'vitamin_e', name: 'Vitamin E', rda: 15, unit: 'mg', icon: '&#x1F331;', barColor: '#65a30d' },
        { key: 'vitamin_k', name: 'Vitamin K', rda: 120, unit: 'mcg', icon: '&#x1F343;', barColor: '#059669' }
    ];

    if (mealCount === 0) {
        grid.innerHTML = nutrients.map(n => `
            <div class="micro-tracker-item">
                <div class="micro-tracker-header">
                    <span class="micro-tracker-name"><span class="micro-tracker-icon">${n.icon}</span> ${n.name}</span>
                    <span class="micro-tracker-status" style="color: #9ca3af;">--</span>
                </div>
                <div class="progress-bar-micro">
                    <div class="progress-fill-micro" style="width: 0%; background: ${n.barColor};"></div>
                </div>
            </div>
        `).join('');
        return;
    }

    grid.innerHTML = nutrients.map(n => {
        const val = dailyAvg[n.key] || 0;
        const pct = Math.min(100, (val / n.rda) * 100);
        let status = 'Low';
        let statusColor = '#ef4444';
        if (pct >= 80) { status = 'Good'; statusColor = '#22c55e'; }
        else if (pct >= 50) { status = 'Fair'; statusColor = '#f59e0b'; }

        return `
            <div class="micro-tracker-item">
                <div class="micro-tracker-header">
                    <span class="micro-tracker-name"><span class="micro-tracker-icon">${n.icon}</span> ${n.name}</span>
                    <span class="micro-tracker-status" style="color: ${statusColor};">${status}</span>
                </div>
                <div class="progress-bar-micro">
                    <div class="progress-fill-micro" style="width: ${pct}%; background: ${n.barColor};"></div>
                </div>
            </div>
        `;
    }).join('');
}

// --- 5. Meal Pattern Analysis ---
async function loadMealPatterns() {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;

        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        const { data: meals, error } = await window.supabaseClient
            .from('meal_logs')
            .select('meal_date, meal_time, meal_type, calories, protein_g, carbs_g, fat_g, fiber_g, micronutrients')
            .eq('user_id', window.currentUser.id)
            .gte('meal_date', getLocalDateString(sevenDaysAgo))
            .order('meal_date', { ascending: true });

        if (error) {
            console.error('Error loading meal patterns:', error);
            return;
        }

        if (!meals || meals.length < 3) {
            return; // Not enough data for patterns
        }

        const insights = analyzeMealPatterns(meals);
        renderMealPatterns(insights);
    } catch (err) {
        console.error('Error in loadMealPatterns:', err);
    }
}

function analyzeMealPatterns(meals) {
    const insights = [];

    // 1. Meal frequency by day of week
    const dayMealCounts = {};
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    meals.forEach(m => {
        const d = new Date(m.meal_date);
        const day = dayNames[d.getDay()];
        dayMealCounts[day] = (dayMealCounts[day] || 0) + 1;
    });

    // Find day with least meals
    const dayEntries = Object.entries(dayMealCounts);
    if (dayEntries.length >= 3) {
        dayEntries.sort((a, b) => a[1] - b[1]);
        const lowestDay = dayEntries[0];
        const highestDay = dayEntries[dayEntries.length - 1];
        if (lowestDay[1] < highestDay[1] * 0.5) {
            insights.push({
                icon: '&#x1F4C5;',
                text: `You log fewer meals on <strong>${lowestDay[0]}</strong> (${lowestDay[1]} meals) vs <strong>${highestDay[0]}</strong> (${highestDay[1]} meals). Try to stay consistent!`
            });
        }
    }

    // 2. Meal type distribution
    const typeCount = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    meals.forEach(m => {
        const t = (m.meal_type || '').toLowerCase();
        if (typeCount[t] !== undefined) typeCount[t]++;
    });

    const totalMeals = meals.length;
    if (typeCount.breakfast < totalMeals * 0.05 && totalMeals >= 5) {
        insights.push({
            icon: '&#x1F305;',
            text: `You rarely log <strong>breakfast</strong>. Starting the day with protein helps stabilize energy and blood sugar.`
        });
    }

    // 3. Protein distribution across meals
    const mealTypeProtein = { breakfast: [], lunch: [], dinner: [], snack: [] };
    meals.forEach(m => {
        const t = (m.meal_type || '').toLowerCase();
        if (mealTypeProtein[t]) mealTypeProtein[t].push(m.protein_g || 0);
    });

    const avgProtein = {};
    Object.entries(mealTypeProtein).forEach(([type, values]) => {
        if (values.length > 0) {
            avgProtein[type] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
        }
    });

    const proteinEntries = Object.entries(avgProtein).filter(e => e[1] > 0);
    if (proteinEntries.length >= 2) {
        proteinEntries.sort((a, b) => a[1] - b[1]);
        const lowest = proteinEntries[0];
        const highest = proteinEntries[proteinEntries.length - 1];
        if (lowest[1] < highest[1] * 0.4) {
            insights.push({
                icon: '&#x1F4AA;',
                text: `Your <strong>${lowest[0]}</strong> averages only ${lowest[1]}g protein vs ${highest[1]}g at <strong>${highest[0]}</strong>. Spreading protein evenly aids muscle synthesis.`
            });
        }
    }

    // 4. Eating timing
    const mealHours = meals.filter(m => m.meal_time).map(m => parseInt(m.meal_time.split(':')[0]));
    if (mealHours.length >= 5) {
        const lateCount = mealHours.filter(h => h >= 21).length;
        if (lateCount >= 3) {
            insights.push({
                icon: '&#x1F319;',
                text: `You've had <strong>${lateCount} late-night meals</strong> (after 9pm) this week. Earlier dinners may improve sleep and digestion.`
            });
        }

        const earlyFirst = Math.min(...mealHours);
        const lateLast = Math.max(...mealHours);
        const window = lateLast - earlyFirst;
        if (window <= 8) {
            insights.push({
                icon: '&#x23F0;',
                text: `Your eating window is <strong>${window} hours</strong> - a naturally tight window that supports metabolic health.`
            });
        }
    }

    // 5. Calorie consistency
    const dailyCals = {};
    meals.forEach(m => {
        dailyCals[m.meal_date] = (dailyCals[m.meal_date] || 0) + (m.calories || 0);
    });
    const calValues = Object.values(dailyCals);
    if (calValues.length >= 3) {
        const avg = calValues.reduce((a, b) => a + b, 0) / calValues.length;
        const variance = calValues.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / calValues.length;
        const stdDev = Math.sqrt(variance);
        const cv = avg > 0 ? (stdDev / avg) * 100 : 0;
        if (cv < 15) {
            insights.push({
                icon: '&#x2705;',
                text: `Your daily calories are <strong>very consistent</strong> (only ${Math.round(cv)}% variation). Great discipline!`
            });
        } else if (cv > 35) {
            insights.push({
                icon: '&#x1F4C9;',
                text: `Your calorie intake varies a lot (${Math.round(cv)}% variation). More consistency can help with steady progress.`
            });
        }
    }

    // --- 6. Macro Balance Analysis ---
    const totalProtein = meals.reduce((s, m) => s + (parseFloat(m.protein_g) || 0), 0);
    const totalCarbs = meals.reduce((s, m) => s + (parseFloat(m.carbs_g) || 0), 0);
    const totalFat = meals.reduce((s, m) => s + (parseFloat(m.fat_g) || 0), 0);
    const totalCals = meals.reduce((s, m) => s + (parseFloat(m.calories) || 0), 0);

    if (totalCals > 0) {
        const proteinPct = Math.round((totalProtein * 4 / totalCals) * 100);
        const carbsPct = Math.round((totalCarbs * 4 / totalCals) * 100);
        const fatPct = Math.round((totalFat * 9 / totalCals) * 100);

        if (proteinPct < 12) {
            insights.push({
                icon: '&#x1F4AA;',
                text: `Only <strong>${proteinPct}%</strong> of your calories come from protein this week. Aim for 15-25% to support muscle recovery and satiety.`
            });
        }
        if (fatPct > 40) {
            insights.push({
                icon: '&#x1F95C;',
                text: `<strong>${fatPct}%</strong> of your calories come from fat. Try shifting some towards whole carbs for sustained energy.`
            });
        } else if (fatPct < 15) {
            insights.push({
                icon: '&#x1F95C;',
                text: `Only <strong>${fatPct}%</strong> of your calories come from fat. Healthy fats (avocado, nuts, seeds) support hormone production.`
            });
        }
    }

    // --- 7. Fiber check ---
    const totalFiber = meals.reduce((s, m) => s + (parseFloat(m.fiber_g) || 0), 0);
    const daysWithData = Object.keys(dailyCals).length;
    if (daysWithData >= 3 && totalFiber > 0) {
        const avgFiber = totalFiber / daysWithData;
        if (avgFiber < 20) {
            insights.push({
                icon: '&#x1F33E;',
                text: `Your fiber averages <strong>${Math.round(avgFiber)}g/day</strong>. Aim for 25-35g via beans, oats, and veggies for gut health and satiety.`
            });
        } else if (avgFiber >= 35) {
            insights.push({
                icon: '&#x2705;',
                text: `Great fiber intake at <strong>${Math.round(avgFiber)}g/day</strong>! This supports digestion, gut bacteria, and blood sugar control.`
            });
        }
    }

    // --- 8. Micronutrient Analysis with Supplement Recommendations ---
    const userDiet = (typeof getUserDietaryPreference === 'function') ? getUserDietaryPreference() : null;
    const isPlantBased = userDiet === 'vegan' || userDiet === 'vegetarian';
    const ironRda = isPlantBased ? 32 : 18;

    const microRdas = {
        iron: { rda: ironRda, unit: 'mg', name: 'Iron', keys: ['iron_mg', 'iron'] },
        vitamin_c: { rda: 90, unit: 'mg', name: 'Vitamin C', keys: ['vitamin_c_mg', 'vitamin_c'] },
        calcium: { rda: 1000, unit: 'mg', name: 'Calcium', keys: ['calcium_mg', 'calcium'] },
        b12: { rda: 2.4, unit: 'mcg', name: 'B12', keys: ['b12_mcg', 'b12'] },
        omega3: { rda: 1.6, unit: 'g', name: 'Omega-3', keys: ['omega3_g', 'omega3'] },
        zinc: { rda: 11, unit: 'mg', name: 'Zinc', keys: ['zinc_mg', 'zinc'] },
        vitamin_d: { rda: 15, unit: 'mcg', name: 'Vitamin D', keys: ['vitamin_d_mcg', 'vitamin_d'] },
        iodine: { rda: 150, unit: 'mcg', name: 'Iodine', keys: ['iodine_mcg', 'iodine'] },
        selenium: { rda: 55, unit: 'mcg', name: 'Selenium', keys: ['selenium_mcg', 'selenium'] },
        folate: { rda: 400, unit: 'mcg', name: 'Folate', keys: ['folate_mcg', 'folate'] },
        potassium: { rda: 2600, unit: 'mg', name: 'Potassium', keys: ['potassium_mg', 'potassium'] },
        magnesium: { rda: 400, unit: 'mg', name: 'Magnesium', keys: ['magnesium_mg', 'magnesium'] },
        vitamin_a: { rda: 900, unit: 'mcg', name: 'Vitamin A', keys: ['vitamin_a_mcg', 'vitamin_a'] },
        vitamin_e: { rda: 15, unit: 'mg', name: 'Vitamin E', keys: ['vitamin_e_mg', 'vitamin_e'] },
        vitamin_k: { rda: 120, unit: 'mcg', name: 'Vitamin K', keys: ['vitamin_k_mcg', 'vitamin_k'] }
    };

    // Aggregate weekly micronutrient totals
    const microDailyTotals = {}; // { nutrient: { date: amount } }
    Object.keys(microRdas).forEach(k => { microDailyTotals[k] = {}; });

    meals.forEach(meal => {
        if (!meal.micronutrients || typeof meal.micronutrients !== 'object') return;
        const mDate = meal.meal_date;
        Object.keys(microRdas).forEach(k => {
            const aliases = microRdas[k].keys;
            let val = 0;
            for (const alias of aliases) {
                if (meal.micronutrients[alias]) {
                    val = parseFloat(meal.micronutrients[alias]) || 0;
                    break;
                }
            }
            if (val > 0) {
                microDailyTotals[k][mDate] = (microDailyTotals[k][mDate] || 0) + val;
            }
        });
    });

    // Check each micronutrient: if consistently below 50% RDA across logged days, flag it
    const supplementRecs = {
        omega3: 'Consider an <strong>algae-based Omega-3</strong> supplement (300-600mg DHA/EPA daily) for brain health and inflammation.',
        b12: 'Consider a <strong>B12 supplement</strong> (1,000mcg 3x weekly). Essential for energy and nerve function, especially on a plant-based diet.',
        iron: 'Your iron is low \u2014 consider <strong>Iron Bisglycinate</strong> (18-25mg every other day) paired with Vitamin C for absorption.',
        calcium: 'Consider a <strong>Calcium Citrate + D3</strong> supplement (500mg Ca + 2000IU D3) for bone density protection.',
        zinc: 'Your zinc intake is low \u2014 consider a <strong>Zinc supplement</strong> (15mg every other day). Supports immunity and thyroid function.',
        vitamin_c: 'Your Vitamin C is low. Add citrus fruits, bell peppers, or strawberries \u2014 also boosts iron absorption.',
        vitamin_d: 'Your Vitamin D is low \u2014 consider a <strong>Vitamin D3 supplement</strong> (2000 IU daily). Critical for calcium absorption and immune function, especially with limited sun exposure.',
        iodine: 'Your iodine is low \u2014 consider using <strong>iodized salt</strong> or a <strong>kelp supplement</strong> (150mcg daily). Supports thyroid function and metabolism.',
        selenium: 'Your selenium is low \u2014 try eating <strong>1-2 Brazil nuts daily</strong> (the richest plant source). Supports antioxidant defense and thyroid health.',
        folate: 'Your folate is low \u2014 add more <strong>leafy greens, lentils, and chickpeas</strong>. Essential for cell division and DNA synthesis.',
        potassium: 'Your potassium is low \u2014 add more <strong>bananas, sweet potatoes, and beans</strong>. Important for blood pressure regulation and muscle function.',
        magnesium: 'Your magnesium is low \u2014 consider a <strong>Magnesium Glycinate</strong> supplement (200-400mg daily) or add more pumpkin seeds, spinach, and dark chocolate.',
        vitamin_a: 'Your Vitamin A is low \u2014 add more <strong>sweet potatoes, carrots, and spinach</strong>. Essential for vision, immune function, and skin health.',
        vitamin_e: 'Your Vitamin E is low \u2014 add more <strong>almonds, sunflower seeds, and avocado</strong>. A key antioxidant that protects cells from oxidative damage.',
        vitamin_k: 'Your Vitamin K is low \u2014 add more <strong>kale, broccoli, and Brussels sprouts</strong>. Critical for blood clotting and bone mineralization.'
    };

    const microIcons = {
        omega3: '&#x1F41F;', b12: '&#x1F9EC;', iron: '&#x1FA78;',
        calcium: '&#x1F9B4;', zinc: '&#x1F6E1;', vitamin_c: '&#x1F34A;',
        vitamin_d: '&#x2600;', iodine: '&#x1F30A;', selenium: '&#x1FAA8;',
        folate: '&#x1F96C;', potassium: '&#x1F34C;', magnesium: '&#x1FAB6;',
        vitamin_a: '&#x1F955;', vitamin_e: '&#x1F331;', vitamin_k: '&#x1F343;'
    };

    Object.keys(microRdas).forEach(k => {
        const dailyEntries = Object.values(microDailyTotals[k]);
        if (dailyEntries.length < 3) return; // Not enough data days

        const avgDaily = dailyEntries.reduce((a, b) => a + b, 0) / dailyEntries.length;
        const pctOfRda = (avgDaily / microRdas[k].rda) * 100;

        // If below 50% RDA consistently, recommend supplement
        if (pctOfRda < 50) {
            const rec = supplementRecs[k];
            if (rec) {
                insights.push({
                    icon: microIcons[k] || '&#x1F48A;',
                    text: `Your <strong>${microRdas[k].name}</strong> averages ${Math.round(pctOfRda)}% of daily needs this week. ${rec}`
                });
            }
        } else if (pctOfRda >= 90) {
            // Positive reinforcement for good nutrient levels
            insights.push({
                icon: '&#x2705;',
                text: `Your <strong>${microRdas[k].name}</strong> intake is strong at ${Math.round(pctOfRda)}% of daily needs. Keep it up!`
            });
        }
    });

    return insights.slice(0, 12); // Max 12 insights (expanded for additional micronutrients)
}

function renderMealPatterns(insights) {
    const container = document.getElementById('meal-pattern-insights');
    if (!container) return;

    if (!insights || insights.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 12px 0; font-size: 0.85rem;">Log more meals to see patterns</p>';
        return;
    }

    container.innerHTML = insights.map(i => `
        <div class="pattern-insight">
            <span class="pattern-icon">${i.icon}</span>
            <div class="pattern-text">${i.text}</div>
        </div>
    `).join('');
}

// --- Adaptive Calorie Adjustment ---

// Store current adjustment data so the modal can reference it
let _pendingAdaptiveAdjustment = null;

/**
 * Load and check adaptive calorie adjustment eligibility.
 * Called when the Home page (dashboard) loads.
 * Injects a proactive message into the FITGotchi AI card if adjustment is needed.
 */
async function loadAdaptiveAdjustment() {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;
        const userId = window.currentUser.id;

        // Only show the adaptive check-in once per week on Monday mornings
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ...
        if (dayOfWeek !== 1) return; // Only run on Mondays

        // Check if user snoozed adaptive checks
        const snoozeUntil = localStorage.getItem('adaptiveAdjustmentSnoozeUntil');
        if (snoozeUntil) {
            const snoozeDate = new Date(snoozeUntil);
            if (now < snoozeDate) return;
            // Snooze expired, clear it
            localStorage.removeItem('adaptiveAdjustmentSnoozeUntil');
        }
        // Legacy: check old single-day dismiss key
        const dismissedDate = localStorage.getItem('adaptiveAdjustmentDismissedDate');
        const today = getLocalDateString();
        if (dismissedDate === today) return;

        // Calculate date range: last 14 days
        const fourteenDaysAgo = new Date(now);
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
        const startDate = getLocalDateString(fourteenDaysAgo);
        const endDate = getLocalDateString(now);

        // Fetch nutrition data, weigh-ins, and user goals in parallel
        const [nutritionResult, weighInResult, quizResult] = await Promise.allSettled([
            window.supabaseClient
                .from('daily_nutrition')
                .select('*')
                .eq('user_id', userId)
                .gte('nutrition_date', startDate)
                .lte('nutrition_date', endDate)
                .order('nutrition_date', { ascending: true }),
            window.supabaseClient
                .from('daily_weigh_ins')
                .select('*')
                .eq('user_id', userId)
                .gte('weigh_in_date', startDate)
                .lte('weigh_in_date', endDate)
                .order('weigh_in_date', { ascending: true }),
            window.supabaseClient
                .from('quiz_results')
                .select('calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g, goal_weight, goal_body_type, sex, weight')
                .eq('user_id', userId)
                .order('taken_at', { ascending: false })
                .limit(1)
                .single()
        ]);

        const nutritionDays = nutritionResult.status === 'fulfilled' ? (nutritionResult.value.data || []) : [];
        const weighIns = weighInResult.status === 'fulfilled' ? (weighInResult.value.data || []) : [];
        const quizData = quizResult.status === 'fulfilled' ? quizResult.value.data : null;

        if (!quizData || !quizData.calorie_goal) return;

        const currentCalorieGoal = quizData.calorie_goal;
        const goalWeight = quizData.goal_weight || quizData.weight;

        // Run the analysis
        const result = analyzeAdaptiveAdjustment(nutritionDays, weighIns, currentCalorieGoal, goalWeight);

        if (!result || !result.eligible) return;

        // Only show proactive message when there's an actual suggestion
        renderAdaptiveInAiCard(result, quizData);

        // Auto-snooze until next Monday so the message only appears once this week
        const nextMonday = new Date();
        nextMonday.setDate(nextMonday.getDate() + 7);
        nextMonday.setHours(0, 0, 0, 0);
        localStorage.setItem('adaptiveAdjustmentSnoozeUntil', nextMonday.toISOString());

    } catch (err) {
        console.error('Error loading adaptive adjustment:', err);
    }
}

/**
 * Render the adaptive adjustment as a proactive FITGotchi AI message.
 * Injects directly into the AI assistant chat card.
 */
function renderAdaptiveInAiCard(result, quizData) {
    const suggestion = result.suggestion;
    if (!suggestion) return;

    // Use the exposed addAiMessage to inject a bot message
    if (typeof window._aiAddMessage === 'function') {
        window._aiAddMessage(suggestion.reason, 'bot');
    }

    if (suggestion.direction === 'none') {
        // On track - just the positive message, no actions needed
        return;
    }

    // Show the follow-up question and action options in the AI actions area
    const actionsContainer = document.getElementById('ai-assistant-actions');
    if (!actionsContainer) return;
    actionsContainer.style.display = 'block';

    const directionWord = suggestion.direction === 'increase' ? 'Increase' : 'Reduce';
    const newCal = result.newCalorieGoal;

    actionsContainer.innerHTML = `
        ${suggestion.question ? `<div style="font-size: 0.84rem; color: var(--text-muted); line-height: 1.45; margin-bottom: 10px;">${suggestion.question}</div>` : ''}
        <div class="adaptive-snooze-options">
            <button class="adaptive-snooze-btn" onclick="openAdaptiveModal()" style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08)); border-color: rgba(99,102,241,0.2);">
                <span class="snooze-label">${directionWord} my calories to ${newCal} kcal/day</span>
                <span class="snooze-desc">Update my target now and check in again in 2 weeks</span>
            </button>
            <button class="adaptive-snooze-btn" onclick="snoozeAdaptiveAdjustment(7)">
                <span class="snooze-label">Give me another week</span>
                <span class="snooze-desc">Keep my current calories and I'll focus on tracking accurately</span>
            </button>
            <button class="adaptive-snooze-btn" onclick="snoozeAdaptiveAdjustment(14)">
                <span class="snooze-label">Check again in 2 weeks</span>
                <span class="snooze-desc">I'll keep going at my current level for now</span>
            </button>
        </div>
    `;

    // Store pending adjustment data for the modal
    _pendingAdaptiveAdjustment = {
        currentCalorieGoal: result.currentCalorieGoal,
        newCalorieGoal: result.newCalorieGoal,
        direction: suggestion.direction,
        quizData: quizData
    };
}

/**
 * Open the confirmation modal for calorie adjustment.
 */
function openAdaptiveModal() {
    if (!_pendingAdaptiveAdjustment) return;

    const overlay = document.getElementById('adaptive-modal-overlay');
    const { currentCalorieGoal, newCalorieGoal, direction } = _pendingAdaptiveAdjustment;

    document.getElementById('adaptive-modal-icon').innerHTML = direction === 'increase' ? '&#x1F4C8;' : '&#x1F4C9;';
    document.getElementById('adaptive-modal-title').textContent =
        direction === 'increase' ? 'Increase Your Calories?' : 'Reduce Your Calories?';

    const diff = Math.abs(newCalorieGoal - currentCalorieGoal);
    document.getElementById('adaptive-modal-body').textContent =
        direction === 'increase'
            ? `Based on your last 2 weeks, I'd suggest adding ${diff} calories per day to help with your goals.`
            : `Based on your last 2 weeks, I'd suggest reducing by ${diff} calories per day to help get things moving.`;

    document.getElementById('adaptive-modal-old').textContent = currentCalorieGoal + ' kcal';
    document.getElementById('adaptive-modal-new').textContent = newCalorieGoal + ' kcal';

    overlay.classList.add('active');
}

/**
 * Close the adjustment modal without applying.
 */
function closeAdaptiveModal() {
    const overlay = document.getElementById('adaptive-modal-overlay');
    overlay.classList.remove('active');
}

/**
 * Confirm and apply the adaptive calorie adjustment.
 * Updates quiz_results, daily_nutrition, and reloads the UI.
 */
async function confirmAdaptiveAdjustment() {
    if (!_pendingAdaptiveAdjustment) return;

    const confirmBtn = document.querySelector('.adaptive-modal-confirm');
    confirmBtn.textContent = 'Updating...';
    confirmBtn.disabled = true;

    try {
        const userId = window.currentUser?.id;
        if (!userId) throw new Error('Not authenticated');

        const { newCalorieGoal, quizData } = _pendingAdaptiveAdjustment;

        // Recalculate macros proportionally based on new calorie goal
        const goalBodyType = quizData.goal_body_type || 'Athletic';
        const currentWeight = quizData.weight || 70;
        const macros = calculateMacros(newCalorieGoal, goalBodyType, currentWeight);

        const newGoals = {
            calorie_goal: newCalorieGoal,
            protein_goal_g: macros.protein_g,
            carbs_goal_g: macros.carbs_g,
            fat_goal_g: macros.fat_g
        };

        // Update quiz_results
        await window.supabaseClient.from('quiz_results')
            .update({
                calorie_goal: newGoals.calorie_goal,
                protein_goal_g: newGoals.protein_goal_g,
                carbs_goal_g: newGoals.carbs_goal_g,
                fat_goal_g: newGoals.fat_goal_g
            })
            .eq('user_id', userId);

        // Update today's daily_nutrition goals
        const today = getLocalDateString();
        await window.supabaseClient.from('daily_nutrition')
            .upsert({
                user_id: userId,
                nutrition_date: today,
                calorie_goal: newGoals.calorie_goal,
                protein_goal_g: newGoals.protein_goal_g,
                carbs_goal_g: newGoals.carbs_goal_g,
                fat_goal_g: newGoals.fat_goal_g
            }, {
                onConflict: 'user_id,nutrition_date'
            });

        // Close modal
        closeAdaptiveModal();

        // Clear the action buttons from the AI card
        const actionsContainer = document.getElementById('ai-assistant-actions');
        if (actionsContainer) {
            actionsContainer.style.display = 'none';
            actionsContainer.innerHTML = '';
        }

        // Show success message in the AI chat
        if (typeof window._aiAddMessage === 'function') {
            window._aiAddMessage(
                `**Done!** Your new daily target is **${newGoals.calorie_goal} kcal** (${newGoals.protein_goal_g}g protein, ${newGoals.carbs_goal_g}g carbs, ${newGoals.fat_goal_g}g fat). I'll check in again in 2 weeks to see how you're going.`,
                'bot'
            );
        }

        // Snooze for 14 days after applying adjustment
        const snoozeUntil = new Date();
        snoozeUntil.setDate(snoozeUntil.getDate() + 14);
        localStorage.setItem('adaptiveAdjustmentSnoozeUntil', snoozeUntil.toISOString());

        // Reload nutrition UI to reflect new goals
        _pendingAdaptiveAdjustment = null;
        if (typeof loadTodayNutrition === 'function') {
            loadTodayNutrition();
        }

    } catch (err) {
        console.error('Error applying adaptive adjustment:', err);
        alert('Failed to update goals. Please try again.');
    } finally {
        confirmBtn.textContent = 'Yes, update my goals';
        confirmBtn.disabled = false;
    }
}

/**
 * Snooze the adaptive adjustment for a specified number of days.
 * @param {number} days - Number of days to snooze (7 = one week, 14 = two weeks)
 */
function snoozeAdaptiveAdjustment(days) {
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);
    localStorage.setItem('adaptiveAdjustmentSnoozeUntil', snoozeUntil.toISOString());

    // Clear the action buttons from the AI card
    const actionsContainer = document.getElementById('ai-assistant-actions');
    if (actionsContainer) {
        actionsContainer.style.display = 'none';
        actionsContainer.innerHTML = '';
    }

    // Add a confirmation reply in the AI chat
    const label = days === 7 ? 'one week' : '2 weeks';
    if (typeof window._aiAddMessage === 'function') {
        window._aiAddMessage(`No worries! I'll check in again in ${label}. Keep tracking and we'll see how things go.`, 'bot');
    }
}

/**
 * Dismiss the adaptive adjustment suggestion for today (legacy compat).
 */
function dismissAdaptiveAdjustment() {
    snoozeAdaptiveAdjustment(1);
}

// --- 6. Photo Meal Journal ---
async function loadMealJournal() {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;

        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        const { data: meals, error } = await window.supabaseClient
            .from('meal_logs')
            .select('meal_date, meal_time, photo_url, calories, food_items')
            .eq('user_id', window.currentUser.id)
            .gte('meal_date', getLocalDateString(sevenDaysAgo))
            .order('meal_date', { ascending: false });

        if (error) {
            console.error('Error loading meal journal:', error);
            return;
        }

        renderMealJournal(meals || []);
    } catch (err) {
        console.error('Error in loadMealJournal:', err);
    }
}

function renderMealJournal(meals) {
    const container = document.getElementById('journal-timeline');
    if (!container) return;

    if (!meals || meals.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 12px 0; font-size: 0.85rem;">No meals logged yet this week</p>';
        return;
    }

    // Group by date
    const grouped = {};
    meals.forEach(m => {
        if (!grouped[m.meal_date]) grouped[m.meal_date] = [];
        grouped[m.meal_date].push(m);
    });

    const dates = Object.keys(grouped).sort().reverse().slice(0, 7);

    let html = '';
    dates.forEach(dateStr => {
        const d = new Date(dateStr + 'T12:00:00');
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = d.getDate();
        const dayMeals = grouped[dateStr];
        const totalCal = dayMeals.reduce((s, m) => s + (m.calories || 0), 0);

        html += `
            <div class="journal-day">
                <div class="journal-date-col">
                    <div class="journal-date-day">${dayName}</div>
                    <div class="journal-date-num">${dayNum}</div>
                    <div class="journal-day-cals">${Math.round(totalCal)} cal</div>
                </div>
                <div class="journal-photos">
        `;

        dayMeals.forEach(meal => {
            const hasPhoto = meal.photo_url && meal.photo_url.trim() !== '' && meal.photo_url !== 'text-input';
            if (hasPhoto) {
                html += `<div class="journal-photo"><img src="${meal.photo_url}" alt="Meal" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<span class=\\'placeholder\\'>&#x1F37D;</span>';"></div>`;
            } else {
                const foodName = Array.isArray(meal.food_items) && meal.food_items.length > 0
                    ? meal.food_items[0].name || 'Meal'
                    : 'Meal';
                html += `<div class="journal-photo" style="font-size: 0.65rem; color: var(--text-muted); padding: 4px; text-align: center; word-break: break-word;">${foodName.substring(0, 20)}</div>`;
            }
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// --- 7. Cycle-Synced Nutrition Tips ---
function loadCycleNutritionTips() {
    // Only show for female users with cycle tracking
    if (typeof isMaleUser === 'function' && isMaleUser()) return;

    const section = document.getElementById('cycle-nutrition-section');
    if (!section) return;

    // Get current cycle phase
    let phaseKey = null;
    try {
        if (typeof userCycleData !== 'undefined' && userCycleData.lastPeriod) {
            const lastPeriod = new Date(userCycleData.lastPeriod);
            const today = new Date();
            const diffMs = today - lastPeriod;
            const dayOfCycle = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
            const cycleLen = userCycleData.cycleLength || 28;
            phaseKey = getCyclePhase(dayOfCycle, cycleLen);
        }
    } catch (e) {
        console.log('Could not determine cycle phase for nutrition tips');
    }

    if (!phaseKey || phaseKey === 'performance' || phaseKey === 'wellness') return;

    const tips = {
        menstrual: {
            phase: 'Menstrual Phase',
            icon: '&#x1FA78;',
            color: '#E57373',
            bgColor: '#fef2f2',
            borderColor: '#fecaca',
            tipBg: 'rgba(239, 68, 68, 0.06)',
            tips: (function() {
                const diet = getUserDietaryPreference();
                const ironFoods = (diet === 'omnivore' || diet === 'flexitarian') ? 'red meat, spinach, lentils, and pumpkin seeds' :
                    (diet === 'pescatarian') ? 'fish, spinach, lentils, and pumpkin seeds' :
                    'spinach, lentils, pumpkin seeds, and dark chocolate';
                return [
                    { icon: '&#x1FA78;', text: `<strong>Focus on iron-rich foods</strong> — ${ironFoods} to replenish iron lost during menstruation.` },
                    { icon: '&#x1F9CA;', text: '<strong>Anti-inflammatory foods</strong> — turmeric, ginger, and berries help reduce cramps and bloating.' },
                    { icon: '&#x2615;', text: '<strong>Warm, comforting meals</strong> — soups and stews are easier to digest. Your body needs gentle nourishment right now.' },
                    { icon: '&#x1F4A7;', text: '<strong>Stay hydrated</strong> — water retention is common. Drink more water to help flush excess fluid.' }
                ];
            })()
        },
        follicular: {
            phase: 'Follicular Phase',
            icon: '&#x26A1;',
            color: '#F06292',
            bgColor: '#fdf2f8',
            borderColor: '#fbcfe8',
            tipBg: 'rgba(240, 98, 146, 0.06)',
            tips: (function() {
                const diet = getUserDietaryPreference();
                const proteinTip = (diet === 'omnivore' || diet === 'flexitarian') ? 'Aim for lean meats, eggs, or legumes with each meal.' :
                    (diet === 'pescatarian') ? 'Aim for fish, eggs, or legumes with each meal.' :
                    (diet === 'vegetarian') ? 'Aim for eggs, dairy, or legumes with each meal.' :
                    'Aim for tofu, tempeh, or legumes with each meal.';
                return [
                    { icon: '&#x1F95A;', text: `<strong>Higher protein intake</strong> — your body is primed for muscle building. ${proteinTip}` },
                    { icon: '&#x1F966;', text: '<strong>Fermented and sprouted foods</strong> — your gut is more receptive now. Great time for kimchi, sauerkraut, and sprouted grains.' },
                    { icon: '&#x26A1;', text: '<strong>Light, energizing meals</strong> — your metabolism is speeding up. Fresh salads, grain bowls, and smoothies work well.' },
                    { icon: '&#x1F3CB;', text: '<strong>Pre-workout carbs</strong> — energy is rising. Fuel your workouts with oats, sweet potato, or banana.' }
                ];
            })()
        },
        ovulation: {
            phase: 'Ovulation Phase',
            icon: '&#x1F31F;',
            color: '#BA68C8',
            bgColor: '#faf5ff',
            borderColor: '#e9d5ff',
            tipBg: 'rgba(186, 104, 200, 0.06)',
            tips: [
                { icon: '&#x1F966;', text: '<strong>Cruciferous vegetables</strong> — broccoli, kale, cauliflower help your liver process the estrogen peak.' },
                { icon: '&#x1F95C;', text: '<strong>Fiber-rich foods</strong> — help eliminate excess estrogen. Flaxseeds, chia seeds, and legumes are ideal.' },
                { icon: '&#x1F4A7;', text: '<strong>Lighter meals</strong> — energy is at its peak but appetite may drop slightly. Listen to your body.' },
                { icon: '&#x1F34E;', text: '<strong>Antioxidant-rich fruits</strong> — support egg health and reduce oxidative stress.' }
            ]
        },
        luteal: {
            phase: 'Luteal Phase',
            icon: '&#x1F319;',
            color: '#FFB74D',
            bgColor: '#fffbeb',
            borderColor: '#fde68a',
            tipBg: 'rgba(255, 183, 77, 0.06)',
            tips: [
                { icon: '&#x1F360;', text: '<strong>Complex carbs are key</strong> — sweet potato, brown rice, quinoa help boost serotonin and manage cravings.' },
                { icon: '&#x1F36B;', text: '<strong>Magnesium-rich foods</strong> — dark chocolate, nuts, and seeds help reduce PMS symptoms and improve sleep.' },
                { icon: '&#x1F9C0;', text: '<strong>Calcium boost</strong> — studies show calcium reduces PMS. Include leafy greens, fortified plant milk, and tahini.' },
                { icon: '&#x1F34C;', text: '<strong>B6 foods</strong> — bananas, chickpeas, and potatoes help with mood stability and reduce water retention.' }
            ]
        }
    };

    const phaseData = tips[phaseKey];
    if (!phaseData) return;

    section.style.display = 'block';
    section.style.background = `linear-gradient(135deg, ${phaseData.bgColor} 0%, white 100%)`;
    section.style.borderColor = phaseData.borderColor;

    const iconEl = document.getElementById('cycle-nutrition-icon');
    const phaseEl = document.getElementById('cycle-nutrition-phase');
    const listEl = document.getElementById('cycle-tip-list');

    if (iconEl) iconEl.innerHTML = phaseData.icon;
    if (phaseEl) {
        phaseEl.textContent = phaseData.phase;
        phaseEl.style.color = phaseData.color;
    }

    if (listEl) {
        listEl.innerHTML = phaseData.tips.map(t => `
            <div class="cycle-tip" style="background: ${phaseData.tipBg};">
                <span class="cycle-tip-icon">${t.icon}</span>
                <div>${t.text}</div>
            </div>
        `).join('');
    }
}

// ============================================================
// ENHANCED NUTRITION TAB FEATURES - PHASE 2
// ============================================================

// --- 8. Weekly Score History ---
async function loadScoreHistory() {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;

        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        const { data: days, error } = await window.supabaseClient
            .from('daily_nutrition')
            .select('nutrition_date, total_calories, total_protein_g, total_carbs_g, total_fat_g, calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g')
            .eq('user_id', window.currentUser.id)
            .gte('nutrition_date', getLocalDateString(sevenDaysAgo))
            .lte('nutrition_date', getLocalDateString(today))
            .order('nutrition_date', { ascending: true });

        if (error) { console.error('Error loading score history:', error); return; }

        renderScoreHistory(days || []);
    } catch (err) {
        console.error('Error in loadScoreHistory:', err);
    }
}

function renderScoreHistory(days) {
    const container = document.getElementById('score-history-bars');
    if (!container) return;

    const today = new Date();
    const dayMap = {};
    (days || []).forEach(d => { dayMap[d.nutrition_date] = d; });

    let html = '';
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const ds = getLocalDateString(d);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const dayData = dayMap[ds];
        const score = dayData ? calculateNutritionScore(dayData) : null;
        const value = score ? score.total : 0;
        const height = Math.max(4, value); // percentage of container height

        let barColor = '#e5e7eb';
        if (value >= 75) barColor = 'var(--primary)';
        else if (value >= 50) barColor = '#f59e0b';
        else if (value > 0) barColor = '#ef4444';

        const isToday = i === 0;
        html += `
            <div class="score-bar-col">
                <div class="score-bar-value">${value > 0 ? value : ''}</div>
                <div class="score-bar" style="height: ${height}%; background: ${barColor};${isToday ? ' box-shadow: 0 0 0 2px rgba(72,134,75,0.3);' : ''}"></div>
                <div class="score-bar-label" style="${isToday ? 'color: var(--primary); font-weight: 700;' : ''}">${dayName}</div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// --- 9. Smart Meal Suggestions (on-the-fly) ---
function generateSmartSuggestions(dailyData) {
    const section = document.getElementById('smart-suggestions-section');
    const listEl = document.getElementById('suggestion-list');
    const subtitleEl = document.getElementById('smart-suggestions-subtitle');
    if (!section || !listEl) return;

    if (!dailyData || !dailyData.calorie_goal) { section.style.display = 'none'; return; }

    const calLeft = (dailyData.calorie_goal || 2000) - (dailyData.total_calories || 0);
    const proLeft = (dailyData.protein_goal_g || 50) - (dailyData.total_protein_g || 0);
    const carbLeft = (dailyData.carbs_goal_g || 250) - (dailyData.total_carbs_g || 0);
    const fatLeft = (dailyData.fat_goal_g || 70) - (dailyData.total_fat_g || 0);

    // Only show if there's meaningful gap
    if (calLeft < 100 && proLeft < 5) { section.style.display = 'none'; return; }

    // Get user's dietary preference
    const userDiet = getUserDietaryPreference();

    // Diet-aware food database
    // diet field: which diets can eat this ('all' = everyone, or specific diet keys)
    const allFoods = [
        // === Universal foods (all diets) ===
        { name: 'Oatmeal with Banana', emoji: '&#x1F35A;', cal: 300, pro: 8, carb: 55, fat: 6, diet: 'all' },
        { name: 'Sweet Potato (large)', emoji: '&#x1F360;', cal: 180, pro: 4, carb: 41, fat: 0, diet: 'all' },
        { name: 'Quinoa Bowl', emoji: '&#x1F35B;', cal: 320, pro: 12, carb: 50, fat: 8, diet: 'all' },
        { name: 'Brown Rice + Beans', emoji: '&#x1F35A;', cal: 350, pro: 14, carb: 60, fat: 4, diet: 'all' },
        { name: 'Banana + PB Toast', emoji: '&#x1F34C;', cal: 280, pro: 8, carb: 38, fat: 12, diet: 'all' },
        { name: 'Avocado Toast', emoji: '&#x1F951;', cal: 280, pro: 7, carb: 25, fat: 18, diet: 'all' },
        { name: 'Trail Mix (1/3 cup)', emoji: '&#x1F95C;', cal: 200, pro: 6, carb: 18, fat: 14, diet: 'all' },
        { name: 'Green Salad + Tahini', emoji: '&#x1F957;', cal: 150, pro: 5, carb: 12, fat: 10, diet: 'all' },
        { name: 'Veggie Soup', emoji: '&#x1F963;', cal: 120, pro: 4, carb: 18, fat: 3, diet: 'all' },
        { name: 'Fruit Bowl', emoji: '&#x1F353;', cal: 140, pro: 2, carb: 34, fat: 1, diet: 'all' },
        { name: 'Hummus + Veggies', emoji: '&#x1FAD8;', cal: 160, pro: 6, carb: 16, fat: 8, diet: 'all' },
        { name: 'Lentil Soup (1 bowl)', emoji: '&#x1F963;', cal: 230, pro: 18, carb: 40, fat: 1, diet: 'all' },
        { name: 'Chickpea Salad', emoji: '&#x1F957;', cal: 280, pro: 14, carb: 35, fat: 10, diet: 'all' },
        { name: 'Edamame (1 cup)', emoji: '&#x1FAD8;', cal: 190, pro: 17, carb: 14, fat: 8, diet: 'all' },
        { name: 'Black Bean Tacos (2)', emoji: '&#x1F32E;', cal: 340, pro: 16, carb: 42, fat: 12, diet: 'all' },

        // === Vegan / plant-based only ===
        { name: 'Tofu Scramble', emoji: '&#x1F95A;', cal: 220, pro: 18, carb: 8, fat: 14, diet: 'vegan,vegetarian,flexitarian,pescatarian' },
        { name: 'Tempeh Stir-Fry', emoji: '&#x1F372;', cal: 320, pro: 22, carb: 25, fat: 14, diet: 'vegan,vegetarian,flexitarian,pescatarian' },
        { name: 'Chia Pudding', emoji: '&#x1F366;', cal: 220, pro: 6, carb: 22, fat: 12, diet: 'vegan,vegetarian,flexitarian,pescatarian' },
        { name: 'Hemp Seed Bowl', emoji: '&#x1F331;', cal: 250, pro: 15, carb: 20, fat: 14, diet: 'vegan,vegetarian,flexitarian,pescatarian' },
        { name: 'Vegan Protein Smoothie', emoji: '&#x1F964;', cal: 280, pro: 25, carb: 35, fat: 6, diet: 'vegan,vegetarian,flexitarian' },

        // === Vegetarian (includes dairy/eggs) ===
        { name: 'Greek Yogurt + Granola', emoji: '&#x1F95B;', cal: 280, pro: 18, carb: 35, fat: 8, diet: 'vegetarian,flexitarian,pescatarian,omnivore' },
        { name: 'Scrambled Eggs (3)', emoji: '&#x1F373;', cal: 240, pro: 18, carb: 2, fat: 18, diet: 'vegetarian,flexitarian,pescatarian,omnivore' },
        { name: 'Cottage Cheese + Fruit', emoji: '&#x1F9C0;', cal: 200, pro: 20, carb: 16, fat: 5, diet: 'vegetarian,flexitarian,pescatarian,omnivore' },
        { name: 'Cheese Omelette', emoji: '&#x1F95A;', cal: 310, pro: 22, carb: 3, fat: 24, diet: 'vegetarian,flexitarian,pescatarian,omnivore' },
        { name: 'Whey Protein Shake', emoji: '&#x1F964;', cal: 250, pro: 30, carb: 15, fat: 4, diet: 'vegetarian,flexitarian,pescatarian,omnivore' },

        // === Pescatarian (fish + vegetarian) ===
        { name: 'Salmon Fillet (150g)', emoji: '&#x1F41F;', cal: 310, pro: 34, carb: 0, fat: 18, diet: 'pescatarian,flexitarian,omnivore' },
        { name: 'Tuna Salad', emoji: '&#x1F957;', cal: 260, pro: 28, carb: 8, fat: 12, diet: 'pescatarian,flexitarian,omnivore' },
        { name: 'Shrimp Stir-Fry', emoji: '&#x1F364;', cal: 280, pro: 26, carb: 18, fat: 10, diet: 'pescatarian,flexitarian,omnivore' },
        { name: 'Smoked Salmon Toast', emoji: '&#x1F363;', cal: 250, pro: 20, carb: 22, fat: 10, diet: 'pescatarian,flexitarian,omnivore' },

        // === Omnivore (everything) ===
        { name: 'Grilled Chicken Breast', emoji: '&#x1F357;', cal: 280, pro: 38, carb: 0, fat: 12, diet: 'omnivore,flexitarian' },
        { name: 'Turkey Mince Bowl', emoji: '&#x1F35B;', cal: 320, pro: 30, carb: 25, fat: 12, diet: 'omnivore,flexitarian' },
        { name: 'Steak + Sweet Potato', emoji: '&#x1F969;', cal: 450, pro: 40, carb: 35, fat: 16, diet: 'omnivore,flexitarian' },
        { name: 'Chicken Wrap', emoji: '&#x1F32F;', cal: 380, pro: 28, carb: 35, fat: 14, diet: 'omnivore,flexitarian' },
        { name: 'Beef Meatballs (5)', emoji: '&#x1F356;', cal: 350, pro: 28, carb: 12, fat: 22, diet: 'omnivore,flexitarian' },
        { name: 'Chicken + Rice Bowl', emoji: '&#x1F35B;', cal: 420, pro: 35, carb: 45, fat: 10, diet: 'omnivore,flexitarian' }
    ];

    // Filter foods based on user's dietary preference
    const foods = allFoods.filter(f => {
        if (f.diet === 'all') return true;
        if (!userDiet) return true; // No preference set, show everything
        return f.diet.split(',').includes(userDiet);
    });

    // Score each food by how well it fills gaps
    const scored = foods.map(f => {
        let score = 0;
        // Reward filling calorie gap without overshooting
        if (f.cal <= calLeft + 50) score += 20;
        else if (f.cal <= calLeft + 150) score += 5;
        else score -= 10;

        // Reward filling the biggest macro gap
        if (proLeft > 10 && f.pro >= 12) score += 30;
        if (proLeft > 5 && f.pro >= 8) score += 15;
        if (carbLeft > 20 && f.carb >= 25) score += 15;
        if (fatLeft > 10 && f.fat >= 10) score += 10;

        // Penalize if we'd overshoot a macro that's already met
        if (proLeft <= 0 && f.pro > 10) score -= 10;
        if (carbLeft <= 0 && f.carb > 20) score -= 10;
        if (fatLeft <= 0 && f.fat > 10) score -= 10;

        return { ...f, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top3 = scored.slice(0, 3);

    // Determine what's most needed
    let gapText = '';
    if (proLeft > 10 && calLeft > 200) gapText = `You need ~${Math.round(proLeft)}g protein and ${Math.round(calLeft)} cal`;
    else if (proLeft > 10) gapText = `Focus on protein — ${Math.round(proLeft)}g left to hit your goal`;
    else if (calLeft > 200) gapText = `${Math.round(calLeft)} calories left to reach your target`;
    else gapText = 'Fine-tune your macros with one of these';

    if (subtitleEl) subtitleEl.textContent = gapText;

    section.style.display = 'block';
    listEl.innerHTML = top3.map(f => {
        // Tag for the main benefit
        let tagText = 'Balanced';
        let tagBg = '#dbeafe';
        let tagColor = '#1e40af';
        if (f.pro >= 15) { tagText = 'High Protein'; tagBg = '#dcfce7'; tagColor = '#166534'; }
        else if (f.carb >= 35) { tagText = 'Carb Rich'; tagBg = '#fef3c7'; tagColor = '#92400e'; }
        else if (f.fat >= 12) { tagText = 'Healthy Fats'; tagBg = '#fce7f3'; tagColor = '#9d174d'; }

        return `
            <div class="suggestion-item">
                <div class="suggestion-emoji">${f.emoji}</div>
                <div class="suggestion-info">
                    <div class="suggestion-name">${f.name}</div>
                    <div class="suggestion-macros">${f.cal} cal | P: ${f.pro}g | C: ${f.carb}g | F: ${f.fat}g</div>
                </div>
                <span class="suggestion-tag" style="background: ${tagBg}; color: ${tagColor};">${tagText}</span>
            </div>
        `;
    }).join('');
}

// --- Water Goal Calculation (Onboarding Wizard) ---
let wizardWaterGoalMl = 2100;
let wizardGlassSize = 250;

function calculateWaterGoal(weightKg, activityLevel) {
    // Base: 33ml per kg body weight (standard hydration guideline)
    let baseWater = Math.round(weightKg * 33);

    // Activity level adjustment
    const activityBonus = {
        'sedentary': 0,
        'light': 250,
        'moderate': 500,
        'very': 750
    };
    baseWater += (activityBonus[activityLevel] || 0);

    // Round to nearest 50ml for cleaner numbers
    return Math.round(baseWater / 50) * 50;
}

function calculateAndDisplayWaterGoal() {
    // Pull user data from sessionStorage (already saved from slide 2)
    let userData = {};
    try { userData = JSON.parse(sessionStorage.getItem('userProfile') || '{}'); } catch(e) {}

    const weight = parseFloat(userData.weight) || 70;
    const activityLevel = userData.activity_level || 'sedentary';

    const recommended = calculateWaterGoal(weight, activityLevel);
    wizardWaterGoalMl = recommended;

    // Update display
    const recEl = document.getElementById('wizard-water-recommended');
    if (recEl) recEl.textContent = recommended.toLocaleString() + ' ml';

    const goalEl = document.getElementById('wizard-water-goal');
    if (goalEl) goalEl.textContent = recommended.toLocaleString();

    const hiddenEl = document.getElementById('wizard-water-goal-ml');
    if (hiddenEl) hiddenEl.value = recommended;

    // Update formula note
    const noteEl = document.getElementById('wizard-water-formula-note');
    if (noteEl) {
        const base = Math.round(weight * 33);
        const bonus = {'sedentary': 0, 'light': 250, 'moderate': 500, 'very': 750}[activityLevel] || 0;
        let note = `${weight}kg × 33ml = ${base.toLocaleString()}ml`;
        if (bonus > 0) note += ` + ${bonus}ml activity`;
        noteEl.textContent = note;
    }

    updateWizardGlassCount();
}

function adjustWaterGoal(delta) {
    wizardWaterGoalMl = Math.max(500, Math.min(5000, wizardWaterGoalMl + delta));

    const goalEl = document.getElementById('wizard-water-goal');
    if (goalEl) goalEl.textContent = wizardWaterGoalMl.toLocaleString();

    const hiddenEl = document.getElementById('wizard-water-goal-ml');
    if (hiddenEl) hiddenEl.value = wizardWaterGoalMl;

    updateWizardGlassCount();
}

function selectGlassSize(size) {
    wizardGlassSize = size;

    const hiddenEl = document.getElementById('wizard-glass-size');
    if (hiddenEl) hiddenEl.value = size;

    // Update button styles
    document.querySelectorAll('.glass-size-btn').forEach(btn => {
        const btnSize = parseInt(btn.dataset.size);
        if (btnSize === size) {
            btn.style.borderColor = '#0284c7';
            btn.style.background = '#e0f2fe';
            btn.style.color = '#0c4a6e';
            btn.classList.add('active');
        } else {
            btn.style.borderColor = '#e2e8f0';
            btn.style.background = 'white';
            btn.style.color = '#334155';
            btn.classList.remove('active');
        }
    });

    updateWizardGlassCount();
}

function updateWizardGlassCount() {
    const glasses = Math.ceil(wizardWaterGoalMl / wizardGlassSize);
    const countEl = document.getElementById('wizard-glass-count');
    if (countEl) countEl.textContent = glasses;
}

// --- 10. Hydration Tracker (Personalized Circular Design) ---
function getHydrationSettings() {
    const goalMl = parseInt(localStorage.getItem('pbb_water_goal_ml')) || 2000;
    const glassSize = parseInt(localStorage.getItem('pbb_water_glass_size')) || 250;
    const totalGlasses = parseInt(localStorage.getItem('pbb_water_total_glasses')) || Math.ceil(goalMl / glassSize);
    return { goalMl, glassSize, totalGlasses };
}

function initHydrationTracker() {
    const circleEl = document.getElementById('hydration-circle-fill');
    if (!circleEl) return;

    const today = getLocalDateString();
    const storageKey = `pbb_hydration_${today}`;
    let glasses = parseInt(localStorage.getItem(storageKey) || '0');

    // Update the goal display in the header
    const settings = getHydrationSettings();
    const headerEl = document.getElementById('hydration-goal-display');
    if (headerEl) headerEl.textContent = `Goal: ${settings.goalMl.toLocaleString()} ml`;

    const hintEl = document.getElementById('hydration-circle-hint');
    if (hintEl) hintEl.textContent = `Tap to add ${settings.glassSize}ml`;

    updateHydrationCircle(glasses);

    // Also load from DB to stay in sync across devices
    loadHydrationFromDb();
}

// Load hydration data from DB (for cross-device sync)
async function loadHydrationFromDb() {
    try {
        if (!window.currentUser?.id || !window.supabaseClient) return;
        const today = getLocalDateString();
        const storageKey = `pbb_hydration_${today}`;

        const { data } = await window.supabaseClient
            .from('daily_checkins')
            .select('water_intake')
            .eq('user_id', window.currentUser.id)
            .eq('checkin_date', today)
            .maybeSingle();

        if (data?.water_intake != null) {
            const localGlasses = parseInt(localStorage.getItem(storageKey) || '0');
            // Use whichever is higher (DB or local) to avoid losing data
            if (data.water_intake > localGlasses) {
                localStorage.setItem(storageKey, data.water_intake.toString());
                updateHydrationCircle(data.water_intake);
            }
        }
    } catch (err) {
        // Non-fatal: localStorage will still work
        console.error('Error loading hydration from DB:', err);
    }
}

function updateHydrationCircle(glasses) {
    const { goalMl, glassSize, totalGlasses } = getHydrationSettings();
    const circumference = 2 * Math.PI * 42; // ~264
    const progress = Math.min(glasses / totalGlasses, 1);
    const offset = circumference * (1 - progress);

    const circleEl = document.getElementById('hydration-circle-fill');
    if (circleEl) {
        circleEl.style.strokeDashoffset = offset;
        if (glasses >= totalGlasses) {
            circleEl.style.stroke = '#16a34a';
        } else {
            circleEl.style.stroke = '#0284c7';
        }
    }

    const countEl = document.getElementById('hydration-cup-count');
    if (countEl) countEl.textContent = `${glasses}/${totalGlasses}`;

    const labelEl = document.getElementById('hydration-circle-label');
    if (labelEl) {
        const ml = glasses * glassSize;
        labelEl.textContent = `${ml.toLocaleString()} / ${goalMl.toLocaleString()} ml`;
    }

    const cupSvg = document.getElementById('hydration-cup-svg');
    if (cupSvg) {
        cupSvg.style.fill = glasses >= totalGlasses ? '#16a34a' : '#0284c7';
    }
}

function addHydrationGlass() {
    const { totalGlasses } = getHydrationSettings();
    const today = getLocalDateString();
    const storageKey = `pbb_hydration_${today}`;
    let glasses = parseInt(localStorage.getItem(storageKey) || '0');

    if (glasses >= totalGlasses) {
        glasses = 0;
    } else {
        glasses++;
    }

    localStorage.setItem(storageKey, glasses.toString());
    updateHydrationCircle(glasses);

    // Ripple animation
    const wrap = document.getElementById('hydration-circle-tap');
    if (wrap) {
        wrap.classList.remove('hydration-ripple');
        void wrap.offsetWidth; // trigger reflow
        wrap.classList.add('hydration-ripple');
    }

    // Persist water intake to DB (for water challenge tracking)
    saveHydrationToDb(glasses);
}

// Save hydration count to daily_checkins table so water challenges can track it
async function saveHydrationToDb(glasses) {
    try {
        if (!window.currentUser?.id || !window.supabaseClient) return;
        const today = getLocalDateString();

        await window.supabaseClient
            .from('daily_checkins')
            .upsert({
                user_id: window.currentUser.id,
                checkin_date: today,
                water_intake: glasses
            }, {
                onConflict: 'user_id,checkin_date'
            });

        // Refresh challenge progress (water challenge counts days with water logged)
        if (typeof refreshChallengeProgress === 'function') {
            refreshChallengeProgress();
        }
    } catch (err) {
        console.error('Error saving hydration to DB:', err);
    }
}

// --- Weekly Trends Page ---
function openWeeklyTrendsPage() {
    const page = document.getElementById('weekly-trends-page');
    if (!page) return;

    page.classList.add('active');
    page.style.transform = 'translateX(100%)';
    page.style.transition = 'transform 0.3s ease-out';
    requestAnimationFrame(() => {
        page.style.transform = 'translateX(0)';
    });

    // Load data for the page
    Promise.allSettled([
        loadWeeklyMetrics(window.currentUser?.id),
        loadMultiWeekData(4),
        loadMealPatterns(),
        loadMealJournal()
    ]);

}


function closeWeeklyTrendsPage() {
    const page = document.getElementById('weekly-trends-page');
    if (!page) return;

    // Close adaptive modal if open
    closeAdaptiveModal();

    // Ensure we return to the Nutrition tab
    const mealsBtn = document.querySelector('.bottom-nav .nav-item[onclick*="meals"]');
    if (mealsBtn) {
        switchAppTab('meals', mealsBtn);
    }

    page.style.transition = 'transform 0.3s ease-out';
    page.style.transform = 'translateX(100%)';
    setTimeout(() => {
        page.classList.remove('active');
        page.style.transform = '';
        page.style.transition = '';
    }, 300);
}

// --- Movement Weekly Trends Page ---

function openMovementWeeklyTrendsPage() {
    const page = document.getElementById('movement-weekly-trends-page');
    if (!page) return;

    // Ensure overlay is a direct child of body so it's never hidden by a parent container
    if (page.parentElement !== document.body) {
        document.body.appendChild(page);
    }

    page.classList.add('active');
    page.style.transform = 'translateX(100%)';
    page.style.transition = 'transform 0.3s ease-out';
    requestAnimationFrame(() => {
        page.style.transform = 'translateX(0)';
    });

    // Push navigation state for Android back button
    pushNavigationState('movement-weekly-trends-page', () => closeMovementWeeklyTrendsPage());

    // Load data for the page
    Promise.allSettled([
        loadMovementWeeklyMetrics(),
        loadMovementMultiWeekData(4),
        loadMovementWorkoutJournal(),
        loadMovementWorkoutPatterns()
    ]);
}

function closeMovementWeeklyTrendsPage() {
    const page = document.getElementById('movement-weekly-trends-page');
    if (!page) return;

    const movementBtn = document.querySelector('.bottom-nav .nav-item[onclick*="movement"]');
    if (movementBtn) {
        switchAppTab('movement-tab', movementBtn);
    }

    page.style.transition = 'transform 0.3s ease-out';
    page.style.transform = 'translateX(100%)';
    setTimeout(() => {
        page.classList.remove('active');
        page.style.transform = '';
        page.style.transition = '';
    }, 300);
}

async function loadMovementWeeklyMetrics() {
    try {
        if (!window.currentUser) return;
        const userId = window.currentUser.id;

        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        const startDate = getLocalDateString(sevenDaysAgo);
        const endDate = getLocalDateString(today);

        // Fetch workouts for last 7 days (include created_at for session grouping)
        const [workoutsResult, activitiesResult] = await Promise.allSettled([
            window.supabaseClient
                .from('workouts')
                .select('workout_date, exercise_name, set_number, reps, weight_kg, created_at')
                .eq('user_id', userId)
                .eq('workout_type', 'history')
                .gte('workout_date', startDate)
                .lte('workout_date', endDate)
                .order('created_at', { ascending: true }),
            window.supabaseClient
                .from('activity_logs')
                .select('activity_date, activity_type, activity_label, duration_minutes, estimated_calories')
                .eq('user_id', userId)
                .gte('activity_date', startDate)
                .lte('activity_date', endDate)
                .order('activity_date', { ascending: true })
        ]);

        const workouts = workoutsResult.status === 'fulfilled' && !workoutsResult.value.error ? workoutsResult.value.data || [] : [];
        const activities = activitiesResult.status === 'fulfilled' && !activitiesResult.value.error ? activitiesResult.value.data || [] : [];

        // Calculate metrics - count individual workout sessions, not just unique dates
        // Group sets into sessions: sets created within 5 minutes of each other = 1 session
        const exerciseNames = new Set();
        const allActiveDates = new Set();
        const workoutDates = new Set();
        let totalSessions = 0;

        if (workouts.length > 0) {
            // Sort by created_at and group into sessions
            const sorted = [...workouts].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
            let sessionCount = 1;
            let lastCreatedAt = new Date(sorted[0].created_at || 0);

            sorted.forEach((w, idx) => {
                if (w.workout_date) {
                    workoutDates.add(w.workout_date);
                    allActiveDates.add(w.workout_date);
                }
                if (w.exercise_name) exerciseNames.add(w.exercise_name);

                if (idx > 0 && w.created_at) {
                    const current = new Date(w.created_at);
                    const diffMinutes = (current - lastCreatedAt) / (1000 * 60);
                    // If more than 30 minutes gap between sets, it's a new session
                    if (diffMinutes > 30) {
                        sessionCount++;
                    }
                    lastCreatedAt = current;
                }
            });

            totalSessions = sessionCount;
        }

        // Fallback: if created_at wasn't available, use unique dates
        if (totalSessions === 0 && workoutDates.size > 0) {
            totalSessions = workoutDates.size;
        }

        activities.forEach(a => {
            if (a.activity_date) allActiveDates.add(a.activity_date);
        });

        const totalExercises = exerciseNames.size;
        const activeDays = allActiveDates.size;

        updateElement('mvmt-weekly-workouts', totalSessions);
        updateElement('mvmt-weekly-exercises', totalExercises);
        updateElement('mvmt-weekly-active-days', activeDays);

        // Build daily breakdown
        const breakdownContainer = document.getElementById('mvmt-weekly-daily-breakdown');
        if (breakdownContainer) {
            let html = '';
            for (let i = 6; i >= 0; i--) {
                const day = new Date(today);
                day.setDate(day.getDate() - i);
                const dateStr = getLocalDateString(day);
                const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });

                const dayWorkouts = workouts.filter(w => w.workout_date === dateStr);
                const dayActivities = activities.filter(a => a.activity_date === dateStr);

                const dayExercises = [...new Set(dayWorkouts.map(w => w.exercise_name).filter(Boolean))];
                const dayActivityLabels = dayActivities.map(a => a.activity_label || a.activity_type).filter(Boolean);

                const hasActivity = dayWorkouts.length > 0 || dayActivities.length > 0;
                const totalSets = dayWorkouts.length;

                let rightLabel = 'Rest';
                if (totalSets > 0 && dayActivityLabels.length > 0) {
                    rightLabel = totalSets + ' sets + ' + dayActivityLabels[0];
                } else if (totalSets > 0) {
                    rightLabel = totalSets + ' sets';
                } else if (dayActivityLabels.length > 0) {
                    rightLabel = dayActivityLabels[0];
                }

                html += `
                    <div class="weekly-day-item">
                        <div class="weekly-day-header">
                            <span class="weekly-day-name">${dayName}</span>
                            <span class="weekly-day-calories">${rightLabel}</span>
                        </div>
                        <div class="progress-bar-small">
                            <div class="progress-fill" style="width: ${hasActivity ? '100' : '0'}%; background: ${hasActivity ? '#6366f1' : '#e5e7eb'};"></div>
                        </div>
                    </div>
                `;
            }
            breakdownContainer.innerHTML = html;
        }
    } catch (error) {
        console.error('Error in loadMovementWeeklyMetrics:', error);
    }
}

async function loadMovementMultiWeekData(numWeeks) {
    numWeeks = numWeeks || 4;
    try {
        if (!window.currentUser) return;
        const userId = window.currentUser.id;

        // Update nav buttons
        document.querySelectorAll('#mvmt-multi-week-nav button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent.includes(numWeeks)) btn.classList.add('active');
        });

        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - (numWeeks * 7));
        const startDateStr = getLocalDateString(startDate);

        const [workoutsResult, activitiesResult] = await Promise.allSettled([
            window.supabaseClient
                .from('workouts')
                .select('workout_date, exercise_name, set_number, reps, weight_kg, created_at')
                .eq('user_id', userId)
                .eq('workout_type', 'history')
                .gte('workout_date', startDateStr)
                .order('created_at', { ascending: true }),
            window.supabaseClient
                .from('activity_logs')
                .select('activity_date, duration_minutes, estimated_calories')
                .eq('user_id', userId)
                .gte('activity_date', startDateStr)
                .order('activity_date', { ascending: true })
        ]);

        const workouts = workoutsResult.status === 'fulfilled' && !workoutsResult.value.error ? workoutsResult.value.data || [] : [];
        const activities = activitiesResult.status === 'fulfilled' && !activitiesResult.value.error ? activitiesResult.value.data || [] : [];

        // Helper: count workout sessions by grouping sets with created_at within 30 min
        function countWorkoutSessions(workoutRows) {
            if (workoutRows.length === 0) return 0;
            const sorted = [...workoutRows].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
            let sessions = 1;
            let lastTime = new Date(sorted[0].created_at || 0);
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i].created_at) {
                    const current = new Date(sorted[i].created_at);
                    if ((current - lastTime) / (1000 * 60) > 30) sessions++;
                    lastTime = current;
                }
            }
            return sessions;
        }

        // Group by week
        const weeks = [];
        for (let w = 0; w < numWeeks; w++) {
            const weekStart = new Date(today);
            weekStart.setDate(weekStart.getDate() - ((numWeeks - 1 - w) * 7 + 6));
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);

            const weekStartStr = getLocalDateString(weekStart);
            const weekEndStr = getLocalDateString(weekEnd);

            const weekWorkouts = workouts.filter(d => d.workout_date >= weekStartStr && d.workout_date <= weekEndStr);
            const weekActivities = activities.filter(a => a.activity_date >= weekStartStr && a.activity_date <= weekEndStr);

            const workoutDateSet = new Set(weekWorkouts.map(r => r.workout_date).filter(Boolean));
            const activityDateSet = new Set(weekActivities.map(a => a.activity_date).filter(Boolean));
            const allDates = new Set([...workoutDateSet, ...activityDateSet]);

            // Count actual workout sessions (not just unique dates)
            const weekSessions = countWorkoutSessions(weekWorkouts);

            const totalSets = weekWorkouts.length;
            const totalVolume = weekWorkouts.reduce((sum, r) => {
                return sum + ((parseFloat(r.weight_kg) || 0) * (parseInt(r.reps) || 0));
            }, 0);

            const activityMinutes = weekActivities.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
            const workoutMinutes = totalSets * 2;

            weeks.push({
                label: 'Wk ' + (w + 1),
                sessions: weekSessions || workoutDateSet.size,
                totalSets: totalSets,
                totalVolume: Math.round(totalVolume),
                activeMinutes: activityMinutes + workoutMinutes,
                activeDays: allDates.size
            });
        }

        renderMovementMultiWeekUI(weeks);
    } catch (err) {
        console.error('Error in loadMovementMultiWeekData:', err);
    }
}

function renderMovementMultiWeekUI(weeks) {
    const container = document.getElementById('mvmt-multi-week-sparklines');
    const compareGrid = document.getElementById('mvmt-week-compare-grid');
    if (!container) return;

    if (!weeks || weeks.length === 0 || weeks.every(w => w.sessions === 0)) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 0.85rem;">Log workouts for at least 2 weeks to see trends</p>';
        if (compareGrid) compareGrid.innerHTML = '';
        return;
    }

    const metrics = [
        { key: 'sessions', label: 'Sessions', color: '#6366f1', suffix: '' },
        { key: 'totalSets', label: 'Sets', color: '#3b82f6', suffix: '' },
        { key: 'totalVolume', label: 'Volume', color: '#f59e0b', suffix: 'kg' },
        { key: 'activeMinutes', label: 'Minutes', color: '#ef4444', suffix: '' }
    ];

    let html = '';
    metrics.forEach(metric => {
        const values = weeks.map(w => w[metric.key]);
        const max = Math.max(...values, 1);
        const minPositive = values.filter(v => v > 0);
        const min = minPositive.length > 0 ? Math.min(...minPositive) : 0;
        const current = values[values.length - 1];
        const previous = values.length >= 2 ? values[values.length - 2] : current;

        let trendClass = 'neutral';
        let trendText = '--';
        if (previous > 0 && current > 0) {
            const pctChange = Math.round(((current - previous) / previous) * 100);
            if (pctChange > 2) { trendClass = 'up'; trendText = '+' + pctChange + '%'; }
            else if (pctChange < -2) { trendClass = 'down'; trendText = pctChange + '%'; }
            else { trendText = '~0%'; }
        }

        const svgWidth = 120;
        const svgHeight = 30;
        const padding = 4;
        const points = values.map((v, i) => {
            const x = padding + (i / (values.length - 1 || 1)) * (svgWidth - padding * 2);
            const y = max > min ? svgHeight - padding - ((v - min) / (max - min)) * (svgHeight - padding * 2) : svgHeight / 2;
            return x + ',' + y;
        }).join(' ');

        const displayValue = metric.key === 'totalVolume' && current >= 1000
            ? (Math.round(current / 100) / 10) + 'k'
            : current;

        html += '<div class="sparkline-row">';
        html += '<div class="sparkline-label">' + metric.label + '</div>';
        html += '<svg class="sparkline-svg" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '">';
        html += '<polyline points="' + points + '" fill="none" stroke="' + metric.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        values.forEach((v, i) => {
            const x = padding + (i / (values.length - 1 || 1)) * (svgWidth - padding * 2);
            const y = max > min ? svgHeight - padding - ((v - min) / (max - min)) * (svgHeight - padding * 2) : svgHeight / 2;
            html += '<circle cx="' + x + '" cy="' + y + '" r="3" fill="' + metric.color + '" opacity="' + (i === values.length - 1 ? 1 : 0.4) + '"/>';
        });
        html += '</svg>';
        html += '<div class="sparkline-value">' + displayValue + metric.suffix + '</div>';
        html += '<div class="sparkline-trend ' + trendClass + '">' + trendText + '</div>';
        html += '</div>';
    });

    container.innerHTML = html;

    if (compareGrid && weeks.length >= 2) {
        const thisWeek = weeks[weeks.length - 1];
        const lastWeek = weeks[weeks.length - 2];

        compareGrid.innerHTML = ''
            + '<div class="week-compare-stat">'
            + '    <div class="stat-value">' + thisWeek.sessions + '</div>'
            + '    <div class="stat-label">Sessions (This Week)</div>'
            + '</div>'
            + '<div class="week-compare-stat">'
            + '    <div class="stat-value">' + lastWeek.sessions + '</div>'
            + '    <div class="stat-label">Sessions (Last Week)</div>'
            + '</div>'
            + '<div class="week-compare-stat">'
            + '    <div class="stat-value">' + thisWeek.activeDays + '/7</div>'
            + '    <div class="stat-label">Active Days (This Week)</div>'
            + '</div>'
            + '<div class="week-compare-stat">'
            + '    <div class="stat-value">' + lastWeek.activeDays + '/7</div>'
            + '    <div class="stat-label">Active Days (Last Week)</div>'
            + '</div>';
    }
}

async function loadMovementWorkoutJournal() {
    try {
        if (!window.currentUser) return;
        const userId = window.currentUser.id;

        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        const startDate = getLocalDateString(sevenDaysAgo);
        const endDate = getLocalDateString(today);

        const [workoutsResult, activitiesResult] = await Promise.allSettled([
            window.supabaseClient
                .from('workouts')
                .select('workout_date, exercise_name, set_number, reps, weight_kg, created_at')
                .eq('user_id', userId)
                .eq('workout_type', 'history')
                .gte('workout_date', startDate)
                .lte('workout_date', endDate)
                .order('created_at', { ascending: false }),
            window.supabaseClient
                .from('activity_logs')
                .select('activity_date, activity_type, activity_label, duration_minutes, estimated_calories')
                .eq('user_id', userId)
                .gte('activity_date', startDate)
                .lte('activity_date', endDate)
                .order('activity_date', { ascending: false })
        ]);

        const workouts = workoutsResult.status === 'fulfilled' && !workoutsResult.value.error ? workoutsResult.value.data || [] : [];
        const activities = activitiesResult.status === 'fulfilled' && !activitiesResult.value.error ? activitiesResult.value.data || [] : [];

        const container = document.getElementById('mvmt-workout-journal-timeline');
        if (!container) return;

        // Group by session: sets within 30 min of each other = 1 session
        const sessions = [];
        if (workouts.length > 0) {
            const sorted = [...workouts].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
            let currentSession = { date: sorted[0].workout_date, created_at: sorted[0].created_at, sets: [sorted[0]] };

            for (let i = 1; i < sorted.length; i++) {
                const w = sorted[i];
                const prevTime = new Date(currentSession.sets[currentSession.sets.length - 1].created_at || 0);
                const currTime = new Date(w.created_at || 0);
                const diffMin = (currTime - prevTime) / (1000 * 60);

                if (diffMin > 30 || w.workout_date !== currentSession.date) {
                    sessions.push(currentSession);
                    currentSession = { date: w.workout_date, created_at: w.created_at, sets: [w] };
                } else {
                    currentSession.sets.push(w);
                }
            }
            sessions.push(currentSession);
        }

        // Also group activities by date
        const activitiesByDate = {};
        activities.forEach(a => {
            if (!a.activity_date) return;
            if (!activitiesByDate[a.activity_date]) activitiesByDate[a.activity_date] = [];
            activitiesByDate[a.activity_date].push(a);
        });

        // Build journal entries: each session is a separate entry, plus activity-only dates
        const journalEntries = [];

        // Add workout sessions
        sessions.forEach(session => {
            const exercises = {};
            session.sets.forEach(w => {
                if (!exercises[w.exercise_name]) {
                    exercises[w.exercise_name] = { name: w.exercise_name, sets: 0, bestWeight: 0, bestReps: 0 };
                }
                var ex = exercises[w.exercise_name];
                ex.sets++;
                var weight = parseFloat(w.weight_kg) || 0;
                var reps = parseInt(w.reps) || 0;
                if (weight > ex.bestWeight) { ex.bestWeight = weight; ex.bestReps = reps; }
                else if (weight === ex.bestWeight && reps > ex.bestReps) { ex.bestReps = reps; }
            });
            journalEntries.push({
                date: session.date,
                created_at: session.created_at,
                exercises: Object.values(exercises),
                activities: activitiesByDate[session.date] || []
            });
            // Mark this date's activities as used
            delete activitiesByDate[session.date];
        });

        // Add activity-only dates (dates with activities but no workouts)
        Object.keys(activitiesByDate).forEach(dateStr => {
            journalEntries.push({
                date: dateStr,
                created_at: dateStr,
                exercises: [],
                activities: activitiesByDate[dateStr]
            });
        });

        // Sort by date descending, then by created_at descending
        journalEntries.sort((a, b) => {
            if (a.date !== b.date) return new Date(b.date) - new Date(a.date);
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });

        if (journalEntries.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 12px 0; font-size: 0.85rem;">No workouts logged this week</p>';
            return;
        }

        var html = '';
        journalEntries.forEach(function(entry) {
            var date = new Date(entry.date + 'T12:00:00');
            var dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            var dayNum = date.getDate();
            var exercises = entry.exercises;
            var acts = entry.activities;

            var detailsHtml = '';
            exercises.forEach(function(ex) {
                var weightInfo = ex.bestWeight > 0 ? ex.bestWeight + 'kg x ' + ex.bestReps : ex.bestReps + ' reps';
                detailsHtml += '<div style="background: #ededff; color: #4338ca; padding: 6px 12px; border-radius: 10px; font-size: 0.8rem; font-weight: 600;">'
                    + ex.name + ' <span style="opacity:0.6; font-weight: 500;">(' + ex.sets + 's · ' + weightInfo + ')</span></div>';
            });

            acts.forEach(function(a) {
                var label = a.activity_label || a.activity_type;
                var mins = a.duration_minutes ? a.duration_minutes + 'min' : '';
                detailsHtml += '<div style="background: #ecfdf5; color: #16a34a; padding: 6px 12px; border-radius: 10px; font-size: 0.8rem; font-weight: 600;">'
                    + label + ' <span style="opacity:0.6; font-weight: 500;">' + mins + '</span></div>';
            });

            var totalSets = exercises.reduce(function(s, e) { return s + e.sets; }, 0);
            var totalExercises = exercises.length;
            var summaryParts = [];
            if (totalExercises > 0) summaryParts.push(totalExercises + ' exercise' + (totalExercises !== 1 ? 's' : '') + ' · ' + totalSets + ' sets');
            if (acts.length > 0) summaryParts.push(acts.length + ' activit' + (acts.length !== 1 ? 'ies' : 'y'));

            html += '<div style="background: #fafafa; border-radius: 12px; padding: 14px 16px; border: 1px solid #f0f0f0;">'
                + '<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">'
                + '    <div style="background: #6366f1; color: white; width: 42px; height: 42px; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;">'
                + '        <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; line-height: 1; opacity: 0.9;">' + dayName + '</div>'
                + '        <div style="font-size: 1.1rem; font-weight: 800; line-height: 1.1;">' + dayNum + '</div>'
                + '    </div>'
                + '    <div style="flex: 1; font-size: 0.82rem; color: var(--text-muted); font-weight: 600;">' + summaryParts.join(' · ') + '</div>'
                + '</div>'
                + '<div style="display: flex; flex-wrap: wrap; gap: 6px;">'
                + detailsHtml
                + '</div>'
                + '</div>';
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('Error in loadMovementWorkoutJournal:', error);
    }
}

async function loadMovementWorkoutPatterns() {
    try {
        if (!window.currentUser) return;
        var userId = window.currentUser.id;

        var today = new Date();
        var sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        var startDate = getLocalDateString(sevenDaysAgo);
        var endDate = getLocalDateString(today);

        var [workoutsResult, activitiesResult] = await Promise.allSettled([
            window.supabaseClient
                .from('workouts')
                .select('workout_date, exercise_name, reps, weight_kg, set_number')
                .eq('user_id', userId)
                .eq('workout_type', 'history')
                .gte('workout_date', startDate)
                .lte('workout_date', endDate)
                .order('workout_date', { ascending: true }),
            window.supabaseClient
                .from('activity_logs')
                .select('activity_date, activity_type, duration_minutes')
                .eq('user_id', userId)
                .gte('activity_date', startDate)
                .lte('activity_date', endDate)
                .order('activity_date', { ascending: true })
        ]);

        var workouts = workoutsResult.status === 'fulfilled' && !workoutsResult.value.error ? workoutsResult.value.data || [] : [];
        var activities = activitiesResult.status === 'fulfilled' && !activitiesResult.value.error ? activitiesResult.value.data || [] : [];

        var insights = analyzeMovementPatterns(workouts, activities, today);
        renderMovementPatternInsights(insights);
    } catch (error) {
        console.error('Error in loadMovementWorkoutPatterns:', error);
    }
}

function analyzeMovementPatterns(workouts, activities, today) {
    var insights = [];

    var workoutDates = new Set(workouts.map(function(w) { return w.workout_date; }).filter(Boolean));
    var activityDates = new Set(activities.map(function(a) { return a.activity_date; }).filter(Boolean));
    var allDates = new Set([...workoutDates, ...activityDates]);

    if (allDates.size === 0) return insights;

    // 1. Training frequency
    var activeDays = allDates.size;
    var restDays = 7 - activeDays;
    if (activeDays >= 6) {
        insights.push({ icon: '⚡', text: 'You trained <strong>' + activeDays + ' out of 7 days</strong> this week. Consider adding a rest day for recovery.' });
    } else if (activeDays >= 4) {
        insights.push({ icon: '💪', text: '<strong>' + activeDays + ' active days</strong> this week with <strong>' + restDays + ' rest days</strong>. Great balance of training and recovery!' });
    } else if (activeDays >= 1) {
        insights.push({ icon: '📈', text: '<strong>' + activeDays + ' active day' + (activeDays !== 1 ? 's' : '') + '</strong> this week. Try to aim for 3-4 sessions for consistent progress.' });
    }

    // 2. Exercise variety
    var uniqueExercises = new Set(workouts.map(function(w) { return w.exercise_name; }).filter(Boolean));
    if (uniqueExercises.size >= 8) {
        insights.push({ icon: '🎯', text: '<strong>' + uniqueExercises.size + ' different exercises</strong> this week. Excellent variety across muscle groups!' });
    } else if (uniqueExercises.size >= 4) {
        insights.push({ icon: '🔄', text: '<strong>' + uniqueExercises.size + ' exercises</strong> in your rotation. Consider mixing in new movements for balanced development.' });
    } else if (uniqueExercises.size >= 1) {
        insights.push({ icon: '🎯', text: 'Only <strong>' + uniqueExercises.size + ' exercise' + (uniqueExercises.size !== 1 ? 's' : '') + '</strong> this week. Adding variety can help prevent plateaus.' });
    }

    // 3. Volume check
    var totalSets = workouts.length;
    var totalVolume = workouts.reduce(function(sum, w) {
        return sum + ((parseFloat(w.weight_kg) || 0) * (parseInt(w.reps) || 0));
    }, 0);
    if (totalVolume > 0) {
        var avgVolumePerSession = workoutDates.size > 0 ? Math.round(totalVolume / workoutDates.size) : 0;
        var volDisplay = totalVolume >= 1000 ? (Math.round(totalVolume / 100) / 10) + 'k' : totalVolume;
        insights.push({ icon: '🏋️', text: 'Total volume: <strong>' + volDisplay + ' kg</strong> across <strong>' + totalSets + ' sets</strong>.' + (avgVolumePerSession > 0 ? ' Averaging ' + avgVolumePerSession + ' kg per session.' : '') });
    }

    // 4. Consecutive rest days warning
    var maxConsecutiveRest = 0;
    var currentRestStreak = 0;
    for (var i = 6; i >= 0; i--) {
        var day = new Date(today);
        day.setDate(day.getDate() - i);
        var dateStr = getLocalDateString(day);
        if (allDates.has(dateStr)) {
            currentRestStreak = 0;
        } else {
            currentRestStreak++;
            maxConsecutiveRest = Math.max(maxConsecutiveRest, currentRestStreak);
        }
    }
    if (maxConsecutiveRest >= 3) {
        insights.push({ icon: '⏰', text: '<strong>' + maxConsecutiveRest + ' consecutive rest days</strong> detected. A short walk or stretch session can help maintain momentum.' });
    }

    // 5. Activity mix
    if (activities.length > 0 && workoutDates.size > 0) {
        insights.push({ icon: '🌟', text: 'Nice mix of <strong>structured workouts</strong> and <strong>activities</strong> this week. Cross-training supports overall fitness.' });
    }

    return insights.slice(0, 4);
}

function renderMovementPatternInsights(insights) {
    var container = document.getElementById('mvmt-workout-pattern-insights');
    if (!container) return;

    if (!insights || insights.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 12px 0; font-size: 0.85rem;">Log more workouts to see patterns</p>';
        return;
    }

    var html = '';
    insights.forEach(function(insight) {
        html += '<div class="pattern-insight">'
            + '<div class="pattern-icon">' + insight.icon + '</div>'
            + '<div class="pattern-text">' + insight.text + '</div>'
            + '</div>';
    });
    container.innerHTML = html;
}

// --- 11. Macro Ratio Pie Chart ---
function updateMacroPieChart(dailyData) {
    const svg = document.getElementById('macro-pie-svg');
    const legend = document.getElementById('macro-pie-legend');
    if (!svg) return;

    const protein = dailyData?.total_protein_g || 0;
    const carbs = dailyData?.total_carbs_g || 0;
    const fat = dailyData?.total_fat_g || 0;

    // Convert to calories for ratio
    const proCal = protein * 4;
    const carbCal = carbs * 4;
    const fatCal = fat * 9;
    const totalCal = proCal + carbCal + fatCal;

    if (totalCal === 0) {
        svg.innerHTML = '<circle cx="60" cy="60" r="50" fill="#f3f4f6" stroke="none"/><text x="60" y="63" text-anchor="middle" font-size="10" fill="#9ca3af">No data</text>';
        return;
    }

    const proPct = Math.round((proCal / totalCal) * 100);
    const carbPct = Math.round((carbCal / totalCal) * 100);
    const fatPct = 100 - proPct - carbPct;

    // Build donut segments
    const segments = [
        { pct: proPct, color: '#3b82f6' },
        { pct: carbPct, color: '#f59e0b' },
        { pct: fatPct, color: '#ef4444' }
    ];

    const radius = 50;
    const cx = 60, cy = 60;
    const circumference = 2 * Math.PI * radius;
    let accumulatedOffset = 0;
    let svgContent = '';

    segments.forEach(seg => {
        const dashLen = (seg.pct / 100) * circumference;
        const dashGap = circumference - dashLen;
        const rotation = (accumulatedOffset / 100) * 360 - 90;
        svgContent += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${seg.color}" stroke-width="20"
            stroke-dasharray="${dashLen} ${dashGap}"
            transform="rotate(${rotation} ${cx} ${cy})"/>`;
        accumulatedOffset += seg.pct;
    });

    // Inner white circle for donut hole
    svgContent += `<circle cx="${cx}" cy="${cy}" r="32" fill="white"/>`;
    // Center text
    svgContent += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--text-main)">${Math.round(totalCal)}</text>`;
    svgContent += `<text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="7" fill="var(--text-muted)">cal</text>`;

    svg.innerHTML = svgContent;

    // Update legend with target comparison
    if (legend) {
        const goalPro = dailyData?.protein_goal_g || 50;
        const goalCarb = dailyData?.carbs_goal_g || 250;
        const goalFat = dailyData?.fat_goal_g || 70;
        const goalProCal = goalPro * 4;
        const goalCarbCal = goalCarb * 4;
        const goalFatCal = goalFat * 9;
        const goalTotal = goalProCal + goalCarbCal + goalFatCal;
        const goalProPct = goalTotal > 0 ? Math.round((goalProCal / goalTotal) * 100) : 0;
        const goalCarbPct = goalTotal > 0 ? Math.round((goalCarbCal / goalTotal) * 100) : 0;
        const goalFatPct = goalTotal > 0 ? 100 - goalProPct - goalCarbPct : 0;

        legend.innerHTML = `
            <div class="macro-pie-legend-item"><span class="macro-legend-dot" style="background: #3b82f6;"></span><span class="macro-legend-label">Protein</span><span class="macro-legend-value">${proPct}% <span style="font-weight:400;color:var(--text-muted);font-size:0.72rem;">(goal ${goalProPct}%)</span></span></div>
            <div class="macro-pie-legend-item"><span class="macro-legend-dot" style="background: #f59e0b;"></span><span class="macro-legend-label">Carbs</span><span class="macro-legend-value">${carbPct}% <span style="font-weight:400;color:var(--text-muted);font-size:0.72rem;">(goal ${goalCarbPct}%)</span></span></div>
            <div class="macro-pie-legend-item"><span class="macro-legend-dot" style="background: #ef4444;"></span><span class="macro-legend-label">Fat</span><span class="macro-legend-value">${fatPct}% <span style="font-weight:400;color:var(--text-muted);font-size:0.72rem;">(goal ${goalFatPct}%)</span></span></div>
        `;
    }
}

// --- 12. Meal Prep Score ---
async function loadMealPrepScore() {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;

        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        const { data: meals, error } = await window.supabaseClient
            .from('meal_logs')
            .select('meal_date, meal_type, photo_url, food_items, ai_confidence')
            .eq('user_id', window.currentUser.id)
            .gte('meal_date', getLocalDateString(sevenDaysAgo))
            .order('meal_date', { ascending: true });

        if (error) { console.error('Error loading meal prep data:', error); return; }
        renderMealPrepScore(meals || []);
    } catch (err) {
        console.error('Error in loadMealPrepScore:', err);
    }
}

function renderMealPrepScore(meals) {
    const circleEl = document.getElementById('prep-score-circle');
    const valueEl = document.getElementById('prep-score-value');
    const labelEl = document.getElementById('prep-score-label');
    const statsEl = document.getElementById('prep-stats');

    if (!meals || meals.length === 0) {
        if (valueEl) valueEl.textContent = '--';
        if (statsEl) statsEl.innerHTML = '<div class="prep-stat"><div class="prep-stat-value">0</div><div class="prep-stat-label">Total Meals</div></div>';
        return;
    }

    // Classify meals as home-cooked vs dining out
    // Home-cooked: has photo with high/medium confidence, or text-input meals
    // Dining out: meal type contains "dining" or food_items suggest restaurant
    let homeMeals = 0;
    let diningMeals = 0;

    meals.forEach(m => {
        const items = Array.isArray(m.food_items) ? m.food_items : [];
        const isDining = items.some(i =>
            (i.name || '').toLowerCase().match(/restaurant|takeout|take-out|delivery|uber|doordash|fast food|mcdonald|burger king|subway|starbucks|pizza hut|chipotle|panda express/)
        );
        if (isDining) diningMeals++;
        else homeMeals++;
    });

    const total = meals.length;
    const score = total > 0 ? Math.round((homeMeals / total) * 100) : 0;

    if (valueEl) valueEl.textContent = score;
    if (circleEl) {
        const circumference = 2 * Math.PI * 38;
        const offset = circumference * (1 - score / 100);
        circleEl.style.strokeDashoffset = offset;
    }
    if (labelEl) {
        if (score >= 80) labelEl.textContent = 'Amazing prep consistency!';
        else if (score >= 60) labelEl.textContent = 'Solid home cooking habit';
        else if (score >= 40) labelEl.textContent = 'Room to cook more at home';
        else labelEl.textContent = 'Try prepping a few meals this week';
    }

    // Group by day
    const daySet = new Set(meals.map(m => m.meal_date));

    if (statsEl) {
        statsEl.innerHTML = `
            <div class="prep-stat"><div class="prep-stat-value">${homeMeals}</div><div class="prep-stat-label">Home Meals</div></div>
            <div class="prep-stat"><div class="prep-stat-value">${diningMeals}</div><div class="prep-stat-label">Dining Out</div></div>
            <div class="prep-stat"><div class="prep-stat-value">${daySet.size}/7</div><div class="prep-stat-label">Days Active</div></div>
        `;
    }
}

// --- 13. Nutrition Badges ---
async function loadNutritionBadges() {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;

        const userId = window.currentUser.id;
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get daily nutrition for last 30 days
        const { data: days, error } = await window.supabaseClient
            .from('daily_nutrition')
            .select('nutrition_date, total_calories, total_protein_g, total_carbs_g, total_fat_g, calorie_goal, protein_goal_g, carbs_goal_g, fat_goal_g')
            .eq('user_id', userId)
            .gte('nutrition_date', getLocalDateString(thirtyDaysAgo))
            .order('nutrition_date', { ascending: true });

        if (error) { console.error('Error loading badge data:', error); return; }

        // Get meal count
        const { count: mealCount } = await window.supabaseClient
            .from('meal_logs')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);

        // Get micronutrient data
        const { data: mealMicros } = await window.supabaseClient
            .from('meal_logs')
            .select('meal_date, micronutrients')
            .eq('user_id', userId)
            .gte('meal_date', getLocalDateString(thirtyDaysAgo));

        renderNutritionBadges(days || [], mealCount || 0, mealMicros || []);
    } catch (err) {
        console.error('Error in loadNutritionBadges:', err);
    }
}

function renderNutritionBadges(days, mealCount, mealMicros) {
    const grid = document.getElementById('badges-grid');
    if (!grid) return;

    // Calculate streaks and achievements
    let proteinStreak = 0;
    let maxProteinStreak = 0;
    let balancedStreak = 0;
    let maxBalancedStreak = 0;
    let loggingStreak = 0;
    let maxLoggingStreak = 0;

    // Iron tracking
    let ironDays = 0;
    const ironByDate = {};
    (mealMicros || []).forEach(m => {
        if (m.micronutrients && m.micronutrients.iron) {
            ironByDate[m.meal_date] = (ironByDate[m.meal_date] || 0) + m.micronutrients.iron;
        }
    });
    Object.values(ironByDate).forEach(v => { if (v >= 14) ironDays++; }); // ~80% RDA

    const sortedDays = [...days].sort((a, b) => a.nutrition_date.localeCompare(b.nutrition_date));

    sortedDays.forEach(d => {
        if (d.total_calories > 0) {
            loggingStreak++;
            maxLoggingStreak = Math.max(maxLoggingStreak, loggingStreak);
        } else {
            loggingStreak = 0;
        }

        const proGoal = d.protein_goal_g || 50;
        if (d.total_protein_g >= proGoal * 0.9) {
            proteinStreak++;
            maxProteinStreak = Math.max(maxProteinStreak, proteinStreak);
        } else {
            proteinStreak = 0;
        }

        // Balanced = all macros within 15%
        const calOk = d.calorie_goal > 0 && Math.abs(d.total_calories - d.calorie_goal) / d.calorie_goal < 0.15;
        const proOk = proGoal > 0 && Math.abs(d.total_protein_g - proGoal) / proGoal < 0.15;
        const carbGoal = d.carbs_goal_g || 250;
        const carbOk = carbGoal > 0 && Math.abs(d.total_carbs_g - carbGoal) / carbGoal < 0.15;
        if (calOk && proOk && carbOk) {
            balancedStreak++;
            maxBalancedStreak = Math.max(maxBalancedStreak, balancedStreak);
        } else {
            balancedStreak = 0;
        }
    });

    // Define badges
    const badges = [
        { icon: '&#x1F525;', name: 'First Flame', desc: 'Log meals 3 days in a row', target: 3, current: maxLoggingStreak, earned: maxLoggingStreak >= 3 },
        { icon: '&#x1F4AA;', name: 'Protein Pro', desc: 'Hit protein goal 7 days', target: 7, current: maxProteinStreak, earned: maxProteinStreak >= 7 },
        { icon: '&#x2696;&#xFE0F;', name: 'Balanced Week', desc: 'All macros within 15% for 7 days', target: 7, current: maxBalancedStreak, earned: maxBalancedStreak >= 7 },
        { icon: '&#x1FA78;', name: 'Iron Warrior', desc: 'Hit iron RDA 7 days', target: 7, current: ironDays, earned: ironDays >= 7 },
        { icon: '&#x1F4F8;', name: 'Snap Happy', desc: 'Log 50 meals', target: 50, current: Math.min(mealCount, 50), earned: mealCount >= 50 },
        { icon: '&#x1F451;', name: 'Legend', desc: 'Log meals 30 days straight', target: 30, current: maxLoggingStreak, earned: maxLoggingStreak >= 30 }
    ];

    grid.innerHTML = badges.map(b => {
        const progress = b.target > 0 ? Math.min(100, Math.round((b.current / b.target) * 100)) : 0;
        const stateClass = b.earned ? 'earned' : (b.current > 0 ? '' : 'locked');
        return `
            <div class="badge-item ${stateClass}">
                <div class="badge-icon">${b.earned ? b.icon : '&#x1F512;'}</div>
                <div class="badge-name">${b.name}</div>
                <div class="badge-progress">${b.earned ? 'Earned!' : `${b.current}/${b.target}`}</div>
            </div>
        `;
    }).join('');
}

// --- 14. Social Meal Comparison ---
async function loadSocialComparison() {
    try {
        const session = await window.authHelpers?.getSession();
        if (!session?.user) return;

        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        // Get this user's averages
        const { data: myDays, error } = await window.supabaseClient
            .from('daily_nutrition')
            .select('total_calories, total_protein_g, total_carbs_g, total_fat_g, calorie_goal')
            .eq('user_id', window.currentUser.id)
            .gte('nutrition_date', getLocalDateString(sevenDaysAgo));

        if (error) { console.error('Error loading social comparison:', error); return; }

        const myData = (myDays || []).filter(d => d.total_calories > 0);
        if (myData.length < 2) {
            const container = document.getElementById('social-compare-content');
            if (container) container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 12px 0; font-size: 0.85rem;">Log at least 2 days to see how you compare</p>';
            return;
        }

        const myAvgCal = Math.round(myData.reduce((s, d) => s + d.total_calories, 0) / myData.length);
        const myAvgPro = Math.round(myData.reduce((s, d) => s + d.total_protein_g, 0) / myData.length);
        const myGoal = myData[0]?.calorie_goal || 2000;
        const myConsistency = myData.length; // Days logged out of 7

        // Get anonymized community averages (all users, last 7 days)
        const { data: communityData, error: commError } = await window.supabaseClient
            .from('daily_nutrition')
            .select('total_calories, total_protein_g')
            .gte('nutrition_date', getLocalDateString(sevenDaysAgo))
            .gt('total_calories', 0);

        if (commError) {
            console.error('Error loading community data:', commError);
            renderSocialFallback(myAvgCal, myAvgPro, myConsistency);
            return;
        }

        const community = communityData || [];
        if (community.length < 5) {
            renderSocialFallback(myAvgCal, myAvgPro, myConsistency);
            return;
        }

        // Calculate percentiles
        const allCals = community.map(d => d.total_calories).sort((a, b) => a - b);
        const allPro = community.map(d => d.total_protein_g).sort((a, b) => a - b);

        const calPercentile = Math.round((allCals.filter(c => c <= myAvgCal).length / allCals.length) * 100);
        const proPercentile = Math.round((allPro.filter(p => p <= myAvgPro).length / allPro.length) * 100);
        const consistencyPercentile = Math.min(100, Math.round((myConsistency / 7) * 100));

        // Goal adherence
        const goalAdherence = myGoal > 0 ? Math.round((1 - Math.abs(myAvgCal - myGoal) / myGoal) * 100) : 50;

        renderSocialComparison(proPercentile, consistencyPercentile, goalAdherence);
    } catch (err) {
        console.error('Error in loadSocialComparison:', err);
    }
}

function renderSocialFallback(avgCal, avgPro, consistency) {
    // Fallback when not enough community data — show personal stats as percentile estimates
    const proPercentile = Math.min(95, Math.max(20, Math.round(avgPro / 0.8)));
    const consistencyPercentile = Math.round((consistency / 7) * 100);
    const goalPercentile = 50;
    renderSocialComparison(proPercentile, consistencyPercentile, goalPercentile);
}

function renderSocialComparison(proteinPct, consistencyPct, goalPct) {
    const container = document.getElementById('social-compare-content');
    if (!container) return;

    const stats = [
        { label: 'Protein', pct: Math.min(99, Math.max(1, proteinPct)), desc: 'intake vs community' },
        { label: 'Logging', pct: Math.min(99, Math.max(1, consistencyPct)), desc: 'consistency' },
        { label: 'On Goal', pct: Math.min(99, Math.max(1, goalPct)), desc: 'adherence' }
    ];

    container.innerHTML = stats.map(s => `
        <div class="social-stat-row">
            <div class="social-stat-label">${s.label}</div>
            <div class="social-bar-bg"><div class="social-bar-fill" style="width: ${s.pct}%;"></div></div>
            <div class="social-percentile">Top ${100 - s.pct}%</div>
        </div>
    `).join('') + '<p style="text-align: center; font-size: 0.68rem; color: #9333ea; margin: 10px 0 0 0;">Based on anonymous, aggregated data from all users</p>';
}

// --- Master function to load all enhanced nutrition features ---
async function loadEnhancedNutritionFeatures() {
    try {
        // Load features in parallel for speed
        // Weekly trends, meal patterns, meal journal are now loaded on-demand from Weekly Trends page
        await Promise.allSettled([
            loadStreakData(),
            loadMicronutrientInsights()
        ]);
        // Synchronous features (use already-loaded data)
        loadCycleNutritionTips();
        initHydrationTracker();
    } catch (err) {
        console.error('Error loading enhanced nutrition features:', err);
    }
}

// Update nutrition UI with data
function updateNutritionUI(dailyData, mealsData) {
    const defaults = {
        total_calories: 0,
        total_protein_g: 0,
        total_carbs_g: 0,
        total_fat_g: 0,
        total_fiber_g: 0,
        calorie_goal: 2000,
        protein_goal_g: 50,
        carbs_goal_g: 250,
        fat_goal_g: 70
    };

    const data = dailyData || defaults;

    // Update widget (dashboard)
    updateElement('widget-calories-current', Math.round(data.total_calories || 0));
    updateElement('widget-calories-goal', data.calorie_goal || 2000);
    updateElement('widget-protein', Math.round(data.total_protein_g || 0));
    updateElement('widget-protein-goal', data.protein_goal_g || 50);
    updateElement('widget-carbs', Math.round(data.total_carbs_g || 0));
    updateElement('widget-carbs-goal', data.carbs_goal_g || 250);
    updateElement('widget-fat', Math.round(data.total_fat_g || 0));
    updateElement('widget-fat-goal', data.fat_goal_g || 70);

    // Update progress bars (widget)
    updateProgressBar('widget-calories-bar', data.total_calories, data.calorie_goal || 2000);
    updateProgressBar('widget-protein-bar', data.total_protein_g, data.protein_goal_g || 50);
    updateProgressBar('widget-carbs-bar', data.total_carbs_g, data.carbs_goal_g || 250);
    updateProgressBar('widget-fat-bar', data.total_fat_g, data.fat_goal_g || 70);

    // Update tracker (full view)
    updateElement('tracker-calories-current', Math.round(data.total_calories || 0));
    updateElement('tracker-calories-goal', data.calorie_goal || 2000);
    updateElement('tracker-protein', Math.round(data.total_protein_g || 0));
    updateElement('tracker-protein-goal', data.protein_goal_g || 50);
    updateElement('tracker-carbs', Math.round(data.total_carbs_g || 0));
    updateElement('tracker-carbs-goal', data.carbs_goal_g || 250);
    updateElement('tracker-fat', Math.round(data.total_fat_g || 0));
    updateElement('tracker-fat-goal', data.fat_goal_g || 70);
    updateElement('tracker-fiber', Math.round(data.total_fiber_g || 0));
    updateElement('tracker-fiber-goal', 25);

    // Update progress bars (tracker)
    updateProgressBar('tracker-protein-bar', data.total_protein_g, data.protein_goal_g || 50);
    updateProgressBar('tracker-carbs-bar', data.total_carbs_g, data.carbs_goal_g || 250);
    updateProgressBar('tracker-fat-bar', data.total_fat_g, data.fat_goal_g || 70);
    updateProgressBar('tracker-fiber-bar', data.total_fiber_g, 25);

    // Update circular progress (tri-color macro ring)
    updateCircularProgress(
        data.total_calories,
        data.calorie_goal || 2000,
        data.total_protein_g,
        data.total_carbs_g,
        data.total_fat_g
    );

    // Update meals list
    if (mealsData && mealsData.length > 0) {
        renderMealsList(mealsData);
    }

    // Update daily nutrition score
    updateNutritionScoreUI(data);
}

// Helper function to update element text
function updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}

// Helper function to update progress bar
function updateProgressBar(id, current, goal) {
    const el = document.getElementById(id);
    if (el && goal > 0) {
        const percent = Math.min((current / goal) * 100, 100);
        el.style.width = percent + '%';
    }
}

// Update circular progress (tri-color macro ring)
function updateCircularProgress(current, goal, proteinG, carbsG, fatG) {
    const svg = document.getElementById('calorie-circle-svg');
    if (!svg || !goal || goal <= 0) return;

    const radius = 90;
    const circumference = 2 * Math.PI * radius;
    const totalPercent = Math.min(current / goal, 1);
    const totalFill = totalPercent * circumference;

    // Convert macros to calories
    const proCal = (proteinG || 0) * 4;
    const carbCal = (carbsG || 0) * 4;
    const fatCal = (fatG || 0) * 9;
    const macroCal = proCal + carbCal + fatCal;

    // Calculate each segment's share of the filled arc
    let proFill = 0, carbFill = 0, fatFill = 0;
    if (macroCal > 0) {
        proFill = (proCal / macroCal) * totalFill;
        carbFill = (carbCal / macroCal) * totalFill;
        fatFill = (fatCal / macroCal) * totalFill;
    }

    // Clear existing progress circles (keep bg circle)
    const existingProgress = svg.querySelectorAll('.macro-ring-segment');
    existingProgress.forEach(el => el.remove());

    const segments = [
        { fill: proFill, color: '#3b82f6' },   // Protein - blue
        { fill: carbFill, color: '#f59e0b' },   // Carbs - amber
        { fill: fatFill, color: '#ef4444' }      // Fat - red
    ];

    let accumulatedAngle = -90; // Start from top
    segments.forEach(seg => {
        if (seg.fill <= 0) return;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', 'macro-ring-segment');
        circle.setAttribute('cx', '100');
        circle.setAttribute('cy', '100');
        circle.setAttribute('r', String(radius));
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', seg.color);
        circle.setAttribute('stroke-width', '12');
        circle.setAttribute('stroke-linecap', 'butt');
        circle.setAttribute('stroke-dasharray', `${seg.fill} ${circumference - seg.fill}`);
        circle.setAttribute('transform', `rotate(${accumulatedAngle} 100 100)`);
        circle.style.transition = 'stroke-dasharray 0.5s ease, transform 0.5s ease';
        svg.appendChild(circle);
        // Calculate rotation for next segment
        accumulatedAngle += (seg.fill / circumference) * 360;
    });

    // Update macro ring legend percentages
    if (macroCal > 0) {
        const proPct = Math.round((proCal / macroCal) * 100);
        const carbPct = Math.round((carbCal / macroCal) * 100);
        const fatPct = 100 - proPct - carbPct;
        updateElement('macro-ring-protein-pct', proPct + '%');
        updateElement('macro-ring-carbs-pct', carbPct + '%');
        updateElement('macro-ring-fat-pct', fatPct + '%');
    }
}

// Store meals data for popup access
let currentMealsList = [];

// Check if image URL is accessible (for debugging)
async function checkImageUrl(url) {
    if (!url || url === 'text-input') return { accessible: false, reason: 'no-url' };
    try {
        const response = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
        // Note: no-cors mode always returns opaque response, so we can't check status
        // But if it throws, the URL is definitely not accessible
        return { accessible: true, status: 'opaque' };
    } catch (error) {
        console.log('Image URL check failed:', url, error.message);
        return { accessible: false, reason: error.message };
    }
}

// Render meals list
function renderMealsList(meals) {
    const container = document.getElementById('meals-log-list');
    if (!container) return;

    // Store meals for popup access
    currentMealsList = meals || [];

    // Debug: Log meal photo URLs and check accessibility
    console.log('Meals data received:', meals?.map(m => ({
        time: m.meal_time,
        photo_url: m.photo_url,
        hasValidPhoto: m.photo_url && m.photo_url.trim() !== '' && m.photo_url !== 'text-input'
    })));

    // Check first meal photo URL for debugging
    if (meals && meals.length > 0) {
        const firstMealWithPhoto = meals.find(m => m.photo_url && m.photo_url.trim() !== '' && m.photo_url !== 'text-input');
        if (firstMealWithPhoto) {
            checkImageUrl(firstMealWithPhoto.photo_url).then(result => {
                console.log('Image URL accessibility check:', result);
            });
        }
    }

    if (!meals || meals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
                    📸 No meals logged yet today.<br>
                    <span style="font-size: 0.9rem;">Take a photo of your meal to get started!</span>
                </p>
            </div>
        `;
        return;
    }

    let html = '';
    meals.forEach((meal, index) => {
        const time = new Date(`2000-01-01T${meal.meal_time}`).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        const foodItemsText = Array.isArray(meal.food_items)
            ? meal.food_items.map(item => item.name).join(', ')
            : 'Food';

        // Handle photo display - show placeholder if no photo or text-input placeholder
        const hasPhoto = meal.photo_url && meal.photo_url.trim() !== '' && meal.photo_url !== 'text-input';
        const imageHtml = hasPhoto
            ? `<div class="meal-log-image" style="overflow: hidden;"><img src="${meal.photo_url}" alt="Meal" style="width: 100%; height: 100%; object-fit: cover;" referrerpolicy="no-referrer" onerror="try{console.log('Meal card image failed to load:', this.src);var p=this.parentElement;if(p){p.innerHTML='🍽️';p.style.display='flex';p.style.alignItems='center';p.style.justifyContent='center';p.style.fontSize='2rem';}}catch(e){}"></div>`
            : `<div class="meal-log-image" style="display: flex; align-items: center; justify-content: center; font-size: 2rem;">🍽️</div>`;

        // Check if any item in this meal is verified
        const isVerified = Array.isArray(meal.food_items) && meal.food_items.some(item => item.verified);
        const verifiedTag = isVerified ? `<span class="verified-badge">✓ Verified</span>` : '';

        const mealTypeLabel = meal.meal_type ? meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1) : '';

        html += `
            <div class="meal-log-card" onclick="openMealDetailPopup(${index})">
                ${imageHtml}
                <div class="meal-log-content">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
                        <div class="meal-log-time">${mealTypeLabel ? `<span class="meal-type-tag">${mealTypeLabel}</span> ` : ''}${time}</div>
                        ${verifiedTag}
                    </div>
                    <div class="meal-log-foods">${foodItemsText}</div>
                    <div class="meal-log-macros">
                        <span>${Math.round(meal.calories)} cal</span>
                        <span>P: ${Math.round(meal.protein_g)}g</span>
                        <span>C: ${Math.round(meal.carbs_g)}g</span>
                        <span>F: ${Math.round(meal.fat_g)}g</span>
                    </div>
                </div>
                <button class="meal-log-delete" onclick="event.stopPropagation(); deleteMealLog('${meal.id}')" title="Delete meal">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Open meal detail popup
function openMealDetailPopup(index) {
    const meal = currentMealsList[index];
    if (!meal) return;

    // Track which meal is being viewed for edit functionality
    currentEditingMealIndex = index;

    const popup = document.getElementById('mealDetailPopup');
    const photoSection = document.getElementById('mealDetailPhotoSection');
    const timeEl = document.getElementById('mealDetailTime');
    const foodsEl = document.getElementById('mealDetailFoods');
    const caloriesEl = document.getElementById('mealDetailCalories');
    const proteinEl = document.getElementById('mealDetailProtein');
    const carbsEl = document.getElementById('mealDetailCarbs');
    const fatEl = document.getElementById('mealDetailFat');
    const itemsEl = document.getElementById('mealDetailItems');

    // Format time
    const time = new Date(`2000-01-01T${meal.meal_time}`).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    // Get food items text
    const foodItemsText = Array.isArray(meal.food_items)
        ? meal.food_items.map(item => item.name).join(', ')
        : 'Food';

    // Handle photo display - exclude 'text-input' placeholder
    const hasPhoto = meal.photo_url && meal.photo_url.trim() !== '' && meal.photo_url !== 'text-input';
    console.log('Popup photo URL:', meal.photo_url);
    if (hasPhoto) {
        photoSection.innerHTML = `
            <div class="meal-detail-photo" style="position: relative; overflow: hidden;">
                <img src="${meal.photo_url}" alt="Meal photo"
                     style="width: 100%; height: 100%; object-fit: cover;"
                     referrerpolicy="no-referrer"
                     onerror="try{console.log('Popup image failed to load:', this.src);this.style.display='none';var p=this.nextElementSibling;if(p)p.style.display='flex';}catch(e){}"
                     onload="console.log('Image loaded successfully');">
                <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:1rem; color:#999; position:absolute; top:0; left:0; background:#f5f5f5;">Photo unavailable</div>
                <button class="meal-detail-close" onclick="closeMealDetailPopup()">&times;</button>
            </div>
        `;
    } else {
        photoSection.innerHTML = `
            <div class="meal-detail-photo-placeholder">
                <button class="meal-detail-close" onclick="closeMealDetailPopup()" style="position: absolute; top: 12px; right: 12px;">&times;</button>
                🍽️
            </div>
        `;
    }

    // Populate data
    timeEl.textContent = time;
    foodsEl.textContent = foodItemsText;
    caloriesEl.textContent = Math.round(meal.calories || 0);
    proteinEl.textContent = `${Math.round(meal.protein_g || 0)}g`;
    carbsEl.textContent = `${Math.round(meal.carbs_g || 0)}g`;
    fatEl.textContent = `${Math.round(meal.fat_g || 0)}g`;

    // Populate food items breakdown
    if (Array.isArray(meal.food_items) && meal.food_items.length > 0) {
        let itemsHtml = '<div class="meal-detail-items-title">Food Items</div>';
        meal.food_items.forEach(item => {
            const itemCals = item.calories ? Math.round(item.calories) : 0;
            const verifiedHtml = item.verified 
                ? `<span class="verified-badge-pill" title="Verified by ${item.db_source || 'Database'}"><svg viewBox="0 0 20 20"><path d="M7.629 14.571L3.125 10.067a.642.642 0 010-.909l.909-.909a.642.642 0 01.909 0l2.677 2.677 6.152-6.152a.642.642 0 01.909 0l.909.909a.642.642 0 010 .909l-7.962 7.962a.642.642 0 01-.909 0z"/></svg>Verified</span>`
                : '';
            
            itemsHtml += `
                <div class="meal-detail-item">
                    <div style="display: flex; flex-direction: column; flex: 1;">
                        <span class="meal-detail-item-name">${item.name}</span>
                        ${verifiedHtml}
                    </div>
                    <span class="meal-detail-item-cals">${itemCals} cal</span>
                </div>
            `;
        });
        itemsEl.innerHTML = itemsHtml;
        itemsEl.style.display = 'block';
    } else {
        itemsEl.style.display = 'none';
    }

    // Show popup
    popup.classList.add('visible');
    document.body.style.overflow = 'hidden';
}

// Close meal detail popup
function closeMealDetailPopup() {
    const popup = document.getElementById('mealDetailPopup');
    popup.classList.remove('visible');
    document.body.style.overflow = '';
    currentEditingMealIndex = null;
}

// Close popup on escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const popup = document.getElementById('mealDetailPopup');
        if (popup && popup.classList.contains('visible')) {
            closeMealDetailPopup();
        }
        const editModal = document.getElementById('editItemsModal');
        if (editModal && editModal.classList.contains('visible')) {
            closeEditItemsModal();
        }
    }
});

// Food Items Modal State
let currentEditingMealIndex = null;
let editingFoodItems = [];
let foodItemsModalMode = 'edit'; // 'edit' or 'add'
let addedFoodItemsForPhoto = []; // Items added before photo analysis

// Open edit items modal (from meal detail popup)
function openEditItemsModal() {
    if (currentEditingMealIndex === null) {
        console.error('No meal selected for editing');
        return;
    }

    const meal = currentMealsList[currentEditingMealIndex];
    if (!meal || !Array.isArray(meal.food_items)) {
        console.error('No food items to edit');
        return;
    }

    // Set mode to edit
    foodItemsModalMode = 'edit';

    // Clone the food items for editing
    editingFoodItems = meal.food_items.map(item => ({ ...item }));

    // Update modal title and button text
    document.getElementById('foodItemsModalTitle').textContent = 'Edit Food';
    document.getElementById('foodItemsSubmitText').textContent = '🔄 Recalculate';

    // Render the editable list
    renderEditItemsList();

    // Show the modal
    const modal = document.getElementById('editItemsModal');
    modal.classList.add('visible');
}

// Open add items modal (from meal photo preview)
function openAddItemsModal() {
    // Set mode to add
    foodItemsModalMode = 'add';

    // Load any previously added items
    editingFoodItems = [...addedFoodItemsForPhoto];

    // Update modal title and button text
    document.getElementById('foodItemsModalTitle').textContent = 'Add Food';
    document.getElementById('foodItemsSubmitText').textContent = '✓ Done';

    // Render the editable list
    renderEditItemsList();

    // Show the modal
    const modal = document.getElementById('editItemsModal');
    modal.classList.add('visible');
}

// Close food items modal (unified function)
function closeFoodItemsModal() {
    const modal = document.getElementById('editItemsModal');
    modal.classList.remove('visible');
    editingFoodItems = [];
    document.getElementById('newItemInput').value = '';
    const portionInput = document.getElementById('newItemPortionInput');
    if (portionInput) portionInput.value = '';
}

// Legacy alias for backwards compatibility
function closeEditItemsModal() {
    closeFoodItemsModal();
}

// Render editable items list
function renderEditItemsList() {
    const listEl = document.getElementById('editItemsList');

    if (editingFoodItems.length === 0) {
        listEl.innerHTML = '<div class="edit-items-empty">No items. Add some items below.</div>';
        return;
    }

    let html = '';
    editingFoodItems.forEach((item, index) => {
        const portion = item.portion || '';
        html += `
            <div class="edit-item-row" data-index="${index}">
                <div class="edit-item-inputs">
                    <input type="text" class="edit-item-input edit-item-name" value="${escapeHtml(item.name)}"
                           oninput="updateItemName(${index}, this.value)"
                           placeholder="Food item">
                    <input type="text" class="edit-item-input edit-item-portion" value="${escapeHtml(portion)}"
                           oninput="updateItemPortion(${index}, this.value)"
                           placeholder="Amount (e.g., 200g)">
                </div>
                <button class="edit-item-delete" onclick="deleteEditItem(${index})" title="Remove item">🗑️</button>
            </div>
        `;
    });

    listEl.innerHTML = html;
}

// Escape HTML for safe display
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update item name
function updateItemName(index, newName) {
    if (editingFoodItems[index]) {
        editingFoodItems[index].name = newName.trim();
    }
}

// Update item portion
function updateItemPortion(index, newPortion) {
    if (editingFoodItems[index]) {
        editingFoodItems[index].portion = newPortion.trim();
    }
}

// Delete item from edit list
function deleteEditItem(index) {
    editingFoodItems.splice(index, 1);
    renderEditItemsList();
}

// Add new item to edit list
function addNewItem() {
    const nameInput = document.getElementById('newItemInput');
    const portionInput = document.getElementById('newItemPortionInput');
    const newItemName = nameInput.value.trim();
    const newItemPortion = portionInput ? portionInput.value.trim() : '';

    if (!newItemName) return;

    // Add the item with portion
    editingFoodItems.push({
        name: newItemName,
        portion: newItemPortion || '',
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0
    });

    nameInput.value = '';
    if (portionInput) portionInput.value = '';
    renderEditItemsList();
}

// Handle submit button based on mode
function handleFoodItemsSubmit() {
    if (foodItemsModalMode === 'add') {
        // Save items for photo analysis and close modal
        addedFoodItemsForPhoto = editingFoodItems.filter(item => item.name.trim().length > 0);
        updateAddItemsButton();
        closeFoodItemsModal();
    } else {
        // Edit mode - recalculate with Gemini
        recalculateWithGemini();
    }
}

// Update the add items button text to show count
function updateAddItemsButton() {
    const btnText = document.getElementById('add-items-btn-text');
    if (btnText) {
        if (addedFoodItemsForPhoto.length > 0) {
            btnText.textContent = `${addedFoodItemsForPhoto.length} item${addedFoodItemsForPhoto.length > 1 ? 's' : ''} added ✓`;
        } else {
            btnText.textContent = 'Add Food Items (optional)';
        }
    }
}

// Recalculate nutrition with Gemini
async function recalculateWithGemini() {
    if (editingFoodItems.length === 0) {
        showToast('Please add at least one food item', 'error');
        return;
    }

    // Get all current items with portions (filter out empty names)
    const itemDescriptions = editingFoodItems
        .filter(item => item.name.trim().length > 0)
        .map(item => {
            const name = item.name.trim();
            const portion = item.portion ? item.portion.trim() : '';
            // Include portion if specified (e.g., "200g oats" or "oats 200g")
            return portion ? `${portion} ${name}` : name;
        });

    if (itemDescriptions.length === 0) {
        showToast('Please enter at least one food item name', 'error');
        return;
    }

    // Create description for Gemini with portions
    const description = itemDescriptions.join(', ');

    // Show loading state
    const btn = document.getElementById('recalculateBtn');
    const textSpan = btn.querySelector('.recalc-text');
    const loadingSpan = btn.querySelector('.recalc-loading');
    btn.disabled = true;
    textSpan.style.display = 'none';
    loadingSpan.style.display = 'inline';

    try {
        // Call Gemini text analysis endpoint with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch('/.netlify/functions/analyze-meal-text', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: description,
                mealType: null
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorMsg = 'Failed to analyze meal';
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                // Response wasn't JSON
            }
            throw new Error(errorMsg);
        }

        const result = await response.json();

        if (!result.success || !result.data) {
            throw new Error('Invalid response from analysis');
        }

        const nutritionData = result.data;

        // Update the meal in the database
        await updateMealWithNewNutrition(nutritionData);

        // Show success
        showToast('Meal updated successfully!', 'success');

        // Close modal and refresh
        closeEditItemsModal();
        closeMealDetailPopup();
        await loadTodayNutrition();

    } catch (error) {
        console.error('Error recalculating nutrition:', error);
        const msg = error.name === 'AbortError'
            ? 'Request timed out. Please try again.'
            : (error.message || 'Failed to recalculate. Please try again.');
        showToast(msg, 'error');
    } finally {
        // Reset button state
        btn.disabled = false;
        textSpan.style.display = 'inline';
        loadingSpan.style.display = 'none';
    }
}

// Update meal in database with new nutrition data
async function updateMealWithNewNutrition(nutritionData) {
    if (currentEditingMealIndex === null) {
        throw new Error('No meal selected for update');
    }

    const meal = currentMealsList[currentEditingMealIndex];
    if (!meal || !meal.id) {
        throw new Error('Invalid meal data');
    }

    if (!window.currentUser?.id) {
        throw new Error('User not authenticated');
    }

    // Prepare updated meal data
    const updateData = {
        food_items: nutritionData.foodItems,
        calories: nutritionData.totals.calories,
        protein_g: nutritionData.totals.protein_g,
        carbs_g: nutritionData.totals.carbs_g,
        fat_g: nutritionData.totals.fat_g,
        fiber_g: nutritionData.totals.fiber_g || 0,
        micronutrients: nutritionData.micronutrients || {},
        ai_confidence: nutritionData.confidence || 'medium',
        analysis_timestamp: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const { error } = await window.supabaseClient
        .from('meal_logs')
        .update(updateData)
        .eq('id', meal.id)
        .eq('user_id', window.currentUser.id);

    if (error) {
        console.error('Database update error:', error);
        throw new Error('Failed to save changes');
    }

    // Trigger recalculation of daily nutrition
    await recalculateDailyNutrition();
    await loadMicronutrientInsights();
}

// Delete meal log
async function deleteMealLog(mealId) {
    if (!confirm('Are you sure you want to delete this meal?')) {
        return;
    }

    try {
        const { error } = await window.supabaseClient
            .from('meal_logs')
            .delete()
            .eq('id', mealId);

        if (error) {
            console.error('Error deleting meal:', error);
            alert('Failed to delete meal. Please try again.');
            return;
        }

        // Recalculate daily nutrition totals
        await recalculateDailyNutrition();

        // Reload data
        await loadTodayNutrition();
        await loadMicronutrientInsights();
    } catch (error) {
        console.error('Error deleting meal:', error);
        alert('Failed to delete meal. Please try again.');
    }
}

// Show loading state
function showMealAnalysisLoading(message = 'Analyzing meal...') {
    // Could add a modal or toast here
    console.log(message);
    if (typeof showToast === 'function') {
        showToast(message, 'info');
    }
}

// Hide loading state (toast auto-hides, but this allows explicit dismissal)
function hideMealAnalysisLoading() {
    // Toast notifications auto-hide, so this is a no-op
    // Kept for compatibility with code that calls it
}

// Show success message
function showMealAnalysisSuccess(data) {
    const message = `Meal logged! ${Math.round(data.totals.calories)} calories added.`;

    // Simple alert for now - could be replaced with a toast notification
    if (typeof showToast === 'function') {
        showToast(message, 'success');
    } else {
        console.log(message);
    }
}

// Show error message
function showMealAnalysisError(message) {
    const errorMsg = `Failed to analyze meal: ${message}`;

    // Simple alert for now - could be replaced with a toast notification
    if (typeof showToast === 'function') {
        showToast(errorMsg, 'error');
    } else {
        alert(errorMsg);
    }
}

// ==========================================
// UNIFIED CAMERA (Photo + Barcode Scanner)
// ==========================================

let unifiedCameraStream = null;
let unifiedFacingMode = 'environment';
let barcodeScanInterval = null;
let lastBarcodeDetected = null;
let barcodeProductData = null;

let barcodeServings = 1;
let barcodeAmountMode = 'servings'; // 'servings' or 'custom'
let barcodeCustomAmount = '';

async function openUnifiedCamera() {
    const modal = document.getElementById('unified-camera-modal');
    if (!modal) return;

    // Enter immersive mode to hide status bar (Spotify controls, etc.)
    if (window.NativePermissions && window.NativePermissions.enterImmersiveMode) {
        try { window.NativePermissions.enterImmersiveMode(); } catch(e) {}
    }

    // Hide Spotify mini player so it doesn't overlap camera controls
    const spotifyMini = document.getElementById('spotify-now-playing');
    if (spotifyMini) spotifyMini.style.display = 'none';

    // Reset state
    lastBarcodeDetected = null;
    document.getElementById('barcode-detected-banner').style.display = 'none';
    document.getElementById('unified-camera-description').value = '';
    document.getElementById('manual-barcode-row').style.display = 'none';
    document.getElementById('barcode-scan-status').textContent = 'Scanning for barcodes...';

    modal.style.display = 'flex';
    // Don't await — let the modal show instantly while camera initializes
    startUnifiedCamera();
}

function closeUnifiedCamera() {
    stopUnifiedCamera();
    const modal = document.getElementById('unified-camera-modal');
    if (modal) modal.style.display = 'none';
    const video = document.getElementById('unified-camera-video');
    if (video) video.style.opacity = '0';

    // Restore Spotify mini player if music is playing and no other meal flow is active
    if (window._snpPlaying && !isMealFlowActive()) {
        const spotifyMini = document.getElementById('spotify-now-playing');
        if (spotifyMini) spotifyMini.style.display = 'block';
    }

    // Exit immersive mode to restore status bar
    if (window.NativePermissions && window.NativePermissions.exitImmersiveMode) {
        try { window.NativePermissions.exitImmersiveMode(); } catch(e) {}
    }
}

async function startUnifiedCamera() {
    stopUnifiedCamera();

    // If running inside the native Android APK, request camera permission
    // via the native bridge BEFORE calling getUserMedia(). The bridge shows
    // the standard Android "Allow Balance to use your camera?" dialog.
    if (window.NativePermissions) {
        try {
            // Check if permission is permanently denied (user tapped "Don't ask again")
            if (window.NativePermissions.isPermissionPermanentlyDenied &&
                window.NativePermissions.isPermissionPermanentlyDenied()) {
                showCameraPermissionSettingsDialog();
                return;
            }

            if (!window.NativePermissions.hasCameraPermission()) {
                const granted = await new Promise((resolve) => {
                    window._onNativeCameraPermission = function(result) {
                        delete window._onNativeCameraPermission;
                        resolve(result);
                    };
                    window.NativePermissions.requestCameraPermission();
                    // Safety timeout so we don't hang forever
                    setTimeout(() => {
                        if (window._onNativeCameraPermission) {
                            delete window._onNativeCameraPermission;
                            resolve(false);
                        }
                    }, 60000);
                });
                if (!granted) {
                    showCameraPermissionSettingsDialog();
                    return;
                }
            }
        } catch (bridgeErr) {
            console.warn('NativePermissions bridge error:', bridgeErr);
            // Fall through to getUserMedia — the onPermissionRequest handler
            // on the Java side will show the native dialog as a fallback
        }
    }

    try {
        unifiedCameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: unifiedFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        const video = document.getElementById('unified-camera-video');
        video.srcObject = unifiedCameraStream;
        video.style.opacity = '0';
        await video.play();
        video.style.opacity = '1';

        // Delay barcode scanning slightly so camera feed stabilizes first
        setTimeout(() => {
            if (unifiedCameraStream) startBarcodeScanLoop(video);
        }, 500);
    } catch (err) {
        console.error('Failed to access camera:', err);
        if (err.name === 'NotAllowedError') {
            // Permission was denied — show a dialog with option to open Settings
            showCameraPermissionSettingsDialog();
        } else {
            showToast('Could not access camera. Check permissions.', 'error');
            closeUnifiedCamera();
        }
    }
}

/**
 * Shows a modal dialog explaining that camera permission is needed,
 * with a button to open the device Settings app (native) or instructions
 * for enabling it manually.
 */
function showCameraPermissionSettingsDialog() {
    closeUnifiedCamera();

    // Check if the native bridge can open settings directly
    const canOpenSettings = window.NativePermissions &&
        typeof window.NativePermissions.openAppSettings === 'function';

    const overlay = document.createElement('div');
    overlay.id = 'camera-permission-dialog-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10020;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <div style="background:#1e1e2e;border-radius:16px;padding:28px 24px;max-width:360px;width:100%;text-align:center;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
            <div style="width:56px;height:56px;border-radius:50%;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                    <line x1="1" y1="1" x2="23" y2="23" stroke="#ef4444" stroke-width="2"/>
                </svg>
            </div>
            <h3 style="margin:0 0 8px;font-size:1.15rem;font-weight:700;">Camera Access Needed</h3>
            <p style="margin:0 0 20px;font-size:0.9rem;color:rgba(255,255,255,0.7);line-height:1.5;">
                Balance needs camera access to scan barcodes and identify food.
                ${canOpenSettings
                    ? 'Tap the button below to open Settings, then enable <b>Camera</b> under Permissions.'
                    : 'Please go to your device <b>Settings &gt; Apps &gt; Balance &gt; Permissions</b> and enable Camera.'}
            </p>
            <div style="display:flex;gap:10px;justify-content:center;">
                ${canOpenSettings ? `
                <button onclick="window.NativePermissions.openAppSettings(); document.getElementById('camera-permission-dialog-overlay').remove();"
                    style="flex:1;padding:12px 20px;border:none;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;font-weight:600;font-size:0.95rem;cursor:pointer;">
                    Open Settings
                </button>` : ''}
                <button onclick="document.getElementById('camera-permission-dialog-overlay').remove();"
                    style="flex:1;padding:12px 20px;border:1px solid rgba(255,255,255,0.2);border-radius:12px;background:transparent;color:rgba(255,255,255,0.8);font-weight:500;font-size:0.95rem;cursor:pointer;">
                    ${canOpenSettings ? 'Cancel' : 'OK'}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    // Close when clicking the backdrop
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.remove();
    });
}

function stopUnifiedCamera() {
    stopBarcodeScanLoop();
    if (unifiedCameraStream) {
        unifiedCameraStream.getTracks().forEach(t => t.stop());
        unifiedCameraStream = null;
    }
    const video = document.getElementById('unified-camera-video');
    if (video) video.srcObject = null;
}

async function flipUnifiedCamera() {
    unifiedFacingMode = unifiedFacingMode === 'environment' ? 'user' : 'environment';
    await startUnifiedCamera();
}

// --- Barcode scanning on video frames ---
function startBarcodeScanLoop(videoEl) {
    stopBarcodeScanLoop();

    // Use BarcodeDetector API if available (Chrome, Edge, Android WebView)
    if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] });
        barcodeScanInterval = setInterval(async () => {
            if (videoEl.readyState < 2) return;
            try {
                const barcodes = await detector.detect(videoEl);
                if (barcodes.length > 0) {
                    const code = barcodes[0].rawValue;
                    if (code && code !== lastBarcodeDetected) {
                        lastBarcodeDetected = code;
                        onBarcodeDetected(code);
                    }
                }
            } catch (e) {}
        }, 400);
        return;
    }

    // Fallback: use html5-qrcode scanning on downscaled canvas snapshots
    if (typeof Html5Qrcode !== 'undefined') {
        const scanCanvas = document.createElement('canvas');
        const scanCtx = scanCanvas.getContext('2d');
        const qr = new Html5Qrcode('barcode-reader', /* verbose= */ false);
        let scanBusy = false; // prevent overlapping scans

        barcodeScanInterval = setInterval(async () => {
            if (videoEl.readyState < 2 || scanBusy) return;
            scanBusy = true;
            try {
                // Downscale to 640px wide for faster processing
                const scale = Math.min(1, 640 / videoEl.videoWidth);
                scanCanvas.width = Math.round(videoEl.videoWidth * scale);
                scanCanvas.height = Math.round(videoEl.videoHeight * scale);
                scanCtx.drawImage(videoEl, 0, 0, scanCanvas.width, scanCanvas.height);
                scanCanvas.toBlob(async (blob) => {
                    if (!blob) { scanBusy = false; return; }
                    try {
                        const imageFile = new File([blob], 'frame.jpg', { type: 'image/jpeg' });
                        const result = await qr.scanFileV2(imageFile, /* showImage= */ false);
                        if (result && result.decodedText && result.decodedText !== lastBarcodeDetected) {
                            lastBarcodeDetected = result.decodedText;
                            onBarcodeDetected(result.decodedText);
                        }
                    } catch (e) {
                        // No barcode found in this frame — expected
                    }
                    scanBusy = false;
                }, 'image/jpeg', 0.6);
            } catch (e) { scanBusy = false; }
        }, 800);
        return;
    }

    // No barcode scanning available
    document.getElementById('barcode-scan-status').textContent = 'Barcode scanning unavailable — use manual entry';
}

function stopBarcodeScanLoop() {
    if (barcodeScanInterval) {
        clearInterval(barcodeScanInterval);
        barcodeScanInterval = null;
    }
}

async function onBarcodeDetected(code) {
    document.getElementById('barcode-scan-status').textContent = 'Barcode found! Looking up...';

    try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();

        if (data.status !== 1 || !data.product) {
            document.getElementById('barcode-scan-status').textContent = `Barcode ${code} not found in database. Keep scanning or snap a photo.`;
            // Allow re-detection of same barcode after a delay
            setTimeout(() => { lastBarcodeDetected = null; }, 5000);
            return;
        }

        const product = data.product;
        const nutrients = product.nutriments || {};

        // Always store per-100g values for custom gram entry
        const per100g = {
            calories: parseFloat(nutrients['energy-kcal_100g']) || 0,
            protein_g: parseFloat(nutrients.proteins_100g) || 0,
            carbs_g: parseFloat(nutrients.carbohydrates_100g) || 0,
            fat_g: parseFloat(nutrients.fat_100g) || 0,
            fiber_g: parseFloat(nutrients.fiber_100g) || 0,
            sugars_g: parseFloat(nutrients.sugars_100g) || 0,
            saturated_fat_g: parseFloat(nutrients['saturated-fat_100g']) || 0,
            sodium_mg: (parseFloat(nutrients.sodium_100g) || 0) * 1000
        };

        const hasServingData = !!(nutrients['energy-kcal_serving']);
        const perServing = hasServingData ? {
            calories: parseFloat(nutrients['energy-kcal_serving']) || 0,
            protein_g: parseFloat(nutrients.proteins_serving) || 0,
            carbs_g: parseFloat(nutrients.carbohydrates_serving) || 0,
            fat_g: parseFloat(nutrients.fat_serving) || 0,
            fiber_g: parseFloat(nutrients.fiber_serving) || 0,
            sugars_g: parseFloat(nutrients.sugars_serving) || 0,
            saturated_fat_g: parseFloat(nutrients['saturated-fat_serving']) || 0,
            sodium_mg: (parseFloat(nutrients.sodium_serving) || 0) * 1000
        } : { ...per100g }; // fall back to per-100g

        // Parse serving weight in grams (e.g. "30g", "250 ml")
        const servingSizeStr = product.serving_size || '';
        const servingWeightMatch = servingSizeStr.match(/([\d.]+)\s*(g|ml)/i);
        const servingWeightG = servingWeightMatch ? parseFloat(servingWeightMatch[1]) : null;

        const micro100g = {
            vitamin_c_mg: parseFloat(nutrients['vitamin-c_100g']) || 0,
            iron_mg: parseFloat(nutrients['iron_100g']) || 0,
            calcium_mg: parseFloat(nutrients['calcium_100g']) || 0,
            potassium_mg: parseFloat(nutrients['potassium_100g']) || 0,
            vitamin_a_mcg: parseFloat(nutrients['vitamin-a_100g']) || 0,
            vitamin_d_mcg: parseFloat(nutrients['vitamin-d_100g']) || 0
        };

        barcodeProductData = {
            name: product.product_name || product.product_name_en || 'Unknown Product',
            brand: product.brands || '',
            quantity: product.quantity || '',
            image: product.image_front_small_url || product.image_url || '',
            servingSize: servingSizeStr,
            servingWeightG: servingWeightG,
            perServing: perServing,
            per100g: per100g,
            micro100g: micro100g,
            micronutrients: {
                vitamin_c_mg: parseFloat(nutrients['vitamin-c_serving']) || micro100g.vitamin_c_mg,
                iron_mg: parseFloat(nutrients['iron_serving']) || micro100g.iron_mg,
                calcium_mg: parseFloat(nutrients['calcium_serving']) || micro100g.calcium_mg,
                potassium_mg: parseFloat(nutrients['potassium_serving']) || micro100g.potassium_mg,
                vitamin_a_mcg: parseFloat(nutrients['vitamin-a_serving']) || micro100g.vitamin_a_mcg,
                vitamin_d_mcg: parseFloat(nutrients['vitamin-d_serving']) || micro100g.vitamin_d_mcg
            },
            isPerServing: hasServingData,
            barcode: code
        };

        barcodeServings = 1;
        barcodeAmountMode = 'servings'; // reset to servings mode
        barcodeCustomAmount = '';

        // Show the detected banner on the camera view
        const banner = document.getElementById('barcode-detected-banner');
        document.getElementById('barcode-detected-name').textContent = barcodeProductData.name;
        document.getElementById('barcode-detected-detail').textContent =
            (barcodeProductData.brand ? barcodeProductData.brand + ' — ' : '') +
            Math.round(barcodeProductData.perServing.calories) + ' kcal per serving';
        banner.style.display = 'block';
        document.getElementById('barcode-scan-status').textContent = 'Product found! Tap banner to log, or snap a photo instead.';

    } catch (error) {
        console.error('Barcode lookup error:', error);
        document.getElementById('barcode-scan-status').textContent = 'Lookup failed. Keep scanning or snap a photo.';
        setTimeout(() => { lastBarcodeDetected = null; }, 3000);
    }
}

// --- Photo capture from live video ---
function captureUnifiedPhoto() {
    const video = document.getElementById('unified-camera-video');
    const canvas = document.getElementById('unified-camera-canvas');
    if (!video || !canvas || video.readyState < 2) {
        showToast('Camera not ready. Please wait a moment.', 'warning');
        return;
    }

    // Animate the capture button
    const btn = document.getElementById('unified-capture-btn');
    if (btn) { btn.style.transform = 'scale(0.9)'; setTimeout(() => { btn.style.transform = ''; }, 150); }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
        if (!blob) {
            showToast('Failed to capture photo.', 'error');
            return;
        }

        const file = new File([blob], `meal-${Date.now()}.jpg`, { type: 'image/jpeg' });
        capturedMealFile = file;

        // Get description from the unified camera input
        const desc = document.getElementById('unified-camera-description');
        const description = desc ? desc.value.trim() : '';

        // Close camera and show the existing meal preview flow
        closeUnifiedCamera();

        const reader = new FileReader();
        reader.onload = function(e) {
            showMealPhotoPreview(e.target.result);
            // Pre-fill the description field in the preview modal
            if (description) {
                const previewDesc = document.getElementById('meal-photo-description');
                if (previewDesc) previewDesc.value = description;
            }
        };
        reader.readAsDataURL(file);
    }, 'image/jpeg', 0.85);
}

// --- Manual barcode entry toggle ---
function showManualBarcodeEntry() {
    const row = document.getElementById('manual-barcode-row');
    if (row) {
        const isVisible = row.style.display === 'flex';
        row.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) document.getElementById('barcode-manual-input').focus();
    }
}

function lookupManualBarcode() {
    const input = document.getElementById('barcode-manual-input');
    const code = input ? input.value.trim() : '';
    if (!code) {
        showToast('Please enter a barcode number.', 'warning');
        return;
    }
    showToast('Looking up product...', 'info');
    onBarcodeDetected(code);
}

// --- Barcode lookup (called from result modal "View & Log") ---
async function lookupBarcode(barcode) {
    // This function is kept for any external callers; main flow uses onBarcodeDetected
    await onBarcodeDetected(barcode);
}

function showBarcodeResult() {
    if (!barcodeProductData) return;

    // Close the unified camera — user is moving to the result modal
    closeUnifiedCamera();

    const modal = document.getElementById('barcode-result-modal');
    if (!modal) return;

    // Product info
    document.getElementById('barcode-product-name').textContent = barcodeProductData.name;
    document.getElementById('barcode-product-brand').textContent = barcodeProductData.brand;
    document.getElementById('barcode-product-quantity').textContent = barcodeProductData.quantity;

    const img = document.getElementById('barcode-product-image');
    if (barcodeProductData.image) {
        img.src = barcodeProductData.image;
        img.style.display = 'block';
    } else {
        img.style.display = 'none';
    }

    // Serving label
    const servingLabel = document.getElementById('barcode-serving-size-label');
    if (barcodeProductData.isPerServing && barcodeProductData.servingSize) {
        servingLabel.textContent = `(${barcodeProductData.servingSize} each)`;
    } else {
        servingLabel.textContent = '(per 100g)';
    }

    // Determine unit hint for custom mode (g or ml)
    const unitEl = document.getElementById('barcode-custom-unit');
    const isLiquid = /ml|litr/i.test(barcodeProductData.quantity || '') || /ml|litr/i.test(barcodeProductData.servingSize || '');
    if (unitEl) unitEl.textContent = isLiquid ? 'ml' : 'g';

    // Show hint with serving weight if known
    const hintEl = document.getElementById('barcode-custom-hint');
    if (hintEl && barcodeProductData.servingWeightG) {
        hintEl.textContent = `1 serving = ${barcodeProductData.servingWeightG}${isLiquid ? 'ml' : 'g'}`;
    } else if (hintEl) {
        hintEl.textContent = '';
    }

    // Reset to servings mode
    barcodeAmountMode = 'servings';
    barcodeServings = 1;
    barcodeCustomAmount = '';
    setBarcodeAmountMode('servings');

    updateBarcodeNutritionDisplay();
    modal.style.display = 'flex';
}

function setBarcodeAmountMode(mode) {
    barcodeAmountMode = mode;
    const servingsBtn = document.getElementById('barcode-mode-servings');
    const customBtn = document.getElementById('barcode-mode-custom');
    const servingsRow = document.getElementById('barcode-servings-row');
    const customRow = document.getElementById('barcode-custom-row');

    if (mode === 'servings') {
        servingsBtn.style.background = 'var(--primary)';
        servingsBtn.style.color = '#fff';
        customBtn.style.background = 'transparent';
        customBtn.style.color = 'var(--text-muted, #888)';
        servingsRow.style.display = 'flex';
        customRow.style.display = 'none';
    } else {
        customBtn.style.background = 'var(--primary)';
        customBtn.style.color = '#fff';
        servingsBtn.style.background = 'transparent';
        servingsBtn.style.color = 'var(--text-muted, #888)';
        servingsRow.style.display = 'none';
        customRow.style.display = 'flex';
        // Pre-fill with serving weight if available
        const input = document.getElementById('barcode-custom-amount');
        if (input && !input.value && barcodeProductData && barcodeProductData.servingWeightG) {
            input.value = barcodeProductData.servingWeightG;
            barcodeCustomAmount = String(barcodeProductData.servingWeightG);
        }
        if (input) input.focus();
    }
    updateBarcodeNutritionDisplay();
}

function adjustBarcodeServings(delta) {
    barcodeServings = Math.max(0.5, barcodeServings + delta);
    document.getElementById('barcode-servings-display').textContent = barcodeServings % 1 === 0 ? barcodeServings : barcodeServings.toFixed(1);
    updateBarcodeNutritionDisplay();
}

function onBarcodeCustomAmountChange() {
    const input = document.getElementById('barcode-custom-amount');
    barcodeCustomAmount = input ? input.value : '';
    updateBarcodeNutritionDisplay();
}

// Returns { multiplier, per } based on current mode
function getBarcodeMultiplier() {
    if (!barcodeProductData) return { multiplier: 0, per: barcodeProductData?.perServing || {} };
    if (barcodeAmountMode === 'custom') {
        const grams = parseFloat(barcodeCustomAmount) || 0;
        // per100g values × (grams / 100)
        return { multiplier: grams / 100, per: barcodeProductData.per100g };
    }
    return { multiplier: barcodeServings, per: barcodeProductData.perServing };
}

function updateBarcodeNutritionDisplay() {
    if (!barcodeProductData) return;
    const { multiplier, per } = getBarcodeMultiplier();

    document.getElementById('barcode-calories').textContent = Math.round(per.calories * multiplier);
    document.getElementById('barcode-protein').textContent = Math.round(per.protein_g * multiplier) + 'g';
    document.getElementById('barcode-carbs').textContent = Math.round(per.carbs_g * multiplier) + 'g';
    document.getElementById('barcode-fat').textContent = Math.round(per.fat_g * multiplier) + 'g';

    // Extra nutrients
    const extras = document.getElementById('barcode-extra-nutrients');
    const extraItems = [
        { label: 'Fiber', value: per.fiber_g * multiplier, unit: 'g' },
        { label: 'Sugar', value: per.sugars_g * multiplier, unit: 'g' },
        { label: 'Sodium', value: per.sodium_mg * multiplier, unit: 'mg' }
    ].filter(item => item.value > 0);

    extras.innerHTML = extraItems.map(item =>
        `<div style="background:rgba(255,255,255,0.05); border-radius:10px; padding:10px; text-align:center;">
            <div style="font-size:1rem; font-weight:600; color:var(--text-main, #fff);">${Math.round(item.value)}${item.unit}</div>
            <div style="font-size:0.7rem; color:var(--text-muted, #888); margin-top:2px;">${item.label}</div>
        </div>`
    ).join('');
}

function closeBarcodeResult() {
    const modal = document.getElementById('barcode-result-modal');
    if (modal) modal.style.display = 'none';
    barcodeProductData = null;
    barcodeServings = 1;
    barcodeAmountMode = 'servings';
    barcodeCustomAmount = '';
}

async function logBarcodeAsMeal() {
    if (!barcodeProductData) return;

    // Capture all data before closeBarcodeResult() nulls barcodeProductData
    const { multiplier, per } = getBarcodeMultiplier();
    const barcode = barcodeProductData.barcode;
    const isLiquid = /ml|litr/i.test(barcodeProductData.quantity || '') || /ml|litr/i.test(barcodeProductData.servingSize || '');
    const unit = isLiquid ? 'ml' : 'g';
    const microSrc = barcodeAmountMode === 'custom' ? barcodeProductData.micro100g : barcodeProductData.micronutrients;
    const microScale = barcodeAmountMode === 'custom' ? multiplier : barcodeServings;

    // Build portion description based on mode
    let portion;
    if (barcodeAmountMode === 'custom') {
        const amt = parseFloat(barcodeCustomAmount) || 0;
        portion = `${amt}${unit}`;
    } else {
        const s = barcodeServings;
        if (barcodeProductData.isPerServing) {
            portion = `${s} serving${s !== 1 ? 's' : ''}${barcodeProductData.servingSize ? ' (' + barcodeProductData.servingSize + ')' : ''}`;
        } else {
            portion = `${Math.round(100 * s)}${unit}`;
        }
    }

    const foodItems = [{
        name: barcodeProductData.name + (barcodeProductData.brand ? ` (${barcodeProductData.brand})` : ''),
        portion: portion,
        calories: Math.round(per.calories * multiplier),
        protein_g: Math.round(per.protein_g * multiplier * 10) / 10,
        carbs_g: Math.round(per.carbs_g * multiplier * 10) / 10,
        fat_g: Math.round(per.fat_g * multiplier * 10) / 10,
        fiber_g: Math.round(per.fiber_g * multiplier * 10) / 10
    }];

    const totals = {
        calories: Math.round(per.calories * multiplier),
        protein_g: Math.round(per.protein_g * multiplier * 10) / 10,
        carbs_g: Math.round(per.carbs_g * multiplier * 10) / 10,
        fat_g: Math.round(per.fat_g * multiplier * 10) / 10,
        fiber_g: Math.round(per.fiber_g * multiplier * 10) / 10
    };

    const micronutrients = {
        vitamin_c_mg: Math.round((microSrc.vitamin_c_mg || 0) * microScale * 10) / 10,
        iron_mg: Math.round((microSrc.iron_mg || 0) * microScale * 10) / 10,
        calcium_mg: Math.round((microSrc.calcium_mg || 0) * microScale * 10) / 10,
        potassium_mg: Math.round((microSrc.potassium_mg || 0) * microScale * 10) / 10,
        vitamin_a_mcg: Math.round((microSrc.vitamin_a_mcg || 0) * microScale * 10) / 10,
        vitamin_d_mcg: Math.round((microSrc.vitamin_d_mcg || 0) * microScale * 10) / 10,
        b12_mcg: 0, omega3_g: 0, zinc_mg: 0, iodine_mcg: 0,
        selenium_mcg: 0, folate_mcg: 0, magnesium_mg: 0,
        vitamin_e_mg: 0, vitamin_k_mcg: 0
    };

    closeBarcodeResult();
    showToast('Logging barcode meal...', 'info');

    try {
        const mealType = typeof autoDetectMealType === 'function' ? autoDetectMealType() : selectedMealType;
        selectedMealType = mealType;

        const savedMeal = await saveMealLogWithType({
            foodItems,
            totals,
            micronutrients,
            confidence: 'high',
            mealType: mealType,
            inputMethod: 'barcode',
            notes: `Barcode scan: ${barcode}`
        });

        // Award points
        if (savedMeal && savedMeal[0]?.id) {
            try {
                await awardPointsForMeal(savedMeal[0].id, new Date().toISOString(), 'high', null);
            } catch (pointsError) {
                console.error('Error awarding points (meal still saved):', pointsError);
            }
        }

        await recalculateDailyNutrition();
        await loadTodayNutrition();
        try { await loadMicronutrientInsights(); } catch(e) {}
        try { if (typeof checkMealBadges === 'function') checkMealBadges(); } catch(e) {}

        showMealAnalysisSuccess({ totals });
    } catch (error) {
        console.error('Error logging barcode meal:', error);
        showToast('Failed to log meal. Please try again.', 'error');
    }

    barcodeProductData = null;
    barcodeServings = 1;
    barcodeAmountMode = 'servings';
    barcodeCustomAmount = '';
}

// Initialize calorie tracker when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the last date tracker
    const today = getLocalDateString();
    if (!localStorage.getItem('lastCalorieTrackerDate')) {
        localStorage.setItem('lastCalorieTrackerDate', today);
    }

    // Instantly render cached nutrition data (no network delay)
    checkAndResetNewDay();
    renderCachedNutrition();

    // Then fetch fresh data in the background after auth is ready
    setTimeout(async () => {
        // Recalculate to ensure data is in sync
        await recalculateDailyNutrition();
        // Then load fresh data and update cache
        loadTodayNutrition();
    }, 1000);
});
