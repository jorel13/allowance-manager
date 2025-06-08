// transactionManager.js
const fs = require("fs");
const path = require("path");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

function getCsvWriter(csvFilePath) {
    const fileExists = fs.existsSync(csvFilePath);
    
    // If file doesn't exist, create directory if needed
    if (!fileExists) {
        const dir = path.dirname(csvFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    
    return createCsvWriter({
        path: csvFilePath,
        header: [
            { id: "id", title: "ID" },
            { id: "date", title: "Date" },
            { id: "child", title: "Child" },
            { id: "type", title: "Type" },
            { id: "amount", title: "Amount" },
            { id: "note", title: "Note" }
        ],
        append: fileExists // If the file exists, append to it.
    });
}

function addTransaction(transaction, csvFilePath) {
    const writer = getCsvWriter(csvFilePath);
    return writer.writeRecords([transaction]);
}

module.exports = { addTransaction };
