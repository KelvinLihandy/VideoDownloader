import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import readline from "readline";
import axios from "axios";

const folder = path.join(process.cwd(), "satria_videos");
if (!fs.existsSync(folder)) fs.mkdirSync(folder);
const trainDir = path.join(folder, "train");
if (!fs.existsSync(trainDir)) fs.mkdirSync(trainDir, { recursive: true });
const testDir = path.join(folder, "test");
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

const driveExtract = (url) => {
    const regex = /(?:\/d\/|id=)([a-zA-Z0-9_-]{10,})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

const missingFile = (emotion, seq, subdirectory, url) => {
    let missingName = emotion ? `${seq}_${emotion}.txt` : `${seq}.txt`;
    fs.writeFile(path.join(folder, subdirectory, missingName), url, (err) => {
        if (err) {
            console.error("Error creating file:", err);
        } else {
            console.log(`File "${missingName}" for missing or failed scenario`);
        }
    });
}

async function downloadVideo(url, emotion, seq, subdirectory) {
    const fileId = driveExtract(url);
    const fileName = emotion ? `${seq}_${emotion}.mp4` : `${seq}.mp4`;
    const filePath = path.join(folder, subdirectory, fileName);
    if (fs.existsSync(filePath) || fs.existsSync(path.join(folder, subdirectory, (emotion ? `${seq}_${emotion}.txt` : `${seq}.txt`)))) {
        console.log(`⚠️ File already exists, skipping: ${fileName}`);
        return;
    }
    if(url.startsWith("https://www.instagram.com/")){
        const params = new URLSearchParams();
        params.append("k_exp", "1754363578");
        params.append("k_token", "6112d6c105dd331fc1b8ae5448ebf1e17cfca56adcfd1208bb6304c03b5f7f7c");
        params.append("q", url);
        params.append("t", "media");
        params.append("lang", "en");
        params.append("v", "v2");
      
        const res = await fetch("https://savegram.app/api/ajaxSearch", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: params.toString()
        });
      
        const data = await res.json();
      
        if (!data || !data.data) {
          console.error("❌ Invalid response", data);
          return;
        }
      
        const html = data.data;
        const match = html.match(
          /<div class="download-items__btn".*?<a href="(https:\/\/dl\.snapcdn\.app\/get\?token=[^"]+)"/s
        );
      
        if (!match) {
          console.error("❌ No video link found in response");
          missingFile(emotion, seq, subdirectory, url);
          return;
        }
      
        const videoUrl = match[1];
        console.log(`✅ Video ${seq} found`);
      
        const videoRes = await fetch(videoUrl);
        const total = videoRes.headers.get("content-length");
        let downloaded = 0;

        const fileStream = fs.createWriteStream(filePath);

        videoRes.body.on("data", (chunk) => {
            downloaded += chunk.length;
            if (total) {
                const percent = ((downloaded / total) * 100).toFixed(2);
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
                process.stdout.write(`Downloading ${fileName}: ${percent}%`);
            }
        });

        await new Promise((resolve, reject) => {
            videoRes.body.pipe(fileStream);
            videoRes.body.on("error", reject);
            fileStream.on("finish", resolve);
        });

        console.log(`\nSaved: ${fileName}`);
    }
    else if(fileId){
        const response = await axios({
            url,
            method: "GET",
            responseType: "stream",
            maxRedirects: 5,
        });

        const total = response.headers["content-length"];
        let downloaded = 0;

        
        const writer = fs.createWriteStream(filePath);

        response.data.on("data", (chunk) => {
            downloaded += chunk.length;
            if (total) {
                const percent = ((downloaded / total) * 100).toFixed(2);
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
                process.stdout.write(`Downloading ${fileName}: ${percent}%`);
            }
        });

        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on("finish", () => {
                console.log(`\n✅ Saved: ${fileName}`);
                resolve();
            });
            writer.on("error", reject);
        });
    }
    else missingFile(emotion, seq, subdirectory, url);
}

(async () => {
    var links = [];
    var emotions = [];
    const trainCsv = "datatrain.csv"
    const trainData = fs.readFileSync(trainCsv, "utf-8");
    const trainRows = trainData.split("\n").map(row => row.trim());
    for (let i = 1; i < trainRows.length; i++) {
        const columns = trainRows[i].split(",");
        if (columns.length > 1) {
            links.push(columns[1] ? columns[1].trim() : "error");
            emotions.push(columns[2] ? columns[2].trim() : "error");
        }
    }

    for (let i = 0; i < links.length; i++) {
        await downloadVideo(links[i], emotions[i], i + 1, "train");
    }

    links = [];
    emotions = [];
    const testCsv = "datatest.csv"
    const testData = fs.readFileSync(testCsv, "utf-8");
    const testRows = testData.split("\n").map(row => row.trim());
    for (let i = 1; i < testRows.length; i++) {
        const columns = testRows[i].split(",");
        if (columns.length > 1) {
            links.push(columns[1] ? columns[1].trim() : "error");
        }
    }

    for (let i = 0; i < links.length; i++) {
        await downloadVideo(links[i], null, i + 1, "test");
    }
})();