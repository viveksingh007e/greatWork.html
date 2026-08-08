const noSleep = new NoSleep();
const DISTANCE_STORAGE_KEY = 'wellnessTimer.lastRunDistanceMeters';

const runTracking = {
    watchId: null,
    lastPosition: null,
    totalMeters: 0,
    isTracking: false
};

let hindiVoice = null;

function toRadians(value) {
    return value * (Math.PI / 180);
}

function calculateDistanceMeters(fromPos, toPos) {
    const earthRadiusMeters = 6371000;
    const lat1 = toRadians(fromPos.coords.latitude);
    const lat2 = toRadians(toPos.coords.latitude);
    const deltaLat = toRadians(toPos.coords.latitude - fromPos.coords.latitude);
    const deltaLon = toRadians(toPos.coords.longitude - fromPos.coords.longitude);

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
        + Math.cos(lat1) * Math.cos(lat2)
        * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
}

function formatDistance(meters) {
    const roundedMeters = Math.max(0, Math.round(meters || 0));
    const kilometers = Math.floor(roundedMeters / 1000);
    const remainingMeters = roundedMeters % 1000;

    if (kilometers > 0) {
        return `${kilometers} km ${remainingMeters} m`;
    }

    return `${roundedMeters} m`;
}

function updateRunDistanceUI(valueText, subText) {
    const valueEl = document.getElementById('runDistanceValue');
    const subTextEl = document.getElementById('runDistanceSubtext');

    if (valueEl) {
        valueEl.textContent = valueText;
    }

    if (subTextEl) {
        subTextEl.textContent = subText;
    }
}

function renderStoredRunDistance() {
    const storedMeters = Number.parseFloat(localStorage.getItem(DISTANCE_STORAGE_KEY));
    if (Number.isFinite(storedMeters) && storedMeters > 0) {
        updateRunDistanceUI(formatDistance(storedMeters), 'Last completed run distance.');
        return;
    }

    updateRunDistanceUI('No run data yet', 'Tap Run to start GPS tracking.');
}

function onRunPositionUpdate(position) {
    const accuracy = position.coords.accuracy || 0;
    if (accuracy > 80) {
        return;
    }

    if (runTracking.lastPosition) {
        const meters = calculateDistanceMeters(runTracking.lastPosition, position);
        const elapsedSeconds = (position.timestamp - runTracking.lastPosition.timestamp) / 1000;
        const speedMps = elapsedSeconds > 0 ? meters / elapsedSeconds : 0;

        // Filter jumps caused by weak GPS signal.
        if (meters < 120 && speedMps <= 8.5) {
            runTracking.totalMeters += meters;
        }
    }

    runTracking.lastPosition = position;
    updateRunDistanceUI(formatDistance(runTracking.totalMeters), 'GPS tracking active while run session is in progress.');
}

function onRunPositionError(error) {
    if (error.code === error.PERMISSION_DENIED) {
        stopRunDistanceTracking();
        alert('GPS permission is required to track run distance. Please allow location access.');
        updateRunDistanceUI('GPS permission denied', 'Allow location permission and start Run again.');
    } else {
        updateRunDistanceUI(formatDistance(runTracking.totalMeters), 'GPS signal issue detected. Tracking will continue when signal improves.');
    }
}

function startRunDistanceTracking() {
    if (!navigator.geolocation) {
        throw new Error('Geolocation is not supported on this device/browser.');
    }

    if (runTracking.watchId !== null) {
        navigator.geolocation.clearWatch(runTracking.watchId);
    }

    runTracking.watchId = null;
    runTracking.lastPosition = null;
    runTracking.totalMeters = 0;
    runTracking.isTracking = true;

    updateRunDistanceUI('0 m', 'Waiting for GPS lock...');

    runTracking.watchId = navigator.geolocation.watchPosition(
        onRunPositionUpdate,
        onRunPositionError,
        {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 10000
        }
    );
}

function stopRunDistanceTracking() {
    if (runTracking.watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(runTracking.watchId);
    }

    runTracking.watchId = null;
    runTracking.lastPosition = null;
    runTracking.isTracking = false;

    return runTracking.totalMeters;
}

function finalizeRunDistanceTracking() {
    if (!runTracking.isTracking) {
        return;
    }

    const totalMeters = stopRunDistanceTracking();
    localStorage.setItem(DISTANCE_STORAGE_KEY, String(totalMeters));
    updateRunDistanceUI(formatDistance(totalMeters), 'Run completed. Distance saved on homepage.');
}

function loadVoices() {
    const voices = speechSynthesis.getVoices();
    hindiVoice = voices.find(v => v.lang === 'hi-IN');
}

speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

function speakAndWait(text, waitSeconds) {
    return new Promise(resolve => {
        speechSynthesis.cancel(); // prevent queue buildup
        const utterance = new SpeechSynthesisUtterance(text);
        if (hindiVoice) {
            utterance.voice = hindiVoice;
        }
        utterance.rate = 0.9;
        utterance.onend = () => {
            setTimeout(resolve, waitSeconds * 1000);
        };
        utterance.onerror = () => resolve();
        speechSynthesis.speak(utterance);
    });
}

async function runExercise(routine, hooks = {}) {
    try {
        if (hooks.onStart) {
            await hooks.onStart();
        }
        await noSleep.enable();
        for (const [text, wait] of routine) {
            await speakAndWait(text, wait);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error starting exercise: ' + error.message);
    } finally {
        noSleep.disable();
        if (hooks.onComplete) {
            await hooks.onComplete();
        }
    }
}

function startEyeExercise() {
    runExercise([

        ['स्वागत है! हम अब आँखों के व्यायाम शुरू करेंगे। यह केवल ८ मिनट का होगा। आराम से बैठें और सही स्थिति में आ जाएँ', 25],
        ['हम डेढ़ मिनट के लिए आँखों को हल्के से घुमाने से शुरुआत करेंगे', 95],
        ['बहुत बढ़िया! अब घुमाना पूरा हो गया है। आराम करें!', 15],
        ['अब डेढ़ मिनट के लिए अपनी आँखों की सॉकेट्स को हल्के से मालिश करें।', 95],
        ['बहुत बढ़िया! अब मालिश पूरी हो गई है। आराम करें!', 15],
        ['अब दो मिनट के लिए अपनी एक्यूप्रेशर पॉइंट्स को दबाएँ', 125],
        ['बहुत बढ़िया! अब एक्यूप्रेशर पूरा हो गया है। आराम करें!', 15],
        ['अब तक शानदार! अब ३ मिनट के लिए पास और दूर के बिंदुओं पर ध्यान समायोजन करें। अभी शुरू कर रहे हैं!', 127],
        ['बहुत अच्छा! अब आराम करें', 10],
        ['और १ मिनट के लिए जारी रखें', 65],
        ['शानदार ! हमने सभी आँखों के व्यायाम पूरे कर लिए हैं। फिर मिलेंगे!', 0]

    ]);
}

function startBellyExercise() {
    runExercise([
        ['स्वागत है! हम अब कोर के व्यायाम शुरू करेंगे। यह केवल ५ मिनट का होगा। सही स्थिति में आने के लिए अपना समय लें। हम १० सेकंड में शुरू करेंगे', 20],
        ['आइए डेढ़ मिनट के लिए खड़े होकर घुटने उठाने वाला व्यायाम शुरू करें।', 95],
        ['बहुत बढ़िया! अब १० सेकंड के लिए आराम करें', 12],
        ['आइए डेढ़ मिनट के लिए खड़े होकर साइड बेंड्स शुरू करें।', 95],
        ['बहुत बढ़िया! अब १० सेकंड के लिए आराम करें', 12],
        ['आइए दो मिनट के लिए खड़े होकर ट्विस्ट्स शुरू करें।', 125],
        ['शानदार ! हमने सभी कोर व्यायाम पूरे कर लिए हैं। फिर मिलेंगे!', 0],
        ['आप अतिरिक्त रूप से ग्लूट ब्रिजेस, मॉडिफाइड प्लैंक और डेड बग व्यायाम कर सकते हैं', 0]
    ]);
}

function startYog() {
    runExercise([

        ['स्वागत है! हम अब योग शुरू करेंगे। यह केवल नौ मिनट का होगा। सही स्थिति में आने के लिए अपना समय लें। हम दस सेकंड में शुरू करेंगे', 3], 
        
        ['आइए पाँच मिनट के लिए कपालभाति प्राणायाम शुरू करें। अभी शुरू करते हैं!', 125],
        ['बहुत बढ़िया! अब दस सेकंड के लिए आराम करें', 12],
        ['अगले तीन मिनट तक जारी रखें', 125],
        ['अब अंतिम एक मिनट शेष है!', 65],
        ['बहुत बढ़िया! अब कपालभाति प्राणायाम पूरी हो गई है। आराम करें!', 20],
        ['आइए दो मिनट के लिए अनुलोम विलोम प्राणायाम शुरू करें। अभी शुरू करते हैं!', 125],
        ['बहुत बढ़िया! अनुलोम विलोम प्राणायाम अब पूरा हो गया है। आराम करें!', 20],
        ['आइए दो मिनट के लिए बालायाम शुरू करें। अभी शुरू करते हैं!', 125],
        ['शानदार! हमने योग पूरा कर लिया है। फिर मिलेंगे!', 0]
        

    ]);
}

function startRun() {
    runExercise([

        ['जीवन जीने के लिए है, और हम जीने का मज़ा लेने आए हैं। हम आज पैंतीस मिनट तक दौड़ेंगे, यह एक बड़ी उपलब्धि होगी। हम ३० सेकंड में शुरू करेंगे।', 15],

        /*['शुभकामनाएँ! आइए, आरंभ करते हैं!', 60],
        
        ['टाइमर चल रहा है, निश्चिंत रहें। चौंतीस मिनट और हैं।', 780],

        ['अब इक्कीस मिनट और हैं।', 720],
        
        ['अब नौ मिनट शेष हैं', 180],
        
        ['अब छह मिनट शेष हैं', 120],
        
        ['अगले चार मिनट तक जारी रखें', 60],
        
        ['अब सिर्फ तीन मिनट शेष हैं!', 60],
        
        ['अब सिर्फ दो मिनट शेष हैं!', 60],
        
        ['अंतिम एक मिनट शेष है!', 60],
        
        ['शानदार! दौड़ अब पूरी हो गई है। अपनी उपलब्धियों में इसे दर्ज करें।', 0]*/

    ], {
        onStart: startRunDistanceTracking,
        onComplete: finalizeRunDistanceTracking
    });
}

renderStoredRunDistance();
