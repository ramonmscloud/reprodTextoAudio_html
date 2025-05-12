document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements (same as before) ---
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

    const playIconSVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    const pauseIconSVG = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

    // --- State Variables (same as before) ---
    let currentRoutine = [];
    let currentStepIndex = 0;
    let isPlaying = false;
    let isPausedManually = false;
    let startTime = 0;
    let timerInterval = null;
    let synth = window.speechSynthesis;
    let availableVoices = [];
    let currentTimeoutId = null;

    // --- Data Definitions (Routines & Music) ---
    // NEW: Routines are now in raw string format
    const routinesRaw = {
        "Rutina Corta (Estilo Script)": `
Bienvenida a tu rutina corta de mañana. / [PAUSE:3]Vamos a empezar con energía.
[EJERCICIO:1] Calentamiento: Círculos de Hombros
Realiza 10 círculos hacia adelante y 10 hacia atrás.
Observa la imagen [IMAGEN:shoulder_circles.webp]
[PAUSE:20] Muy bien. Siguiente.
[EJERCICIO:2] El Gato-Vaca
Alterna entre la postura del gato y la vaca durante 5 respiraciones completas.
[IMAGEN:cat_cow.webp] / [PAUSE:30] Perfecto.
[TIEMPO]
Estiramiento final. Mantén cada estiramiento 15 segundos. / [IMAGEN:final_stretch.webp]
[PAUSE:15]
Has completado tu rutina. ¡Que tengas un gran día!
        `,
        "Relajación Nocturna (Estilo Script)": `
Es hora de relajarse. Prepara tu cuerpo para un descanso profundo.
[EJERCICIO:1] Respiración Diafragmática
Inhala profundamente por la nariz, expandiendo tu abdomen. Exhala lentamente por la boca. 5 ciclos.
[PAUSE:45] Siente la calma.
[EJERCICIO:2] Postura del Niño. / Mantén la postura del niño durante 1 minuto, respirando suavemente.
[IMAGEN:child_pose.webp]
[PAUSE:60] Liberando tensiones.
[TIEMPO]
Sesión de relajación completada. Dulces sueños.
        `
    };

    const musicTracks = { // Paths relative to index.html
        "Música Relajante": "assets/music/relaxing_tune.mp3",
        "Sonidos de la Naturaleza": "assets/music/nature_sounds.mp3"
    };

    // --- NEW: Text Processor Function ---
    function parseRawRoutineString(rawString) {
        const lines = rawString.trim().split('\n');
        let parsedRoutine = [];

        lines.forEach(lineContent => {
            if (!lineContent.trim()) return; // Skip empty lines

            const parts = lineContent.split('/'); // Split by '/' for multiple commands per line

            parts.forEach(partText => {
                let segment = partText.trim();
                if (!segment) return;

                // Order of regex matching is important to correctly capture text around tags.

                // 1. [PAUSE:duration]OptionalTextAfterTag
                // Python: speak(OptionalTextAfterTag) THEN speak(duration) THEN sleep(duration)
                // JS: if(OptionalTextAfterTag) speak(), THEN {type:"pause", duration:D} (JS pause handler announces duration)
                let match = segment.match(/^\[PAUSE:(\d+)\](.*)$/i);
                if (match) {
                    const duration = parseInt(match[1], 10);
                    const textContent = match[2].trim();
                    if (textContent) {
                        parsedRoutine.push({ type: "speak", text: textContent });
                    }
                    parsedRoutine.push({ type: "pause", duration: duration });
                    return; // Segment processed
                }

                // 2. TextBeforeTag[IMAGEN:filename]TextAfterTag
                match = segment.match(/^(.*?)\[IMAGEN:\s*([^\]]+)\](.*)$/i);
                if (match) {
                    const textBefore = match[1].trim();
                    const imageName = match[2].trim();
                    const textAfter = match[3].trim();

                    if (textBefore) {
                        parsedRoutine.push({ type: "speak", text: textBefore });
                    }
                    // Assuming images are in assets/images/ and routine string just has filename
                    parsedRoutine.push({ type: "image", src: `assets/images/${imageName}`, alt: imageName });
                    if (textAfter) {
                        parsedRoutine.push({ type: "speak", text: textAfter });
                    }
                    return; // Segment processed
                }

                // 3. [TIEMPO]
                match = segment.match(/^\[TIEMPO\]$/i);
                if (match) {
                    parsedRoutine.push({ type: "time" });
                    return; // Segment processed
                }

                // 4. [EJERCICIO:num]OptionalDescription
                match = segment.match(/^\[EJERCICIO:\s*(\d+)\](.*)$/i);
                if (match) {
                    const exerciseNum = parseInt(match[1], 10);
                    const description = match[2].trim();
                    // The JS 'exercise' handler will announce "Ejercicio {num}. {description}"
                    parsedRoutine.push({ type: "exercise", number: exerciseNum, text: description });
                    return; // Segment processed
                }

                // 5. If no tags matched, it's plain text to speak
                parsedRoutine.push({ type: "speak", text: segment });
            });
        });
        return parsedRoutine;
    }


    // --- Functions (populateVoices, speak, updateTimer - same as before) ---
    function populateVoices() {
        availableVoices = synth.getVoices();
        voiceSelect.innerHTML = '';
        if (availableVoices.length === 0 && synth.onvoiceschanged !== undefined) {
             synth.onvoiceschanged = populateVoices;
             return;
        }
        let defaultVoiceURI = null;
        availableVoices.forEach(voice => {
            if (voice.lang.startsWith('es')) {
                const option = document.createElement('option');
                option.textContent = `${voice.name} (${voice.lang})`;
                option.setAttribute('data-lang', voice.lang);
                option.setAttribute('data-name', voice.name);
                voiceSelect.appendChild(option);
                if (voice.default && !defaultVoiceURI) {
                    defaultVoiceURI = voice.name;
                }
            }
        });
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
            const selectedOpt = Array.from(voiceSelect.options).find(opt => opt.getAttribute('data-name') === defaultVoiceURI);
            if (selectedOpt) selectedOpt.selected = true;
        } else if (voiceSelect.options.length > 0) {
             voiceSelect.selectedIndex = 0;
        }
    }

    function speak(textToSpeak, onEndCallback) {
        if (synth.speaking) {
            console.warn('SpeechSynthesis is currently speaking. Queueing or skipping.');
            // Simple approach: if speaking, wait a bit and try again, or just call onEnd.
            // For robust queueing, a proper queue mechanism would be needed.
            // For now, let's assume it's okay or the user can pause/play.
            if (onEndCallback) setTimeout(onEndCallback, 100); // Try to proceed after a short delay
            return;
        }
        if (textToSpeak && textToSpeak.trim() !== "") {
            const utterThis = new SpeechSynthesisUtterance(textToSpeak);
            const selectedOption = voiceSelect.selectedOptions[0];
            if (selectedOption) {
                const selectedVoiceName = selectedOption.getAttribute('data-name');
                 if (selectedVoiceName) {
                    const voice = availableVoices.find(v => v.name === selectedVoiceName);
                    if (voice) utterThis.voice = voice;
                }
            }

            utterThis.onend = () => {
                if (onEndCallback) onEndCallback();
            };
            utterThis.onerror = (event) => {
                console.error('SpeechSynthesisUtterance.onerror', event);
                if (onEndCallback) onEndCallback();
            };
            currentInstructionP.textContent = textToSpeak;
            synth.speak(utterThis);
        } else {
            if (onEndCallback) onEndCallback();
        }
    }

    function updateTimer() {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const seconds = String(elapsed % 60).padStart(2, '0');
        elapsedTimeSpan.textContent = `${minutes}:${seconds}`;
    }

    // --- Core Logic: processStep ---
    // (Adjusted 'exercise' case)
    function processStep() {
        if (currentStepIndex >= currentRoutine.length) {
            speak("Rutina completada.", stopSession);
            return;
        }

        if (isPausedManually) return;

        const step = currentRoutine[currentStepIndex];
        currentImageImg.classList.add('hidden');

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
                // Text before image should be handled by a preceding "speak" step from parser
                currentImageImg.src = step.src;
                currentImageImg.alt = step.alt || "Imagen del ejercicio";
                currentImageImg.classList.remove('hidden');
                currentInstructionP.textContent = step.alt || "Observa la imagen."; // Display something while image loads
                // If there was text to speak specifically WITH the image, parser should create a separate speak step.
                currentStepIndex++;
                processStep(); // Proceed immediately, image displays while next step might be prepped
                break;
            case "pause":
                const pauseDurationMs = step.duration * 1000;
                // Text before pause announcement should be handled by a "speak" step from parser
                speak(`${step.duration} segundos de pausa.`, () => { // Announce pause duration
                    currentInstructionP.textContent = `Pausa de ${step.duration} segundos...`;
                    currentTimeoutId = setTimeout(() => {
                        currentTimeoutId = null;
                        // Text after pause should be handled by a subsequent "speak" step from parser
                        currentStepIndex++;
                        processStep();
                    }, pauseDurationMs);
                });
                break;
            case "exercise": // UPDATED to work with parser output
                let exerciseAnnouncement = `Ejercicio ${step.number}`;
                if (step.text && step.text.trim() !== "") { // step.text is the description from "[EJERCICIO:1] Description"
                    exerciseAnnouncement += `. ${step.text.trim()}`;
                    currentExerciseSpan.textContent = `Ejercicio ${step.number}: ${step.text.trim()}`;
                } else {
                    currentExerciseSpan.textContent = `Ejercicio ${step.number}`;
                }
                speak(exerciseAnnouncement, () => {
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

    // --- Control Functions (startSession, stopSession, togglePlayPause) ---
    // (Updated startSession to use the parser)
    function startSession() {
        const selectedRoutineKey = routineSelect.value;
        const selectedMusicKey = musicSelect.value;

        if (!selectedRoutineKey) {
            alert("Por favor, selecciona una rutina.");
            return;
        }

        // UPDATED: Parse the raw routine string
        const rawString = routinesRaw[selectedRoutineKey];
        if (!rawString) {
            alert("Definición de rutina no encontrada.");
            return;
        }
        currentRoutine = parseRawRoutineString(rawString);
        if (!currentRoutine || currentRoutine.length === 0) {
            alert("La rutina seleccionada está vacía o no pudo ser procesada.");
            return;
        }
        // console.log("Parsed Routine:", currentRoutine); // For debugging

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

    function stopSession() { // Mostly same as before
        isPlaying = false;
        isPausedManually = false;
        playPauseBtn.innerHTML = playIconSVG;
        if (timerInterval) clearInterval(timerInterval);
        if (currentTimeoutId) {
            clearTimeout(currentTimeoutId);
            currentTimeoutId = null;
        }
        synth.cancel();
        backgroundMusicAudio.pause();
        backgroundMusicAudio.currentTime = 0;
        currentStepIndex = 0;
        currentInstructionP.textContent = "Sesión detenida. Elige una rutina para comenzar.";
        sessionScreen.classList.add('hidden');
        setupScreen.classList.remove('hidden');
    }

    function togglePlayPause() { // Mostly same as before
        if (!currentRoutine.length && !isPlaying) return; // No routine loaded or not even started

        if (isPlaying && !isPausedManually) {
            isPausedManually = true;
            playPauseBtn.innerHTML = playIconSVG;
            synth.pause();
            if(currentTimeoutId) {
                 // This is tricky. For simplicity, manual pause overrides command pause.
                 // To resume accurately, we'd need to calculate remaining duration of command pause.
                clearTimeout(currentTimeoutId);
                // We don't reset currentTimeoutId here so resume logic can know it was in a command pause
            }
            backgroundMusicAudio.pause();
            if (timerInterval) clearInterval(timerInterval); // Pause the visual timer
            currentInstructionP.textContent = "Sesión pausada.";
        } else { // Is paused (either manually or finished playing), so play/resume
            isPausedManually = false;
            isPlaying = true; // Ensure isPlaying is true when resuming
            playPauseBtn.innerHTML = pauseIconSVG;
            synth.resume();
            backgroundMusicAudio.play().catch(e => console.error("Error al reproducir música al resumir:", e));

            // Restart visual timer only if it was running (startTime is set)
            if (startTime > 0 && !timerInterval) {
                 timerInterval = setInterval(updateTimer, 1000);
            }

            // If it was paused during a [PAUSE:...] command, that command's setTimeout was cleared.
            // We need to decide how to resume. Easiest is to just continue to next step if speech isn't active.
            // Or, if currentTimeoutId was set (meaning we interrupted a command pause), we might need to restart that command's logic.
            // For now, if synth isn't speaking, trigger processStep to evaluate the current step again (or next if index moved).
            if (!synth.speaking) {
                // If we were in a command pause (currentTimeoutId was not null when paused),
                // we effectively skipped the remainder of that pause.
                // Calling processStep() will move to the next logical action.
                processStep();
            }
             // If synth was speaking and is resumed, its onend callback will call processStep().
        }
    }


    // --- Initialize App ---
    function initializeApp() {
        // Populate routine select from new raw routines
        for (const key in routinesRaw) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            routineSelect.appendChild(option);
        }

        for (const key in musicTracks) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            musicSelect.appendChild(option);
        }

        populateVoices();
        if (synth.onvoiceschanged !== undefined) {
            synth.onvoiceschanged = populateVoices;
        }

        startSessionBtn.addEventListener('click', startSession);
        playPauseBtn.addEventListener('click', togglePlayPause);
        stopBtn.addEventListener('click', stopSession);
    }

    if (typeof speechSynthesis === 'undefined') {
        currentInstructionP.textContent = "Lo sentimos, tu navegador no soporta la síntesis de voz.";
        startSessionBtn.disabled = true;
        playPauseBtn.disabled = true;
        stopBtn.disabled = true;
        return;
    }
    initializeApp();
});