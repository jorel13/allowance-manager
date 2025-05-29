// main.js
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const defaultMenu = require('electron-default-menu');  // Import the default menu helper
const path = require('path');
const fs = require('fs');
const { addTransaction, csvFilePath } = require('./transactionmanager');

// Load children configuration
const config = require('./config.json');

/* ------------------ Helper Functions ------------------ */

// Get the date of the last recorded "Weekly Allowance" transaction for a specific child.
function getLastWeeklyAllowance(childName) {

    if (!fs.existsSync(csvFilePath)) {
        return null;
    }
    const data = fs.readFileSync(csvFilePath, 'utf8');
    const lines = data.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return null; // Only a header exists.

    const header = lines[0].split(',');
    const idIndex = header.indexOf("ID");
    const dateIndex = header.indexOf("Date");
    const childIndex = header.indexOf("Child");
    const typeIndex = header.indexOf("Type");
    let lastDate = null;

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');

        if (cols[typeIndex].trim() === "Weekly Allowance" && cols[childIndex].trim() === childName) {
            const dt = new Date(cols[dateIndex].trim());
            if (!lastDate || dt > lastDate) {
                lastDate = dt;
            }
        }
    }
    return lastDate;
}

// Computes a child's age on a given reference date.
function getAge(birthDate, referenceDate) {
    let age = referenceDate.getFullYear() - birthDate.getFullYear();
    const m = referenceDate.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && referenceDate.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

// Given a date, return the next Friday after it.
// (Even if the passed-in date is already a Friday, this returns a Friday 7 days later.)
function getNextFriday(fromDate) {
    const next = new Date(fromDate);
    next.setHours(0, 0, 0, 0);
    let day = next.getDay();
    let offset = (5 - day + 7) % 7;
    if (offset === 0) offset = 7;
    next.setDate(next.getDate() + offset);
    return next;
}

// Returns the first Friday on or after a given date.
function getFirstFriday(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (d.getDay() === 5) {
        return d;
    } else {
        let offset = (5 - d.getDay() + 7) % 7;
        if (offset === 0) offset = 7;
        d.setDate(d.getDate() + offset);
        return d;
    }
}

// Returns the most recent Friday (at midnight) that is on or before the reference date.
function getLastFriday(referenceDate) {
    const lastFriday = new Date(referenceDate);
    const day = lastFriday.getDay();
    const diff = day >= 5 ? day - 5 : day + 2; // e.g. if today is Saturday (6), diff = 1.
    lastFriday.setDate(lastFriday.getDate() - diff);
    return lastFriday;
}

/* ------------------ Catch-up Allowances Function ------------------ */

// When the app starts, check each child’s record and add any missing weekly allowance transactions.
async function catchupAllowances() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastFriday = getLastFriday(today);

    // Process each child from the config.
    for (let child of config.children) {
        const childName = child.name;
        const birthdate = new Date(child.birthdate);

        // Use a configured allowanceStartDate if provided (otherwise default to birthdate).
        const allowanceStart = child.allowanceStartDate ? new Date(child.allowanceStartDate) : birthdate;

        // Find the last recorded allowance transaction for this child.
        let lastProcessed = getLastWeeklyAllowance(childName);
        let nextFriday;
        if (lastProcessed) {
            nextFriday = getNextFriday(lastProcessed);
        } else {
            nextFriday = getFirstFriday(allowanceStart);
        }

        // For every Friday that has passed (up to and including the most recent Friday), add a transaction.
        while (nextFriday <= lastFriday) {
            const age = getAge(birthdate, nextFriday);
            const allowance = age / 2; // Weekly allowance = (age ÷ 2).

            // Updated: recoded as Income (with a note indicating that it’s an allowance)
            const transaction = {
                id: crypto.randomUUID(),
                date: nextFriday.toISOString(),
                child: childName,
                type: 'Weekly Allowance',
                amount: allowance,
                note: `Allowance for ${childName} (age ${age})`
            };
            try {
                await addTransaction(transaction);
                console.log(`Added allowance for ${childName} on ${nextFriday.toISOString()}`);
            } catch (err) {
                console.error(`Error adding allowance for ${childName} on ${nextFriday.toISOString()}:`, err);
            }
            // Move to the next Friday.
            nextFriday.setDate(nextFriday.getDate() + 7);
        }
    }
}

/* ------------------ Electron App Setup ------------------ */

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            // For simplicity in this example, enable Node integration.
            nodeIntegration: true,
            contextIsolation: false
        },
        // For Windows (and Linux), the icon property will be used.
        icon: path.join(__dirname, 'build', 'icon.ico')
    });
    win.loadFile("index.html");
}

// --- Create a Config Editor Window ---
function createConfigEditorWindow() {
    const editorWindow = new BrowserWindow({
        width: 600,
        height: 400,
        title: 'Edit Config',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    editorWindow.loadFile('config-editor.html');
}



app.whenReady().then(async () => {
    // --- Build an application menu with an "Edit Config" option ---
    const fileMenuTemplate = {
        label: 'File',
        submenu: [
            {
                label: 'Edit Config',
                click() {
                    createConfigEditorWindow();
                }
            },
            { role: 'quit' }
        ]
    };

    // Get the default menu template for the current platform.
    const menuTemplate = defaultMenu(app, BrowserWindow);
    menuTemplate.splice(0, 0, fileMenuTemplate);

    // Set the application menu using the modified template.
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

    await catchupAllowances();
    createWindow();

    app.on("activate", function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Handle ad hoc transaction requests from the renderer.
ipcMain.on("add-custom-transaction", (event, transaction) => {
    // Use the provided date if available.
    if (transaction.date) {
        let userDate = new Date(transaction.date);
        if (isNaN(userDate.getTime())) {
            userDate = new Date();
        }
        transaction.date = userDate.toISOString();
    } else {
        transaction.date = new Date().toISOString();
    }

    // Enforce amount sign based on transaction type.
    // For Expense, the amount is negative;
    // for Income, the amount is kept positive.
    if (transaction.type === "Expense" && transaction.amount > 0) {
        transaction.amount = -Math.abs(transaction.amount);
    } else if (transaction.type === "Income" && transaction.amount < 0) {
        transaction.amount = Math.abs(transaction.amount);
    }

    addTransaction(transaction)
        .then(() => {
            event.reply("transaction-added", "Transaction successfully added!");
        })
        .catch((err) => {
            event.reply("transaction-added", "Error adding transaction: " + err);
        });
});

// Handle transaction deletion requests from the renderer.
ipcMain.on("delete-transaction", (event, transactionId) => {
    if (!fs.existsSync(csvFilePath)) {
        event.reply("transaction-deleted", "No transactions file found.");
        return;
    }
    fs.readFile(csvFilePath, "utf8", (err, data) => {
        if (err) {
            event.reply("transaction-deleted", "Error reading transactions: " + err);
            return;
        }
        const lines = data.split("\n");
        const header = lines[0];
        const filtered = lines.filter((line, idx) => {
            if (idx === 0) return true; // keep header
            if (!line.trim()) return false;
            const cols = line.split(",");
            return cols[0] !== transactionId;
        });
        fs.writeFile(csvFilePath, filtered.join("\n"), "utf8", (err) => {
            if (err) {
                event.reply("transaction-deleted", "Error deleting transaction: " + err);
            } else {
                event.reply("transaction-deleted", "Transaction deleted successfully.");
            }
        });
    });
});

// Handle config updates by clearing the cache and reloading the config file
ipcMain.on("config-update-successful", (event) => {
    delete require.cache[require.resolve('./config.json')];
    const config = require('./config.json');
});

app.on("window-all-closed", function () {
    if (process.platform !== "darwin") app.quit();
});