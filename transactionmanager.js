// transactionManager.js
const fs = require("fs");
const path = require("path");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const csvFilePath = path.join(__dirname, "transactions.csv");

function getCsvWriter() {
    const fileExists = fs.existsSync(csvFilePath);
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

function addTransaction(transaction) {
    const writer = getCsvWriter();
    return writer.writeRecords([transaction]);
}

module.exports = { addTransaction, csvFilePath };
