import "dotenv/config";

import express from "express";
import dotenv from "dotenv";

import { askOllama } from "./agent/ollama.js";

dotenv.config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.json({
        name: "STRANGE Agent",
        status: "running"
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

app.listen(PORT, () => {
    console.log(`S.T.R.A.N.G.E backend running on port ${PORT}`);
});
