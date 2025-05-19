// renderer.js
const { ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

// Load config and determine the CSV file path.
const config = require("./config.json");
const csvFilePath = path.join(__dirname, "transactions.csv");

// Dynamically populate the child dropdown based on config.json.
const childDropdown = document.getElementById("child");
childDropdown.innerHTML = ""; // Clear any static options.
config.children.forEach((child) => {
  const option = document.createElement("option");
  option.value = child.name;
  option.text = child.name;
  childDropdown.appendChild(option);
});

// Set the default value of the date input to today.
const dateInput = document.getElementById("transaction-date");
const todayStr = new Date().toISOString().substring(0, 10);
dateInput.value = todayStr;

/**
 * Loads and renders the transaction history for a given child.
 * The CSV is read, the lines are parsed into objects, sorted by date,
 * and then rendered into an HTML table. A running total balance is computed.
 */
function loadTransactionHistory(childName) {
  if (!fs.existsSync(csvFilePath)) {
    document.getElementById("transaction-history").innerHTML =
      "<p>No transactions found.</p>";
    return;
  }

  fs.readFile(csvFilePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading transaction history:", err);
      return;
    }

    // Split CSV into non-empty lines.
    const lines = data.split("\n").filter((line) => line.trim() !== "");
    if (lines.length <= 1) {
      document.getElementById("transaction-history").innerHTML =
        "<p>No transactions found.</p>";
      return;
    }

    // First line contains headers.
    const headers = lines[0].split(",").map((h) => h.trim());

    const transactions = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length < headers.length) continue;
      const tx = {};
      headers.forEach((header, index) => {
        tx[header] = cols[index].trim();
      });
      if (tx["Child"] === childName) {
        tx.dateObj = new Date(tx["Date"]);
        tx.Amount = parseFloat(tx["Amount"]);
        transactions.push(tx);
      }
    }

    // Sort transactions by date ascending.
    transactions.sort((a, b) => a.dateObj - b.dateObj);

    // Build HTML table & compute running balance.
    let html =
      "<table border='1' cellspacing='0' cellpadding='4'><thead><tr>";
    headers.forEach((col) => {
      html += `<th>${col}</th>`;
    });
    html += "</tr></thead><tbody>";

    let total = 0;
    transactions.forEach((tx) => {
      total += tx.Amount;
      html += "<tr>";
      headers.forEach((col) => {
        html += `<td>${tx[col]}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody></table>";

    // Append current balance.
    html += `<p><strong>Current Balance:</strong> ${total.toFixed(2)}</p>`;

    document.getElementById("transaction-history").innerHTML = html;
  });
}

/**
 * Calculates the current tithing for the selected child.
 * Tithing = 10% of the sum of all income (positive amounts)
 * after the most recent transaction that had a note containing "tithing".
 * If no such transaction exists, all positive income is included.
 */
function calculateTithing(childName) {
  if (!fs.existsSync(csvFilePath)) {
    document.getElementById("tithing-result").innerHTML =
      "<p>No transactions available.</p>";
    return;
  }

  fs.readFile(csvFilePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading transactions for tithing calculation:", err);
      return;
    }

    const lines = data.split("\n").filter((line) => line.trim() !== "");
    if (lines.length <= 1) {
      document.getElementById("tithing-result").innerHTML =
        "<p>No transactions found.</p>";
      return;
    }

    // Parse CSV header.
    const headers = lines[0].split(",").map((h) => h.trim());
    const childIndex = headers.indexOf("Child");
    const dateIndex = headers.indexOf("Date");
    const amountIndex = headers.indexOf("Amount");
    const noteIndex = headers.indexOf("Note");

    const transactions = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length < headers.length) continue;
      if (cols[childIndex].trim() === childName) {
        const tx = {
          dateObj: new Date(cols[dateIndex].trim()),
          amount: parseFloat(cols[amountIndex].trim()),
          note: cols[noteIndex].trim().toLowerCase() // For case-insensitive search
        };
        transactions.push(tx);
      }
    }

    // Sort transactions by date ascending.
    transactions.sort((a, b) => a.dateObj - b.dateObj);

    // Find the cutoff date: the most recent transaction whose note includes "tithing".
    let cutoffDate = new Date(0); // default: beginning of time
    transactions.forEach((tx) => {
      if (tx.note.includes("tithing")) {
        cutoffDate = tx.dateObj;
      }
    });

    // Sum all positive amounts (income) after the cutoff date.
    let incomeSum = 0;
    transactions.forEach((tx) => {
      if (tx.dateObj > cutoffDate && tx.amount > 0) {
        incomeSum += tx.amount;
      }
    });

    const tithingAmount = incomeSum * 0.1;
    document.getElementById("tithing-result").innerHTML = `<p>Based on income of ${incomeSum.toFixed(
      2
    )} since the last tithing transaction, tithing should be <strong>${tithingAmount.toFixed(
      2
    )}</strong>.</p>`;
  });
}

// Event listeners

childDropdown.addEventListener("change", (e) => {
  loadTransactionHistory(e.target.value);
  // Clear any previous tithing calculation.
  document.getElementById("tithing-result").innerHTML = "";
});

// Load transaction history initially for the first child.
if (childDropdown.value) {
  loadTransactionHistory(childDropdown.value);
}

// Handle form submission for ad hoc transactions.
document.getElementById("transaction-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const child = document.getElementById("child").value;
  const type = document.getElementById("type").value;
  const transactionDate = document.getElementById("transaction-date").value;
  const amount = parseFloat(document.getElementById("amount").value);
  const note = document.getElementById("note").value;

  // Send the custom transaction to the main process.
  ipcRenderer.send("add-custom-transaction", {
    child,
    type,
    amount,
    note,
    date: transactionDate,
  });
});

// Listen for acknowledgment from the main process after a transaction is added.
ipcRenderer.on("transaction-added", (event, message) => {
  document.getElementById("message").innerText = message;
  // Refresh the transaction history (for the current child)
  loadTransactionHistory(document.getElementById("child").value);
});

// Handle tithing calculation when the button is clicked.
document
  .getElementById("calculate-tithing-button")
  .addEventListener("click", () => {
    const child = childDropdown.value;
    calculateTithing(child);
  });
