import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import dotenv from "dotenv";

import { askOllama, getActiveModelInfo } from "./agent/ollama.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ENV_PATH = path.resolve(__dirname, "../.env");

dotenv.config({ path: BACKEND_ENV_PATH, override: true });

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", async (req, res) => {
    const modelInfo = await getActiveModelInfo();
    res.json({
        name: "STRANGE Agent",
        status: "running",
        ollama: modelInfo
    });
});

app.post("/chat", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== "string") {
            return res.status(400).json({
                success: false,
                error: "Message must be a string"
            });
        }

        const result = await askOllama(message);

        res.json(result);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, async () => {
    const modelInfo = await getActiveModelInfo();
    const mainMeta = [modelInfo.parameter_size, modelInfo.quantization_level].filter(Boolean).join(", ");
    const visionMeta = [modelInfo.vision_parameter_size, modelInfo.vision_quantization_level].filter(Boolean).join(", ");
    console.log("==================================");
    console.log("       S.T.R.A.N.G.E. BACKEND");
    console.log("==================================");
    console.log(`Server Port  : ${PORT}`);
    console.log(`Ollama Model : ${modelInfo.model}${mainMeta ? ` (${mainMeta})` : ""}`);
    console.log(`Vision Model : ${modelInfo.vision_model}${visionMeta ? ` (${visionMeta})` : ""}`);
    console.log(`Ollama Host  : ${modelInfo.host}`);
    console.log("----------------------------------");
});
