import "dotenv/config";

import express from "express";
import dotenv from "dotenv";

import { askOllama, getActiveModelInfo } from "./agent/ollama.js";

dotenv.config();

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
    console.log(`S.T.R.A.N.G.E backend running on port ${PORT}`);
    console.log(`[STRANGE] Active local Ollama model: ${modelInfo.model}${modelInfo.parameter_size ? ` (${modelInfo.parameter_size})` : ""}`);
});
