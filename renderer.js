// renderer.js
const { ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

// Global variable to store the ID of the most recently added transaction.
let lastAddedTransactionID = null;

// Load config and initialize CSV file path
const configPath = ipcRenderer.sendSync("get-config-path");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
let csvFilePath = path.join(__dirname, "transactions.csv");

// Listen for the CSV file path from the main process
ipcRenderer.on('csv-file-path', (event, path) => {
    csvFilePath = path;
    if (childDropdown.value) {
        loadTransactionHistory(childDropdown.value);
    }
});

// Dynamically populate the child dropdown based on config.json.
const childDropdown = document.getElementById("child");
childDropdown.innerHTML = "";
config.children.forEach((child) => {
    const option = document.createElement("option");
    option.value = child.name;
    option.text = child.name;
    childDropdown.appendChild(option);
});

// Set default value of the date input to today.
const dateInput = document.getElementById("transaction-date");
const todayStr = new Date().toISOString().substring(0, 10);
dateInput.value = todayStr;

// Helper function: format a number as US Dollars.
function formatCurrency(amount) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
    }).format(amount);
}

/**
 * Loads and renders the transaction history for a given child.
 * This reads the CSV file, applies filtering/sorting based on the controls,
 * and highlights the newest transaction if applicable.
 */
let displayedYears = [];
function loadTransactionHistory(childName, appendYear = false) {
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

        const lines = data.split("\n").filter((line) => line.trim() !== "");
        if (lines.length <= 1) {
            document.getElementById("transaction-history").innerHTML =
                "<p>No transactions found.</p>";
            return;
        }

        // Parse header from CSV.
        const headers = lines[0].split(",").map((h) => h.trim());
        let transactions = [];

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

        // Apply filter by type if needed.
        const filterType = document.getElementById("filter-type").value;
        if (filterType !== "all") {
            transactions = transactions.filter((tx) => tx["Type"] === filterType);
        }

        // Apply sorting. Default to date-desc if not set.
        let sortBy = document.getElementById("sort-by").value;
        if (!sortBy) sortBy = "date-desc";
        if (sortBy === "date-asc") {
            transactions.sort((a, b) => a.dateObj - b.dateObj);
        } else if (sortBy === "date-desc") {
            transactions.sort((a, b) => b.dateObj - a.dateObj);
        } else if (sortBy === "amount-asc") {
            transactions.sort((a, b) => a.Amount - b.Amount);
        } else if (sortBy === "amount-desc") {
            transactions.sort((a, b) => b.Amount - a.Amount);
        }

        // Pagination by calendar year
        if (!appendYear) {
            // Reset displayed years if not appending
            displayedYears = [];
        }
        // Find all years present in the transactions
        const years = [...new Set(transactions.map(tx => tx.dateObj.getFullYear()))].sort((a, b) => b - a);
        // Determine which year to show next
        let nextYear;
        if (displayedYears.length === 0) {
            nextYear = years[0];
        } else {
            // Find the next earlier year not yet shown
            nextYear = years.find(y => !displayedYears.includes(y));
        }
        if (nextYear === undefined) {
            // No more years to show
            return;
        }
        displayedYears.push(nextYear);
        // Filter transactions to only those in displayedYears
        const pagedTransactions = transactions.filter(tx => displayedYears.includes(tx.dateObj.getFullYear()));

        // Build the HTML table.
        let html = `<table border='1' cellspacing='0' cellpadding='4'><thead><tr>`;
        headers.forEach((col) => {
            if (col === "ID") return;
            html += `<th>${col}</th>`;
        });
        html += "<th>Action</th></tr></thead><tbody>";

        // Balance covers every transaction, not just the years currently shown.
        const total = transactions.reduce((sum, tx) => sum + tx.Amount, 0);
        pagedTransactions.forEach((tx) => {
            const rowClass = tx["ID"] === lastAddedTransactionID ? "highlight" : "";
            html += `<tr class="${rowClass}">`;
            headers.forEach((col) => {
                if (col === "ID") return;
                let cellValue = tx[col];
                if (col === "Amount") {
                    cellValue = formatCurrency(tx.Amount);
                }
                if (col === "Date") {
                    cellValue = tx.Date.split("T")[0];
                }
                html += `<td>${cellValue}</td>`;
            });
            // Add delete button with data-id attribute
            html += `<td><button class='delete-btn' data-id='${tx["ID"]}'>Delete</button></td>`;
            html += "</tr>";
        });
        html += "</tbody></table>";

        // Append current balance.
        let final = `<p><strong>Current Balance:</strong> ${formatCurrency(total)}</p>` + html;

        // Add Load More button if there are more years
        if (displayedYears.length < years.length) {
            final += `<button id="load-more-years">Load More</button>`;
        }

        document.getElementById("transaction-history").innerHTML = final;

        // Add event listeners for delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                if (confirm('Are you sure you want to delete this transaction?')) {
                    ipcRenderer.send('delete-transaction', id);
                }
            });
        });

        // Add event listener for Load More button
        const loadMoreBtn = document.getElementById("load-more-years");
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', function() {
                loadTransactionHistory(childName, true);
            });
        }
    });
}

/**
 * Calculates the current tithing for a child.
 * Tithing = 10% of the total positive income after the last transaction
 * (by date) with a note containing "tithing".
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
                    note: cols[noteIndex].trim().toLowerCase()
                };
                transactions.push(tx);
            }
        }

        transactions.sort((a, b) => a.dateObj - b.dateObj);

        let cutoffDate = new Date(0);
        transactions.forEach((tx) => {
            if (tx.note.includes("tithing")) {
                cutoffDate = tx.dateObj;
            }
        });

        let incomeSum = 0;
        transactions.forEach((tx) => {
            if (tx.dateObj > cutoffDate && tx.amount > 0) {
                incomeSum += tx.amount;
            }
        });

        const tithingAmount = incomeSum * 0.1;
        document.getElementById("tithing-result").innerHTML = `<p>Based on income of ${formatCurrency(
            incomeSum
        )} since the last tithing transaction, tithing should be <strong>${formatCurrency(
            tithingAmount
        )}</strong>.</p>`;
    });
}

// Event listeners


childDropdown.addEventListener("change", (e) => {
    loadTransactionHistory(e.target.value);
    document.getElementById("tithing-result").innerHTML = "";
});


document
    .getElementById("apply-filters-button")
    .addEventListener("click", () => {
        loadTransactionHistory(childDropdown.value);
    });


if (childDropdown.value) {
    loadTransactionHistory(childDropdown.value);
}

document.getElementById("transaction-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const child = document.getElementById("child").value;
    const type = document.getElementById("type").value;
    const transactionDate = document.getElementById("transaction-date").value;
    const amount = parseFloat(document.getElementById("amount").value);
    const note = document.getElementById("note").value;

    const uniqueId = crypto.randomUUID();
    lastAddedTransactionID = uniqueId;

    ipcRenderer.send("add-custom-transaction", {
        id: uniqueId,
        child,
        type,
        amount,
        note,
        date: transactionDate
    });
});

ipcRenderer.on("transaction-added", (event, message) => {
    document.getElementById("message").innerText = message;
    loadTransactionHistory(document.getElementById("child").value);
});

// Listen for transaction-deleted event from main process
ipcRenderer.on("transaction-deleted", (event, message) => {
    document.getElementById("message").innerText = message;
    loadTransactionHistory(document.getElementById("child").value);
});

// Hide / Show Tithing based on config
if (!config.tithing) {
    document.getElementById("tithing-container").innerHTML = "";
} else {
    document
        .getElementById("calculate-tithing-button")
        .addEventListener("click", () => {
            calculateTithing(childDropdown.value);
        });
}