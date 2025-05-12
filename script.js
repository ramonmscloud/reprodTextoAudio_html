document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const setupScreen = document.getElementById('setup-screen');
    const sessionScreen = document.getElementById('session-screen');
    // MODIFICADO: Ya no se usa routineSelect, se añade routineFileInput
    const routineFileInput = document.getElementById('routine-file-input');
    const loadedFileNameP = document.getElementById('loaded-file-name'); // Para mostrar el nombre del archivo
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

    // --- State Variables ---
    let currentRoutine = [];
    let currentStepIndex = 0;
    let isPlaying = false;
    let isPausedManually = false;
    let startTime = 0;
    let timerInterval = null;
    let synth = window.speechSynthesis;
    let availableVoices = [];
    let currentTimeoutId = null;
    let uploadedRoutineString = null; // NUEVO: Para almacenar el contenido del archivo cargado

    // --- Data Definitions (Music) ---
    // routinesRaw ya no se usa para la selección, pero el parser sigue siendo necesario
    const musicTracks = {
        "Música Relajante": "assets/music/relaxing_tune.mp3",
        "Sonidos de la Naturaleza": "assets/music/nature_sounds.mp3"
    };

    // --- Text Processor Function (parseRawRoutineString - sin cambios) ---
    function parseRawRoutineString(rawString) {
        const lines = rawString.trim().split('\n');
        let parsedRoutine = [];

        lines.forEach(lineContent => {
            if (!lineContent.trim()) return;
            const parts = lineContent.split('/');
            parts.forEach(partText => {
                let segment = partText.trim();
                if (!segment) return;
                let match = segment.match(/^\[PAUSE:(\d+)\](.*)$/i);
                if (match) {
                    const duration = parseInt(match[1], 10);
                    const textContent = match[2].trim();
                    if (textContent) {
                        parsedRoutine.push({ type: "speak", text: textContent });
                    }
                    parsedRoutine.push({ type: "pause", duration: duration });
                    return;
                }
                match = segment.match(/^(.*?)\[IMAGEN:\s*([^\]]+)\](.*)$/i);
                if (match) {
                    const textBefore = match[1].trim();
                    const imageName = match[2].trim();
                    const textAfter = match[3].trim();
                    if (textBefore) {
                        parsedRoutine.push({ type: "speak", text: textBefore });
                    }
                    parsedRoutine.push({ type: "image", src: `assets/images/${imageName}`, alt: imageName });
                    if (textAfter) {
                        parsedRoutine.push({ type: "speak", text: textAfter });
                    }
                    return;
                }
                match = segment.match(/^\[TIEMPO\]$/i);
                if (match) {
                    parsedRoutine.push({ type: "time" });
                    return;
                }
                match = segment.match(/^\[EJERCICIO:\s*(\d+)\](.*)$/i);
                if (match) {
                    const exerciseNum = parseInt(match[1], 10);
                    const description = match[2].trim();
                    parsedRoutine.push({ type: "exercise", number: exerciseNum, text: description });
                    return;
                }
                parsedRoutine.push({ type: "speak", text: segment });
            });
        });
        return parsedRoutine;
    }

    // --- Functions (populateVoices, speak, updateTimer - sin cambios) ---
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
            console.warn('SpeechSynthesis is currently speaking.');
            if (onEndCallback) setTimeout(onEndCallback, 100);
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


    // --- Core Logic: processStep (sin cambios) ---
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
                speak(step.text, () => { currentStepIndex++; processStep(); });
                break;
            case "image":
                currentImageImg.src = step.src;
                currentImageImg.alt = step.alt || "Imagen del ejercicio";
                currentImageImg.classList.remove('hidden');
                currentInstructionP.textContent = step.alt || "Observa la imagen.";
                currentStepIndex++;
                processStep();
                break;
            case "pause":
                const pauseDurationMs = step.duration * 1000;
                speak(`${step.duration} segundos de pausa.`, () => {
                    currentInstructionP.textContent = `Pausa de ${step.duration} segundos...`;
                    currentTimeoutId = setTimeout(() => {
                        currentTimeoutId = null;
                        currentStepIndex++;
                        processStep();
                    }, pauseDurationMs);
                });
                break;
            case "exercise":
                let exerciseAnnouncement = `Ejercicio ${step.number}`;
                if (step.text && step.text.trim() !== "") {
                    exerciseAnnouncement += `. ${step.text.trim()}`;
                    currentExerciseSpan.textContent = `Ejercicio ${step.number}: ${step.text.trim()}`;
                } else {
                    currentExerciseSpan.textContent = `Ejercicio ${step.number}`;
                }
                speak(exerciseAnnouncement, () => { currentStepIndex++; processStep(); });
                break;
            case "time":
                const now = Date.now();
                const elapsedMinutes = Math.floor((now - startTime) / 60000);
                speak(`Han transcurrido ${elapsedMinutes} minutos.`, () => { currentStepIndex++; processStep(); });
                break;
            default:
                console.warn("Tipo de paso desconocido:", step);
                currentStepIndex++;
                processStep();
        }
    }

    // --- Control Functions ---
    // MODIFICADO: startSession ahora usa uploadedRoutineString
    function startSession() {
        const selectedMusicKey = musicSelect.value;

        if (!uploadedRoutineString) { // Verifica si se ha cargado un archivo
            alert("Por favor, carga un archivo de rutina (.txt) primero.");
            return;
        }

        currentRoutine = parseRawRoutineString(uploadedRoutineString); // Parsea el contenido del archivo
        if (!currentRoutine || currentRoutine.length === 0) {
            alert("El archivo de rutina está vacío o no pudo ser procesado. Verifica el formato.");
            loadedFileNameP.textContent = "Error al procesar el archivo. Intenta de nuevo.";
            loadedFileNameP.style.color = "red";
            return;
        }
        // console.log("Parsed Routine from file:", currentRoutine); // For debugging

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

    function stopSession() { // Sin cambios significativos
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
        currentInstructionP.textContent = "Sesión detenida. Carga una rutina para comenzar.";
        sessionScreen.classList.add('hidden');
        setupScreen.classList.remove('hidden');
        // Reset file input display
        // routineFileInput.value = ""; // Esto puede ser problemático por seguridad en algunos navegadores
        loadedFileNameP.textContent = "";
        uploadedRoutineString = null;
    }

    function togglePlayPause() { // Sin cambios significativos
        if (!currentRoutine.length && !isPlaying) return;
        if (isPlaying && !isPausedManually) {
            isPausedManually = true;
            playPauseBtn.innerHTML = playIconSVG;
            synth.pause();
            if(currentTimeoutId) {
                clearTimeout(currentTimeoutId);
            }
            backgroundMusicAudio.pause();
            if (timerInterval) clearInterval(timerInterval);
            currentInstructionP.textContent = "Sesión pausada.";
        } else {
            isPausedManually = false;
            isPlaying = true;
            playPauseBtn.innerHTML = pauseIconSVG;
            synth.resume();
            backgroundMusicAudio.play().catch(e => console.error("Error al reproducir música al resumir:", e));
            if (startTime > 0 && !timerInterval) {
                 timerInterval = setInterval(updateTimer, 1000);
            }
            if (!synth.speaking) {
                processStep();
            }
        }
    }

    // --- NUEVO: Manejador para la carga de archivos ---
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            if (file.type === "text/plain") {
                const reader = new FileReader();
                reader.onload = (e) => {
                    uploadedRoutineString = e.target.result;
                    loadedFileNameP.textContent = `Archivo cargado: ${file.name}`;
                    loadedFileNameP.style.color = "#555"; // Color normal
                    // Opcional: intentar parsear aquí para validación temprana
                    // try {
                    //    const testParse = parseRawRoutineString(uploadedRoutineString);
                    //    if(!testParse || testParse.length === 0) throw new Error("Rutina vacía o inválida");
                    //    startSessionBtn.disabled = false; // Habilitar botón si es válido
                    // } catch (error) {
                    //    loadedFileNameP.textContent = `Error en formato de archivo: ${file.name}`;
                    //    startSessionBtn.disabled = true;
                    //    uploadedRoutineString = null;
                    // }
                };
                reader.onerror = () => {
                    console.error("Error al leer el archivo.");
                    loadedFileNameP.textContent = "Error al leer el archivo.";
                    loadedFileNameP.style.color = "red";
                    uploadedRoutineString = null;
                    // startSessionBtn.disabled = true;
                };
                reader.readAsText(file);
            } else {
                alert("Por favor, selecciona un archivo de texto plano (.txt).");
                loadedFileNameP.textContent = "Tipo de archivo no válido.";
                loadedFileNameP.style.color = "red";
                event.target.value = ""; // Resetea el input de archivo
                uploadedRoutineString = null;
                // startSessionBtn.disabled = true;
            }
        } else {
            uploadedRoutineString = null;
            loadedFileNameP.textContent = "";
            // startSessionBtn.disabled = true;
        }
    }

    // --- Initialize App ---
    function initializeApp() {
        // MODIFICADO: Ya no se populan las rutinas desde routinesRaw
        // en un select, se añade listener para el input de archivo.
        routineFileInput.addEventListener('change', handleFileUpload);

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
        // startSessionBtn.disabled = true; // Deshabilitar al inicio hasta que se cargue un archivo válido
    }

    if (typeof speechSynthesis === 'undefined') {
        currentInstructionP.textContent = "Lo sentimos, tu navegador no soporta la síntesis de voz.";
        startSessionBtn.disabled = true;
        playPauseBtn.disabled = true;
        stopBtn.disabled = true;
        if(routineFileInput) routineFileInput.disabled = true;
        return;
    }
    initializeApp();
});