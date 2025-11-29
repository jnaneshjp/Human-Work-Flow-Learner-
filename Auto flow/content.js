// content.js - The "Smart" Observer

let isRecording = true;

// --- 1. ADVANCED SELECTOR GENERATION ---
// We generate a "Fingerprint" for the element, not just one ID.
function generateFingerprint(el) {
    const path = [];
    let current = el;
    
    // Walk up the DOM tree to create a precise path
    while (current.parentNode) {
        let tag = current.tagName.toLowerCase();
        let siblings = Array.from(current.parentNode.children);
        
        if (current.id) {
            path.unshift(`#${current.id}`);
            break; // IDs are usually unique, so we can stop here
        } else {
            // Find index among siblings of same tag
            let index = siblings.filter(s => s.tagName === current.tagName).indexOf(current) + 1;
            path.unshift(`${tag}:nth-of-type(${index})`);
        }
        current = current.parentNode;
    }

    return {
        cssPath: path.join(' > '), // e.g. "div:nth-of-type(2) > form > input:nth-of-type(1)"
        innerText: el.innerText ? el.innerText.substring(0, 20) : "", // Context matching
        className: el.className,
        tagName: el.tagName
    };
}

// --- 2. ROBUST EVENT LISTENERS ---

document.addEventListener('click', (e) => {
    if (!isRecording || e.target.type === 'password') return;
    
    const fingerprint = generateFingerprint(e.target);
    
    chrome.runtime.sendMessage({
        type: 'NEW_ACTION',
        data: {
            eventType: 'click',
            fingerprint: fingerprint,
            timestamp: Date.now(),
            url: window.location.href
        }
    });
}, true);

document.addEventListener('change', (e) => {
    if (!isRecording || e.target.type === 'password') return;
    
    const fingerprint = generateFingerprint(e.target);
    
    chrome.runtime.sendMessage({
        type: 'NEW_ACTION',
        data: {
            eventType: 'input',
            fingerprint: fingerprint,
            value: e.target.value,
            timestamp: Date.now(),
            url: window.location.href
        }
    });
}, true);

// --- 3. INTELLIGENT EXECUTOR ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXECUTE_workflow') {
        console.log("Starting Smart Automation...");
        executeSequence(request.actions);
    }
});

async function executeSequence(actions) {
    for (const action of actions) {
        try {
            const element = await waitForElement(action.fingerprint);
            
            // Visual Debugging
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.style.outline = "3px solid #FF00FF";
            
            if (action.eventType === 'click') {
                simulateClick(element);
            } else if (action.eventType === 'input') {
                simulateTyping(element, action.value);
            }
            
            // Small human-like pause between steps
            await new Promise(r => setTimeout(r, 500));
            element.style.outline = "none";
            
        } catch (error) {
            console.error("Automation Failed at step:", action, error);
            alert("Auto-Flow lost track of the workflow. Please intervene.");
            break; // Stop execution to prevent chaos
        }
    }
}

// --- 4. HELPER FUNCTIONS ---

// Waits up to 5 seconds for the element to appear
function waitForElement(fingerprint) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const check = () => {
            // Strategy 1: Try exact CSS Path
            let el = document.querySelector(fingerprint.cssPath);
            
            // Strategy 2: Fallback to Text matching if CSS path fails (Dynamic IDs)
            if (!el && fingerprint.innerText) {
                const allTags = document.getElementsByTagName(fingerprint.tagName);
                for (let tag of allTags) {
                    if (tag.innerText.includes(fingerprint.innerText)) {
                        el = tag;
                        break;
                    }
                }
            }

            if (el && isVisible(el)) {
                resolve(el);
            } else if (Date.now() - startTime > 5000) {
                reject("Element not found: " + fingerprint.cssPath);
            } else {
                requestAnimationFrame(check);
            }
        };
        check();
    });
}

function isVisible(elem) {
    return !!( elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length );
}

function simulateClick(element) {
    // Simulates a full mouse event chain
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
        element.dispatchEvent(new MouseEvent(eventType, {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1
        }));
    });
}

function simulateTyping(element, text) {
    element.focus();
    element.value = text;
    // React/Angular require the 'input' event to detect changes
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
}