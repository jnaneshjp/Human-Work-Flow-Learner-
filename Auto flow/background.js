// background.js

let userHistory = [];
const PATTERN_LENGTH = 3; // Length of sequence to look for (A->B->C)
const REPEAT_THRESHOLD = 3; // How many times it must happen

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'NEW_ACTION') {
        userHistory.push(message.data);
        // Keep history clean, max 50 items to save memory
        if (userHistory.length > 50) userHistory.shift();
        analyzePatterns();
    }
});

function analyzePatterns() {
    if (userHistory.length < PATTERN_LENGTH * 2) return;

    // Get the most recent sequence (e.g., the last 3 actions)
    const recentSequence = userHistory.slice(-PATTERN_LENGTH);
    
    let matchCount = 0;
    
    // Scan history for this EXACT sequence
    // We step through history 1 action at a time
    for (let i = 0; i <= userHistory.length - PATTERN_LENGTH; i++) {
        let isMatch = true;
        
        for (let j = 0; j < PATTERN_LENGTH; j++) {
            const historical = userHistory[i + j];
            const current = recentSequence[j];
            
            // Compare fingerprints (CSS Path) and Event Types
            if (historical.fingerprint.cssPath !== current.fingerprint.cssPath ||
                historical.eventType !== current.eventType) {
                isMatch = false;
                break;
            }
        }
        
        if (isMatch) matchCount++;
    }

    if (matchCount >= REPEAT_THRESHOLD) {
        console.log("Pattern Detected:", recentSequence);
        
        // Save to storage
        const proposal = {
            id: Date.now(),
            actions: recentSequence,
            domain: new URL(recentSequence[0].url).hostname, // Better Categorization
            path: new URL(recentSequence[0].url).pathname
        };

        chrome.storage.local.set({ 'pendingProposal': proposal });
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: "#00FF00" });
    }
}