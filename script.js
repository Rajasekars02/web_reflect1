// Configuration
const TOTAL_WORKERS_ESTIMATE = 50; // Set this to your actual total worker count
const CSV_FILE = 'LoginInfo.csv';
const REFRESH_INTERVAL = 30000; // 30 seconds

// DOM Elements
const elements = {
    currentDate: document.getElementById('currentDate'),
    countToday: document.getElementById('countToday'),
    countTrend: document.getElementById('countTrend'),
    lastWorker: document.getElementById('lastWorker'),
    lastTime: document.getElementById('lastTime'),
    hygienePercent: document.getElementById('hygienePercent'),
    hygieneDetail: document.getElementById('hygieneDetail'),
    tableBody: document.getElementById('tableBody'),
    emptyState: document.getElementById('emptyState')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    updateDate();
    fetchData();

    // Auto refresh logic
    setInterval(() => {
        updateDate();
        fetchData();
    }, REFRESH_INTERVAL);
}

function updateDate() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (elements.currentDate) {
        elements.currentDate.textContent = now.toLocaleDateString('en-US', options);
    }
}

async function fetchData() {
    try {
        // Add timestamp to prevent browser caching of the CSV
        const response = await fetch(`${CSV_FILE}?t=${new Date().getTime()}`);

        if (!response.ok) {
            throw new Error("File not found or server data unavailable");
        }

        const text = await response.text();
        processCSV(text);

        // Hide empty state if successful
        if (elements.emptyState) elements.emptyState.style.display = 'none';

    } catch (error) {
        console.warn("Data Fetch Warning:", error);
        if (elements.emptyState) {
            elements.emptyState.style.display = 'block';
            elements.emptyState.innerHTML = `<p><strong>Waiting for Data Connection</strong></p><p>Ensure 'LoginInfo.csv' is generated and access via a local server.</p>`;
        }
    }
}

function processCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return; // Only headers or empty file

    const today = new Date().toISOString().slice(0, 10); // Format: YYYY-MM-DD
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Dynamically find column indices
    const nameIdx = headers.findIndex(h => h.includes('name'));
    const timeIdx = headers.findIndex(h => h.includes('timestamp'));

    if (nameIdx === -1 || timeIdx === -1) {
        console.error("CSV Formatting Error: Columns 'Name' or 'Timestamp' missing.");
        return;
    }

    const data = [];
    const uniqueWorkersToday = new Set();
    let rawLastTime = 0;

    // Variables for 'Last Machine Access'
    let lastWorkerName = "None";
    let lastWorkerTime = "No activity yet";

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
        const rowUTC = lines[i];
        if (!rowUTC.trim()) continue;

        const parts = parseCSVLine(rowUTC);
        if (parts.length < 2) continue;

        const name = parts[nameIdx];
        const timestampStr = parts[timeIdx];

        // Clean timestamp for parsing
        const safeTimestamp = timestampStr.replace(' ', 'T');
        const entryDate = new Date(safeTimestamp);

        // Validate date
        if (isNaN(entryDate.getTime())) continue;

        // Check if date matches today (local time comparison)
        // Convert entryDate to YYYY-MM-DD local string
        const entryDateLocal = new Date(entryDate.getTime() - (entryDate.getTimezoneOffset() * 60000))
            .toISOString().split('T')[0];
        const todayLocal = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000))
            .toISOString().split('T')[0];

        // We use the basic definition for now: date string match
        // Or simply string parsing if format is consistent YYYY-MM-DD
        const simpleDatePart = timestampStr.split(' ')[0]; // Fallback to string split

        if (simpleDatePart === today) {
            data.push({
                name: name,
                timestamp: timestampStr,
                date: simpleDatePart,
                isoTime: entryDate.getTime()
            });
            uniqueWorkersToday.add(name);
        }

        // Global Last Access Check (Overall)
        if (entryDate.getTime() > rawLastTime) {
            rawLastTime = entryDate.getTime();
            lastWorkerName = name;
            lastWorkerTime = timestampStr;
        }
    }

    updateDashboardStats(uniqueWorkersToday.size, lastWorkerName, lastWorkerTime);
    updateTable(data);
}

function updateDashboardStats(count, lastWorker, lastTime) {
    // 1. Workers Today
    if (elements.countToday) elements.countToday.textContent = count;

    // 2. Hygiene Percentage
    const percent = Math.min(100, Math.round((count / TOTAL_WORKERS_ESTIMATE) * 100));
    if (elements.hygienePercent) {
        elements.hygienePercent.textContent = `${percent}%`;

        // Color coding classes
        elements.hygienePercent.className = 'stat-value'; // reset
        if (percent >= 80) elements.hygienePercent.classList.add('compliance-high');
        else if (percent >= 50) elements.hygienePercent.classList.add('compliance-med');
        else elements.hygienePercent.classList.add('compliance-low');
    }

    // 3. Last Access
    if (elements.lastWorker) elements.lastWorker.textContent = lastWorker;
    if (elements.lastTime) elements.lastTime.textContent = lastTime;
}

function updateTable(data) {
    if (!elements.tableBody) return;

    elements.tableBody.innerHTML = '';

    // Sort descending by time
    data.sort((a, b) => b.isoTime - a.isoTime);

    if (data.length === 0) {
        if (elements.emptyState) {
            elements.emptyState.style.display = 'block';
            elements.emptyState.textContent = "No hand washing records found for today.";
        }
        return;
    }

    if (elements.emptyState) elements.emptyState.style.display = 'none';

    // Populate rows
    data.forEach(row => {
        const tr = document.createElement('tr');

        // Extract just the time HH:MM:SS
        const timeOnly = row.timestamp.split(' ')[1] || row.timestamp;

        tr.innerHTML = `
            <td><strong>${row.name}</strong></td>
            <td>${timeOnly}</td>
            <td>${row.date}</td>
            <td><span class="status-badge">Completed</span></td>
        `;
        elements.tableBody.appendChild(tr);
    });
}

function parseCSVLine(text) {
    // Robust CSV parsing for standard comma separation
    // Handles simple cases. For complex CSVs with commas in quotes, a regex is better.
    return text.split(',').map(item => item.trim());
}

// User-triggered Export
function exportTableStart() {
    // Check if SheetJS is loaded
    if (typeof XLSX === 'undefined') {
        alert("The Excel export library logic is still loading. Please try again in a moment.");
        return;
    }

    // 1. Get the table element
    const table = document.querySelector("table");

    // 2. Create a workbook from the table
    //    sheet: "Daily Log" gives the worksheet a name
    const wb = XLSX.utils.table_to_book(table, { sheet: "Daily Log" });

    // 3. Generate filename with date
    const today = new Date().toISOString().slice(0, 10);
    const filename = `WellReflect_Hygiene_Log_${today}.xlsx`;

    // 4. Write and trigger download
    XLSX.writeFile(wb, filename);
}
