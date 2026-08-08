const noSleep = new NoSleep();
const DISTANCE_STORAGE_KEY = 'wellnessTimer.lastRunDistanceMeters';
const ROUTE_STORAGE_KEY = 'wellnessTimer.lastRunRoute';

const runTracking = {
    watchId: null,
    lastPosition: null,
    totalMeters: 0,
    isTracking: false,
    routePoints: []
};

let runRouteMap = null;
let runRouteLayer = null;
let runRouteTileLayer = null;
let isRouteMapFallbackFullscreen = false;

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

function setRouteVisibility(isVisible) {
    const routeWrap = document.getElementById('runRouteMapWrap');
    if (!routeWrap) {
        return;
    }

    routeWrap.classList.toggle('is-hidden', !isVisible);
}

function parseStoredRoute() {
    try {
        const stored = localStorage.getItem(ROUTE_STORAGE_KEY);
        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter(point => {
            return point && Number.isFinite(point.lat) && Number.isFinite(point.lng);
        });
    } catch (error) {
        console.error('Failed to parse stored run route:', error);
        return [];
    }
}

function attachMapTilesIfOnline() {
    if (!runRouteMap || runRouteTileLayer || !navigator.onLine || !window.L) {
        return;
    }

    runRouteTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(runRouteMap);
}

function renderRunRouteMap(routePoints) {
    if (!window.L) {
        setRouteVisibility(false);
        return;
    }

    const mapElement = document.getElementById('runRouteMap');
    if (!mapElement) {
        return;
    }

    if (!Array.isArray(routePoints) || routePoints.length < 2) {
        setRouteVisibility(false);
        if (runRouteMap) {
            runRouteMap.remove();
            runRouteMap = null;
            runRouteLayer = null;
        }
        return;
    }

    setRouteVisibility(true);

    if (!runRouteMap) {
        runRouteMap = L.map(mapElement, {
            zoomControl: false,
            attributionControl: true
        });

        attachMapTilesIfOnline();
    } else {
        attachMapTilesIfOnline();
    }

    if (runRouteLayer) {
        runRouteLayer.remove();
    }

    const latLngs = routePoints.map(point => [point.lat, point.lng]);
    runRouteLayer = L.layerGroup();

    const routePath = L.polyline(latLngs, {
        color: '#4dd7c4',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(runRouteLayer);

    L.circleMarker(latLngs[0], {
        radius: 6,
        color: '#f6fbff',
        fillColor: '#5af2e0',
        fillOpacity: 0.9,
        weight: 2
    }).addTo(runRouteLayer);

    L.circleMarker(latLngs[latLngs.length - 1], {
        radius: 6,
        color: '#f6fbff',
        fillColor: '#ffcf6b',
        fillOpacity: 0.9,
        weight: 2
    }).addTo(runRouteLayer);

    runRouteLayer.addTo(runRouteMap);
    runRouteMap.fitBounds(routePath.getBounds(), { padding: [20, 20] });

    setTimeout(() => {
        if (runRouteMap) {
            runRouteMap.invalidateSize();
        }
    }, 0);
}

function invalidateRouteMapSizeSoon() {
    setTimeout(() => {
        if (runRouteMap) {
            runRouteMap.invalidateSize();
        }
    }, 60);
}

function setRouteMapFallbackFullscreen(isFullscreen) {
    const mapElement = document.getElementById('runRouteMap');
    const closeButton = document.getElementById('runRouteMapClose');
    if (!mapElement || !closeButton) {
        return;
    }

    isRouteMapFallbackFullscreen = isFullscreen;
    mapElement.classList.toggle('is-fallback-fullscreen', isFullscreen);
    closeButton.classList.toggle('is-visible', isFullscreen);
    document.body.classList.toggle('route-map-overlay-open', isFullscreen);
    invalidateRouteMapSizeSoon();
}

function openRouteMapFullscreen() {
    const mapElement = document.getElementById('runRouteMap');
    const closeButton = document.getElementById('runRouteMapClose');
    if (!mapElement || !closeButton) {
        return;
    }

    closeButton.classList.add('is-visible');

    if (mapElement.requestFullscreen) {
        mapElement.requestFullscreen()
            .then(() => invalidateRouteMapSizeSoon())
            .catch(() => setRouteMapFallbackFullscreen(true));
        return;
    }

    setRouteMapFallbackFullscreen(true);
}

function closeRouteMapFullscreen() {
    const mapElement = document.getElementById('runRouteMap');
    const closeButton = document.getElementById('runRouteMapClose');
    if (!mapElement || !closeButton) {
        return;
    }

    const isNativeFullscreen = document.fullscreenElement === mapElement;

    if (isNativeFullscreen && document.exitFullscreen) {
        document.exitFullscreen().finally(() => {
            closeButton.classList.remove('is-visible');
            invalidateRouteMapSizeSoon();
        });
        return;
    }

    if (isRouteMapFallbackFullscreen) {
        setRouteMapFallbackFullscreen(false);
    }

    closeButton.classList.remove('is-visible');
}

function initializeRouteMapInteractions() {
    const mapElement = document.getElementById('runRouteMap');
    const closeButton = document.getElementById('runRouteMapClose');
    if (!mapElement || !closeButton) {
        return;
    }

    mapElement.addEventListener('click', () => {
        const isNativeFullscreen = document.fullscreenElement === mapElement;
        if (!isNativeFullscreen && !isRouteMapFallbackFullscreen) {
            openRouteMapFullscreen();
        }
    });

    closeButton.addEventListener('click', event => {
        event.stopPropagation();
        closeRouteMapFullscreen();
    });

    document.addEventListener('fullscreenchange', () => {
        const isNativeFullscreen = document.fullscreenElement === mapElement;
        closeButton.classList.toggle('is-visible', isNativeFullscreen || isRouteMapFallbackFullscreen);
        if (!isNativeFullscreen) {
            document.body.classList.remove('route-map-overlay-open');
        }
        invalidateRouteMapSizeSoon();
    });
}

function renderStoredRunDistance() {
    const storedMeters = Number.parseFloat(localStorage.getItem(DISTANCE_STORAGE_KEY));
    const storedRoute = parseStoredRoute();

    if (Number.isFinite(storedMeters) && storedMeters > 0) {
        updateRunDistanceUI(formatDistance(storedMeters), 'Last completed run distance.');
        renderRunRouteMap(storedRoute);
        return;
    }

    updateRunDistanceUI('No run data yet', 'Tap Run to start GPS tracking.');
    setRouteVisibility(false);
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

    const latestPoint = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
    };
    const previousPoint = runTracking.routePoints[runTracking.routePoints.length - 1];
    if (!previousPoint || previousPoint.lat !== latestPoint.lat || previousPoint.lng !== latestPoint.lng) {
        runTracking.routePoints.push(latestPoint);
    }

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
    runTracking.routePoints = [];

    updateRunDistanceUI('0 m', 'Waiting for GPS lock...');
    setRouteVisibility(false);

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

    return {
        totalMeters: runTracking.totalMeters,
        routePoints: [...runTracking.routePoints]
    };
}

function finalizeRunDistanceTracking() {
    if (!runTracking.isTracking) {
        return;
    }

    const { totalMeters, routePoints } = stopRunDistanceTracking();
    localStorage.setItem(DISTANCE_STORAGE_KEY, String(totalMeters));
    localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify(routePoints));
    updateRunDistanceUI(formatDistance(totalMeters), 'Run completed. Distance and route saved on homepage.');
    renderRunRouteMap(routePoints);
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

        ['जीवन जीने के लिए है, और हम जीने का मज़ा लेने आए हैं। हम आज चालीस मिनट तक दौड़ेंगे, यह एक बड़ी उपलब्धि होगी। हम ३० सेकंड में शुरू करेंगे।', 15],
        /*['शुभकामनाएँ! आइए, आरंभ करते हैं!', 60],
        ['टाइमर चल रहा है, निश्चिंत रहें। उनतालीस मिनट और हैं।', 780],
        ['बहुत बढ़िया! अब छब्बीस मिनट शेष हैं। अपनी गति बनाए रखें।', 300],
        ['अब इक्कीस मिनट और हैं।', 720],
        ['अब नौ मिनट शेष हैं।', 180],
        ['अब छह मिनट शेष हैं।', 120],
        ['अगले चार मिनट तक जारी रखें।', 60],
        ['अब सिर्फ तीन मिनट शेष हैं!', 60],
        ['अब सिर्फ दो मिनट शेष हैं!', 60],
        ['अंतिम एक मिनट शेष है!', 60],
        ['शानदार! दौड़ अब पूरी हो गई है। अपनी उपलब्धियों में इसे दर्ज करें।', 0]*/

    ], {
        onStart: startRunDistanceTracking,
        onComplete: finalizeRunDistanceTracking
    });
}

initializeRouteMapInteractions();
renderStoredRunDistance();

window.addEventListener('online', () => {
    attachMapTilesIfOnline();
    invalidateRouteMapSizeSoon();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(error => {
            console.error('Service worker registration failed:', error);
        });
    });
}
