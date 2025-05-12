document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const setupScreen = document.getElementById('setup-screen');
    const sessionScreen = document.getElementById('session-screen');
    const routineSelect = document.getElementById('routine-select');
    const musicSelect = document.getElementById('music-select');
    const voiceSelect = document.getElementById('voice-select');
    const startSessionBtn = document.getElementById('start-session-btn');

    const currentInstructionP = document.getElementById('current-instruction');
    const currentImageImg = document.getElementById('current-image');
    const elapsedTimeSpan = document.getElementById('elapsed-time');
    const currentExerciseSpan = document.getElementById('current-exercise');

    const playPauseBtn = document.getElementById('play-pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    const backgroundMusicAudio = document.getElementById('background-music');

    const playIconSVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'; // Play
    const pauseIconSVG = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'; // Pause

    // --- State Variables ---
    let currentRoutine = [];
    let currentStepIndex = 0;
    let isPlaying = false;
    let isPausedManually = false; // To differentiate from pause commands
    let startTime = 0;
    let timerInterval = null;
    let synth = window.speechSynthesis;
    let availableVoices = [];
    let currentTimeoutId = null; // To clear timeouts for [PAUSE] commands if session stops

    // --- Data Definitions (Routines & Music) ---
    // IMPORTANT: Paths for images and music are relative to where index.html is.
    // Create 'assets/images/' and 'assets/music/' folders in your repo.
    const routines = {
        "Rutina Corta de Mañana": [
            { type: "speak", text: "Bienvenida a tu rutina corta de mañana. Vamos a empezar con energía." },
            { type: "exercise", number: 1, text: "Calentamiento: Círculos de Hombros" },
            { type: "speak", text: "Realiza 10 círculos hacia adelante y 10 hacia atrás." },
            { type: "image", src: "assets/images/shoulder_circles.webp", alt: "Círculos de hombros" }, // Replace with your image
            { type: "pause", duration: 20, text_after_pause: "Muy bien. Siguiente." },
            { type: "exercise", number: 2, text: "El Gato-Vaca" },
            { type: "speak", text: "Alterna entre la postura del gato y la vaca durante 5 respiraciones completas." },
            { type: "image", src: "assets/images/cat_cow.webp", alt: "Gato-Vaca" }, // Replace with your image
            { type: "pause", duration: 30, text_after_pause: "Perfecto." },
            { type: "time" },
            { type: "speak", text: "Estiramiento final. Mantén cada estiramiento 15 segundos." },
            { type: "image", src: "assets/images/final_stretch.webp", alt: "Estiramiento" }, // Replace with your image
            { type: "pause", duration: 15},
            { type: "speak", text: "Has completado tu rutina. ¡Que tengas un gran día!" }
        ],
        "Relajación Nocturna": [
            { type: "speak", text: "Es hora de relajarse. Prepara tu cuerpo para un descanso profundo." },
            { type: "exercise", number: 1, text: "Respiración Diafragmática" },
            { type: "speak", text: "Inhala profundamente por la nariz, expandiendo tu abdomen. Exhala lentamente por la boca. 5 ciclos." },
            { type: "pause", duration: 45, text_after_pause: "Siente la calma." },
            { type: "exercise", number: 2, text: "Postura del Niño" },
            { type: "speak", text: "Mantén la postura del niño durante 1 minuto, respirando suavemente." },
            { type: "image", src: "assets/images/child_pose.webp", alt: "Postura del niño" }, // Replace with your image
            { type: "pause", duration: 60, text_after_pause: "Liberando tensiones." },
            { type: "time" },
            { type: "speak", text: "Sesión de relajación completada. Dulces sueños." }
        ]
    };

    const musicTracks = {
        "Música Relajante": "assets/music/relaxing_tune.mp3", // Replace with your music file
        "Sonidos de la Naturaleza": "assets/music/nature_sounds.mp3" // Replace with your music file
    };

    // --- Functions ---

    function populateVoices() {
        availableVoices = synth.getVoices();
        voiceSelect.innerHTML = ''; // Clear existing options
        // Browsers might load voices asynchronously
        if (availableVoices.length === 0 && synth.onvoiceschanged !== undefined) {
             synth.onvoiceschanged = populateVoices; // try again when voices load
             return;
        }

        let defaultVoiceURI = null;
        availableVoices.forEach(voice => {
            // Try to find a Spanish voice by default
            if (voice.lang.startsWith('es')) {
                const option = document.createElement('option');
                option.textContent = `${voice.name} (${voice.lang})`;
                option.setAttribute('data-lang', voice.lang);
                option.setAttribute('data-name', voice.name);
                voiceSelect.appendChild(option);
                if (voice.default && !defaultVoiceURI) { // Prefer default if multiple Spanish voices
                    defaultVoiceURI = voice.name;
                }
            }
        });
        // If no Spanish voices, list all, or a subset
        if (voiceSelect.options.length === 0) {
             availableVoices.forEach(voice => {
                const option = document.createElement('option');
                option.textContent = `${voice.name} (${voice.lang})`;
                option.setAttribute('data-lang', voice.lang);
                option.setAttribute('data-name', voice.name);
                voiceSelect.appendChild(option);
             });
        }

        if (defaultVoiceURI) {
            voiceSelect.value = defaultVoiceURI;
        } else if (voiceSelect.options.length > 0) {
             voiceSelect.selectedIndex = 0; // Select the first available if no default Spanish
        }
    }


    function speak(textToSpeak, onEndCallback) {
        if (synth.speaking) {
            console.error('SpeechSynthesis.speaking');
            // Optionally, queue or skip. For now, just log.
            if (onEndCallback) onEndCallback();
            return;
        }
        if (textToSpeak && textToSpeak.trim() !== "") {
            const utterThis = new SpeechSynthesisUtterance(textToSpeak);
            const selectedVoiceName = voiceSelect.selectedOptions[0]?.getAttribute('data-name');
            if (selectedVoiceName) {
                const voice = availableVoices.find(v => v.name === selectedVoiceName);
                if (voice) utterThis.voice = voice;
            }
            utterThis.onend = () => {
                if (onEndCallback) onEndCallback();
            };
            utterThis.onerror = (event) => {
                console.error('SpeechSynthesisUtterance.onerror', event);
                if (onEndCallback) onEndCallback(); // Proceed even on error
            };
            currentInstructionP.textContent = textToSpeak;
            synth.speak(utterThis);
        } else {
            if (onEndCallback) onEndCallback(); // No text to speak, just proceed
        }
    }

    function updateTimer() {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const seconds = String(elapsed % 60).padStart(2, '0');
        elapsedTimeSpan.textContent = `${minutes}:${seconds}`;
    }

    function processStep() {
        if (currentStepIndex >= currentRoutine.length) {
            speak("Rutina completada.", stopSession);
            return;
        }

        if (isPausedManually) return; // Don't process if manually paused

        const step = currentRoutine[currentStepIndex];
        currentImageImg.classList.add('hidden'); // Hide image by default for text steps

        // Clear any previous command's timeout (e.g., from a [PAUSE])
        if (currentTimeoutId) {
            clearTimeout(currentTimeoutId);
            currentTimeoutId = null;
        }

        switch (step.type) {
            case "speak":
                speak(step.text, () => {
                    currentStepIndex++;
                    processStep();
                });
                break;
            case "image":
                currentImageImg.src = step.src;
                currentImageImg.alt = step.alt || "Imagen del ejercicio";
                currentImageImg.classList.remove('hidden');
                if (step.text_before) {
                     speak(step.text_before, () => {
                        currentStepIndex++;
                        processStep();
                    });
                } else {
                    currentStepIndex++;
                    processStep(); // If no text, just proceed
                }
                break;
            case "pause":
                const pauseDurationMs = step.duration * 1000;
                currentInstructionP.textContent = `Pausa de ${step.duration} segundos...`;
                 // Speak duration, then start timeout
                speak(`${step.duration} segundos de pausa.`, () => {
                    currentTimeoutId = setTimeout(() => {
                        currentTimeoutId = null; // Clear the id
                        if (step.text_after_pause) {
                            speak(step.text_after_pause, () => {
                                currentStepIndex++;
                                processStep();
                            });
                        } else {
                            currentStepIndex++;
                            processStep();
                        }
                    }, pauseDurationMs);
                });
                break;
            case "exercise":
                currentExerciseSpan.textContent = `Ejercicio ${step.number}: ${step.text}`;
                speak(`Ejercicio ${step.number}. ${step.text}`, () => {
                    currentStepIndex++;
                    processStep();
                });
                break;
            case "time":
                const now = Date.now();
                const elapsedMinutes = Math.floor((now - startTime) / 60000);
                speak(`Han transcurrido ${elapsedMinutes} minutos.`, () => {
                    currentStepIndex++;
                    processStep();
                });
                break;
            default:
                console.warn("Tipo de paso desconocido:", step);
                currentStepIndex++;
                processStep();
        }
    }

    function startSession() {
        const selectedRoutineKey = routineSelect.value;
        const selectedMusicKey = musicSelect.value;

        if (!selectedRoutineKey) {
            alert("Por favor, selecciona una rutina.");
            return;
        }
        currentRoutine = routines[selectedRoutineKey];
        currentStepIndex = 0;
        isPlaying = true;
        isPausedManually = false;
        playPauseBtn.innerHTML = pauseIconSVG;
        startTime = Date.now();
        elapsedTimeSpan.textContent = "00:00";
        currentExerciseSpan.textContent = "";
        currentInstructionP.textContent = "Iniciando...";


        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(updateTimer, 1000);

        if (selectedMusicKey && musicTracks[selectedMusicKey]) {
            backgroundMusicAudio.src = musicTracks[selectedMusicKey];
            backgroundMusicAudio.play().catch(e => console.error("Error al reproducir música:", e));
        } else {
            backgroundMusicAudio.pause();
            backgroundMusicAudio.src = "";
        }

        setupScreen.classList.add('hidden');
        sessionScreen.classList.remove('hidden');
        processStep();
    }

    function stopSession() {
        isPlaying = false;
        isPausedManually = false; // Reset manual pause
        playPauseBtn.innerHTML = playIconSVG;
        if (timerInterval) clearInterval(timerInterval);
        if (currentTimeoutId) { // Clear any pending pause command
            clearTimeout(currentTimeoutId);
            currentTimeoutId = null;
        }
        synth.cancel(); // Stop any ongoing speech
        backgroundMusicAudio.pause();
        backgroundMusicAudio.currentTime = 0;
        currentStepIndex = 0; // Reset for next time
        currentInstructionP.textContent = "Sesión detenida. Elige una rutina para comenzar.";
        sessionScreen.classList.add('hidden');
        setupScreen.classList.remove('hidden');
    }

    function togglePlayPause() {
        if (!currentRoutine.length) return; // No routine loaded

        if (isPlaying && !isPausedManually) { // Is playing, so pause it
            isPausedManually = true;
            playPauseBtn.innerHTML = playIconSVG;
            synth.pause(); // Pause speech
            if(currentTimeoutId) { // If a [PAUSE:...] command is active
                 // This is tricky. We'd need to store remaining time for the command's pause
                 // For simplicity now, pausing will effectively interrupt timed command pauses.
                 // Or, we let the command pause finish and then this manual pause takes over.
                 // For now, this manual pause takes precedence.
                 clearTimeout(currentTimeoutId);
                 // To resume accurately, we'd need to calculate remaining duration.
            }
            backgroundMusicAudio.pause();
            if (timerInterval) clearInterval(timerInterval);
            currentInstructionP.textContent = "Sesión pausada.";
        } else { // Is paused (either manually or finished playing), so play/resume
            isPausedManually = false;
            isPlaying = true;
            playPauseBtn.innerHTML = pauseIconSVG;
            synth.resume(); // Resume speech
            backgroundMusicAudio.play().catch(e => console.error("Error al reproducir música al resumir:", e));
            if (!timerInterval && startTime > 0) { // Re-start timer only if it was running
                 timerInterval = setInterval(updateTimer, 1000);
            }
            // If it was paused during a [PAUSE:...] command, that specific logic might need adjustment
            // For simplicity, we just continue processing from the current step.
            // If synth was speaking when paused, it will resume. Otherwise, we call processStep.
            if (!synth.speaking) {
                processStep();
            }
        }
    }


    function initializeApp() {
        // Populate routine select
        for (const key in routines) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            routineSelect.appendChild(option);
        }

        // Populate music select
        for (const key in musicTracks) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            musicSelect.appendChild(option);
        }

        // Populate voices (might be async)
        populateVoices();
        if (synth.onvoiceschanged !== undefined) {
            synth.onvoiceschanged = populateVoices;
        }


        startSessionBtn.addEventListener('click', startSession);
        playPauseBtn.addEventListener('click', togglePlayPause);
        stopBtn.addEventListener('click', stopSession);
    }

    // --- Initialize ---
    if (typeof speechSynthesis === 'undefined') {
        currentInstructionP.textContent = "Lo sentimos, tu navegador no soporta la síntesis de voz.";
        // Disable buttons or provide alternatives
        startSessionBtn.disabled = true;
        playPauseBtn.disabled = true;
        stopBtn.disabled = true;
        return;
    }
    initializeApp();
});