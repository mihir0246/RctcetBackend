// EventsDrive.js
import { authenticateSheets } from "./auth.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const spreadsheetId = process.env.SPREADSHEET_ID;
const sheetName = "EventsDrive!A:C"; // 3 columns

// ---------- READ ----------
async function readEventsDrive() {
    const query = `select A,B,C`; // Date, Event name, Drive link
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=EventsDrive&tq=${encodeURIComponent(
        query
    )}`;

    try {
        const response = await axios.get(url);
        const data = JSON.parse(response.data.substr(47).slice(0, -2));

        if (!data.table.rows.length) {
            console.log("No rows found.");
            return [];
        }

        const rows = data.table.rows.map((row) => ({
            date: row.c[0]?.v || "",
            eventName: row.c[1]?.v || "",
            driveLink: row.c[2]?.v || "",
        }));

        return rows;
    } catch (error) {
        console.error("Error reading EventsDrive data:", error.message);
        return [];
    }
}

export { readEventsDrive };