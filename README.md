# Allowance Manager

A small Windows desktop app (Electron) for tracking kids' allowance.

## Features

- **Automatic weekly allowance** – every Friday each child earns half their age in dollars (e.g. $5 at age 10). Missed Fridays are filled in the next time the app opens.
- **Income and expenses** – record other money in and out, with a date and note.
- **Transaction history** – filter by type, sort by date or amount, load earlier years, and delete entries. The current balance always covers all transactions.
- **Tithing calculator** – 10% of income received since the last transaction whose note mentions "tithing". Can be turned off in the config.
- **In-app config editor** – add or change children from **File → Edit Config**.

## Install

1. Download `Allowance.Manager.Setup.x.y.z.exe` from the [latest release](https://github.com/jorel13/allowance-manager/releases/latest).
2. Run the installer.

### Windows SmartScreen warning

The installer isn't code-signed, so the first time you run it Windows may show **"Windows protected your PC"**. To continue, click **More info**, then **Run anyway**.

Only do this with an installer downloaded from this repo's [Releases](https://github.com/jorel13/allowance-manager/releases) page.

## Configuration

On first run the app creates its config from [`config.example.json`](config.example.json). Edit it from **File → Edit Config**:

```json
{
    "children": [
        {
            "name": "Alex",
            "birthdate": "2015-04-01",
            "allowanceStartDate": "2025-01-03"
        }
    ],
    "tithing": true
}
```

| Field | Description |
|---|---|
| `name` | Child's name, shown in the dropdown. |
| `birthdate` | Used to work out their age, and so their allowance. |
| `allowanceStartDate` | Optional. Allowance starts on the first Friday on or after this date. Defaults to the birthdate. |
| `tithing` | `true` to show the tithing calculator. |

## Where your data is stored

The installed app keeps everything in `%APPDATA%\allowance-manager\`:

- `config.json` – your children and settings
- `transactions.csv` – all transactions

Upgrading or reinstalling doesn't touch these files. Back them up if you want to keep a copy.

## Development

Requires [Node.js](https://nodejs.org/).

```bash
npm install
npm start           # run from source (config.json and transactions.csv are created in the project folder)
npm run build:win   # build the Windows installer into dist/
```

`config.json` and `transactions.csv` are gitignored and excluded from builds, so your own data never ends up in the repo or the installer.

## License

[MIT](LICENSE)
