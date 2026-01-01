// ---------- IndexedDB Connection ----------

// 0. Safety Check: Stop execution if extension context is invalid
if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
    console.warn("Dashboard: Extension context invalid. Script stopped.");
    throw new Error("Extension context invalid");
}

// 1. Consolidated Listener
let refreshTimeout;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'refresh_dashboard') {
        clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(() => {
            console.log('Dashboard: refreshing due to new events');
            if (chrome.runtime.id) { 
                start()
                    .then(() => sendResponse({ status: "success" }))
                    .catch(err => sendResponse({ status: "error", message: err.toString() }));
            }
        }, 150);
        return true; 
    }
});

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("TaskMiningDB", 3); // Ensure version matches background.js

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("events")) {
                db.createObjectStore("events", { keyPath: "id", autoIncrement: true });
            }
        };

        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(new Error("DB open failed"));
    });
}

// ---------- Load All Events from DB ----------
async function loadEvents() {
    let db;
    try {
        db = await openDB();
    } catch (e) {
        console.error("Could not load events:", e);
        return [];
    }

    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains("events")) {
            resolve([]);
            return;
        }

        const tx = db.transaction("events", "readonly");
        const store = tx.objectStore("events");
        const req = store.getAll();

        req.onsuccess = () => resolve((req.result || []).sort((a, b) => a.timestamp - b.timestamp));
        req.onerror = () => reject(new Error("Failed to read events"));
    });
}

// ---------- Group Events Into Workflows ----------
function groupWorkflows(events) {
    if (!events || !events.length) return [];

    // Filter out invalid events
    const validEvents = events.filter(e => e.data && e.data.timestamp);
    validEvents.sort((a, b) => a.data.timestamp - b.data.timestamp);

    const workflows = [];
    let current = [];
    const GAP = 5 * 60 * 1000; // 5 minutes

    validEvents.forEach((event, idx) => {
        if (idx === 0) {
            current.push(event);
            return;
        }

        const timeDiff = event.data.timestamp - validEvents[idx - 1].data.timestamp;

        if (timeDiff > GAP) {
            workflows.push(current);
            current = [event];
        } else {
            current.push(event);
        }
    });

    if (current.length > 0) workflows.push(current);
    return workflows;
}

// ---------- Render Sidebar List ----------
function renderWorkflowList(workflows) {
    const list = document.getElementById("workflow-list");
    if (!list) return;

    list.innerHTML = "";

    if (!workflows.length) {
        list.innerHTML = "<p style='padding:10px;color:#aaa;'>No workflows found</p>";
        return;
    }

    workflows.forEach((wf, idx) => {
        const div = document.createElement("div");
        div.className = "workflow-item";
        
        // Try to find a domain name for the title
        const firstUrl = wf[0].data.url || "";
        let domain = "Unknown";
        try { domain = new URL(firstUrl).hostname; } catch(e){}

        div.innerHTML = `
            <strong>Workflow ${idx + 1}</strong><br>
            <small>${domain}</small><br>
            <span style="color:#666; font-size:0.8em;">${wf.length} steps</span>
        `;

        div.onclick = () => renderWorkflowDetails(wf, idx + 1);
        list.appendChild(div);
    });
}

// ---------- Render Workflow Details ----------
function renderWorkflowDetails(workflow, number) {
    const titleEl = document.getElementById("workflow-title");
    if (titleEl) titleEl.textContent = `Workflow ${number}`;

    const container = document.getElementById("workflow-events");
    if (!container) return;

    // --- NEW: Automation Engine UI ---
    container.innerHTML = `
        <div style="padding: 15px; border-bottom: 1px solid #ddd; margin-bottom: 10px; background: #f9f9f9;">
            <button id="btn-run-automation" style="
                background-color: #2196F3; 
                color: white; 
                padding: 10px 20px; 
                border: none; 
                border-radius: 4px; 
                cursor: pointer; 
                font-weight: bold;">
                ▶ Run This Automation
            </button>
            <div id="run-status" style="margin-top:10px; font-size:0.9em; color:#666;"></div>
        </div>
    `;

    // Attach Event Listener to the new button
    document.getElementById("btn-run-automation").onclick = () => runWorkflowEngine(workflow);

    // List the events below
    workflow.forEach(event => {
        const div = document.createElement("div");
        div.className = "event";
        
        const type = event.data.eventType || "Unknown";
        const time = event.data.timestamp ? new Date(event.data.timestamp).toLocaleTimeString() : "N/A";
        const target = event.data.fingerprint ? event.data.fingerprint.tagName : "Element";

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <strong>${type.toUpperCase()}</strong>
                <span style="color:#888;">${time}</span>
            </div>
            <div style="font-family:monospace; margin-top:5px; color:#444;">
                Target: ${target}
            </div>
            ${event.data.value ? `<div style="margin-top:5px; color:green;">Value: "${event.data.value}"</div>` : ''}
        `;
        container.appendChild(div);
    });
}

// ---------- AUTOMATION ENGINE ----------
async function runWorkflowEngine(workflow) {
    const statusEl = document.getElementById("run-status");
    statusEl.textContent = "Preparing to run...";
    statusEl.style.color = "blue";

    if (!workflow || workflow.length === 0) {
        statusEl.textContent = "Error: Workflow is empty.";
        return;
    }

    // 1. Extract clean actions for content.js
    const actions = workflow.map(item => item.data);
    const targetUrl = actions[0].url;

    try {
        // 2. Find or Open the Tab
        const tab = await findTargetTab(targetUrl);
        
        // 3. Send Execution Command
        statusEl.textContent = `Targeting tab ${tab.id}... sending commands.`;
        
        chrome.tabs.sendMessage(tab.id, {
            type: 'EXECUTE_workflow',
            actions: actions
        }, (response) => {
            if (chrome.runtime.lastError) {
                statusEl.textContent = "Error: Could not connect to page. Reload the target page.";
                statusEl.style.color = "red";
            } else {
                statusEl.textContent = "Automation started! Switch to the tab to watch.";
                statusEl.style.color = "green";
            }
        });

    } catch (error) {
        statusEl.textContent = "Error: " + error.message;
        statusEl.style.color = "red";
    }
}

function findTargetTab(url) {
    return new Promise((resolve) => {
        // Parse hostname to find matching tabs loosely
        let targetHost;
        try { targetHost = new URL(url).hostname; } catch(e) { targetHost = url; }

        chrome.tabs.query({}, (tabs) => {
            // Try to find a tab with the same domain
            const found = tabs.find(t => t.url && t.url.includes(targetHost));
            
            if (found) {
                chrome.tabs.update(found.id, { active: true });
                resolve(found);
            } else {
                // If not found, create it
                chrome.tabs.create({ url: url }, (newTab) => {
                    // Wait a moment for it to load (basic handling)
                    setTimeout(() => resolve(newTab), 3000);
                });
            }
        });
    });
}

// ---------- INIT ----------
async function start() {
    if (!chrome.runtime.id) return;
    try {
        const events = await loadEvents();
        const workflows = groupWorkflows(events);
        renderWorkflowList(workflows);
    } catch (err) {
        console.error("Start failed:", err);
    }
}

if (chrome.runtime.id) {
    start();
}
