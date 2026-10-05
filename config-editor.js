// config-editor.js
const { ipcRenderer } = require("electron");
const fs = require('fs');

// The main process owns the config location (userData when packaged).
const configPath = ipcRenderer.sendSync("get-config-path");

window.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('configText');
    const messageEl = document.getElementById('message');

    // Load the config file and display its contents.
    fs.readFile(configPath, 'utf8', (err, data) => {
        if (err) {
            messageEl.textContent = "Error loading config: " + err.message;
            return;
        }
        textarea.value = data;
    });

    // When the user clicks "Save", validate the JSON then write it back.
    document.getElementById('saveButton').addEventListener('click', () => {
        const newConfig = textarea.value;
        try {
            JSON.parse(newConfig); // Validate that it's valid JSON.
        } catch (e) {
            messageEl.textContent = "Invalid JSON: " + e.message;
            return;
        }

        fs.writeFile(configPath, newConfig, 'utf8', (err) => {
            if (err) {
                messageEl.textContent = "Error saving config: " + err.message;
            } else {
                messageEl.textContent = "Config saved successfully!";

                // Optionally, you could tell other parts of the app (via IPC) to reload the config.
                ipcRenderer.send("config-update-successful");
            }
        });
    });
});
