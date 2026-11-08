
import readline from "node:readline";

const API_URL = "http://localhost:3000/chat";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "S.T.R.A.N.G.E> ",
});

async function sendMessage(message) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ message }),
        });

        if (!response.ok) {
            console.log(`\n[ERROR] HTTP ${response.status}\n`);
            return;
        }

        const data = await response.json();

        console.log("\n" + (
            data.response ??
            data.message ??
            JSON.stringify(data, null, 2)
        ));

        if (data.tool_calls?.length) {
            console.log("\n[TOOLS]");
            for (const tool of data.tool_calls) {
                console.log(`- ${tool.name}`);
            }
        }

        console.log();
    } catch (error) {
        console.log("\n[ERROR] Could not connect to S.T.R.A.N.G.E.");
        console.log("Make sure the backend server is running.");
        console.log(error.message);
        console.log();
    }
}

console.log("==================================");
console.log("       S.T.R.A.N.G.E. TERMINAL");
console.log("==================================");
console.log("Type a command or question.");
console.log("Type 'exit' to quit.\n");

rl.prompt();

rl.on("line", async (input) => {
    const message = input.trim();

    if (!message) {
        rl.prompt();
        return;
    }

    if (message.toLowerCase() === "exit") {
        rl.close();
        return;
    }

    rl.pause();

    await sendMessage(message);

    rl.resume();
    rl.prompt();
});

rl.on("close", () => {
    console.log("\nS.T.R.A.N.G.E. terminal closed.");
    process.exit(0);
});
