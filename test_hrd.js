import { getHrdReport } from "./SRC/HRD.js";

async function run() {
  try {
    const report = await getHrdReport();
    console.log("Success! Report size:", report.length);
    console.log(report.slice(0, 2));
  } catch (error) {
    console.error("Error running getHrdReport:", error);
  }
  process.exit(0);
}

run();
