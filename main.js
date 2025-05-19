// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
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
            const transaction = {
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
            // Enabling Node integration for simplicity.
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    win.loadFile('index.html');
}

app.whenReady().then(async () => {
    await catchupAllowances();
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Handle ad hoc transaction requests from the renderer.
ipcMain.on("add-custom-transaction", (event, transaction) => {
  // If a date was provided, use it; otherwise default to current date.
  if (transaction.date) {
    let userDate = new Date(transaction.date);
    if (isNaN(userDate.getTime())) {
      userDate = new Date();
    }
    transaction.date = userDate.toISOString();
  } else {
    transaction.date = new Date().toISOString();
  }

  // Adjust the amount: if type is "Expense", record the amount as negative.
  if (transaction.type === "Expense" && transaction.amount > 0) {
    transaction.amount = -Math.abs(transaction.amount);
  } 
  if(transaction.type === "Income" && transaction.amount < 0) {
    transaction.amount = Math.abs(transaction.amount);
  }

  // Add the transaction and respond.
  addTransaction(transaction)
    .then(() => {
      event.reply("transaction-added", "Transaction successfully added!");
    })
    .catch((err) => {
      event.reply("transaction-added", "Error adding transaction: " + err);
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
