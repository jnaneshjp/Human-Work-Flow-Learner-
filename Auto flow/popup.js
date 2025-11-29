// Update the HTML inside loadSavedWorkflows()
// ... existing code ...

        workflows.forEach((wf, index) => {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = `
                <strong>${wf.domain}</strong> 
                <span style="font-size:0.8em; color:#666;">(${wf.actions.length} steps)</span><br>
                <small>Path: ${wf.path}</small>
                <button class="btn-run" data-id="${index}">Run Automation</button>
            `;
            list.appendChild(div);
        });

// ... existing code ..