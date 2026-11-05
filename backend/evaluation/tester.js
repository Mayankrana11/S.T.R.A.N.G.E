
import ollama from "ollama";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";

import { toolSchemas } from "../src/agent/registry.js";

dotenv.config();

const MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";

const DATASET_PATH = path.resolve(
    "evaluation/test-cases.json"
);

const REPORT_DIR = path.resolve(
    "evaluation/reports"
);


const SYSTEM_PROMPT = `
You are STRANGE, a local desktop assistant being evaluated
for tool selection and argument accuracy.

Choose the correct tool and return its exact arguments.

GENERAL RULES:
- Use a tool when the user requests an action.
- Do not invent tool names.
- Use the exact arguments required by the tool.
- Do not execute tools yourself.
- Do not explain the tool call.
- Return the appropriate tool call.

FILESYSTEM PATH RULES:
- Filesystem tools operate inside the sandbox directory automatically.
- The sandbox directory is already the root.
- NEVER include "sandbox/" in a filesystem tool path.
- All filesystem paths must be relative to the sandbox root.

Examples:

User: Read strange_test.txt from the sandbox.
Correct: {"path":"strange_test.txt"}
Incorrect: {"path":"sandbox/strange_test.txt"}

User: Create hello.txt in the sandbox.
Correct: {"path":"hello.txt"}
Incorrect: {"path":"sandbox/hello.txt"}

User: Create a directory named evaluation_test in the sandbox.
Correct: {"path":"evaluation_test"}
Incorrect: {"path":"sandbox/evaluation_test"}

User: List files in the sandbox.
Correct: {"path":"."}

The phrases "in the sandbox", "inside the sandbox",
and "from the sandbox" describe the execution environment.
They are NOT part of the filesystem path.

Before returning a filesystem tool call, ensure its path
does not begin with "sandbox/".
`;


function normalize(value) {
    if (Array.isArray(value)) {
        return value.map(normalize);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map(key => [
                    key,
                    normalize(value[key])
                ])
        );
    }

    return value;
}

function deepEqual(a, b) {
    return JSON.stringify(normalize(a)) ===
           JSON.stringify(normalize(b));
}

async function runTest(testCase) {
    const messages = [
        {
            role: "system",
            content: SYSTEM_PROMPT
        },
        {
            role: "user",
            content: testCase.prompt
        }
    ];

    try {
        const response = await ollama.chat({
            model: MODEL,
            messages,
            tools: toolSchemas,
            stream: false
        });

        const calls = response.message.tool_calls ?? [];

        if (calls.length === 0) {
            return {
                id: testCase.id,
                category: testCase.category,
                prompt: testCase.prompt,
                expected_tool: testCase.expected_tool,
                actual_tool: null,
                expected_arguments: testCase.expected_arguments,
                actual_arguments: null,
                tool_pass: false,
                argument_pass: false,
                passed: false,
                failure: "No tool call returned",
                raw_response: response.message.content
            };
        }

        const call = calls[0];

        const actualTool = call.function.name;

        let actualArguments = call.function.arguments;

        if (typeof actualArguments === "string") {
            try {
                actualArguments = JSON.parse(actualArguments);
            } catch {
                return {
                    id: testCase.id,
                    category: testCase.category,
                    prompt: testCase.prompt,
                    expected_tool: testCase.expected_tool,
                    actual_tool: actualTool,
                    expected_arguments: testCase.expected_arguments,
                    actual_arguments: actualArguments,
                    tool_pass: actualTool === testCase.expected_tool,
                    argument_pass: false,
                    passed: false,
                    failure: "Arguments were invalid JSON"
                };
            }
        }

        const toolPass =
            actualTool === testCase.expected_tool;

        const argumentPass =
            deepEqual(
                actualArguments,
                testCase.expected_arguments
            );

        return {
            id: testCase.id,
            category: testCase.category,
            prompt: testCase.prompt,
            expected_tool: testCase.expected_tool,
            actual_tool: actualTool,
            expected_arguments: testCase.expected_arguments,
            actual_arguments: actualArguments,
            tool_pass: toolPass,
            argument_pass: argumentPass,
            passed: toolPass && argumentPass,
            failure: toolPass && argumentPass
                ? null
                : !toolPass
                    ? "Incorrect tool selected"
                    : "Incorrect arguments"
        };

    } catch (error) {
        return {
            id: testCase.id,
            category: testCase.category,
            prompt: testCase.prompt,
            expected_tool: testCase.expected_tool,
            actual_tool: null,
            expected_arguments: testCase.expected_arguments,
            actual_arguments: null,
            tool_pass: false,
            argument_pass: false,
            passed: false,
            failure: `Ollama error: ${error.message}`
        };
    }
}

function calculateMetrics(results) {
    const total = results.length;

    const passed = results.filter(
        result => result.passed
    ).length;

    const toolCorrect = results.filter(
        result => result.tool_pass
    ).length;

    const argumentsCorrect = results.filter(
        result => result.argument_pass
    ).length;

    return {
        total,
        passed,
        failed: total - passed,
        accuracy: total
            ? Number((passed / total * 100).toFixed(2))
            : 0,
        tool_accuracy: total
            ? Number((toolCorrect / total * 100).toFixed(2))
            : 0,
        argument_accuracy: total
            ? Number((argumentsCorrect / total * 100).toFixed(2))
            : 0
    };
}

function calculatePerTool(results) {
    const categories = {};

    for (const result of results) {
        const category = result.category;

        if (!categories[category]) {
            categories[category] = [];
        }

        categories[category].push(result);
    }

    const report = {};

    for (const [category, tests] of Object.entries(categories)) {
        const metrics = calculateMetrics(tests);

        report[category] = {
            ...metrics,
            failures: tests
                .filter(test => !test.passed)
                .map(test => ({
                    id: test.id,
                    prompt: test.prompt,
                    expected_tool: test.expected_tool,
                    actual_tool: test.actual_tool,
                    expected_arguments: test.expected_arguments,
                    actual_arguments: test.actual_arguments,
                    failure: test.failure
                }))
        };
    }

    return report;
}

function printReport(results, metrics, perTool) {
    console.log("\n");
    console.log("======================================");
    console.log("    S.T.R.A.N.G.E TOOL EVALUATION");
    console.log("======================================");

    console.log(`Model: ${MODEL}`);

    console.log(`Total tests: ${metrics.total}`);
    console.log(`Passed: ${metrics.passed}`);
    console.log(`Failed: ${metrics.failed}`);

    console.log(`Overall accuracy: ${metrics.accuracy}%`);

    console.log(
        `Tool selection accuracy: ${metrics.tool_accuracy}%`
    );

    console.log(
        `Argument accuracy: ${metrics.argument_accuracy}%`
    );

    console.log("\nPER TOOL RESULTS");
    console.log("--------------------------------------");

    for (const [name, data] of Object.entries(perTool)) {
        console.log(
            `${name.padEnd(24)} ${data.passed}/${data.total} ` +
            `(${data.accuracy}%)`
        );
    }

    console.log("\nFAILED TEST CASES");
    console.log("--------------------------------------");

    const failures = results.filter(
        result => !result.passed
    );

    if (failures.length === 0) {
        console.log("All test cases passed.");
    }

    for (const failure of failures) {
        console.log(`\n[${failure.id}] ${failure.prompt}`);

        console.log(
            `Expected tool: ${failure.expected_tool}`
        );

        console.log(
            `Actual tool: ${failure.actual_tool ?? "NONE"}`
        );

        console.log(
            `Expected arguments: ${JSON.stringify(
                failure.expected_arguments
            )}`
        );

        console.log(
            `Actual arguments: ${JSON.stringify(
                failure.actual_arguments
            )}`
        );

        console.log(`Failure: ${failure.failure}`);
    }

    console.log("\n======================================");
}

async function main() {
    const dataset = JSON.parse(
        await fs.readFile(DATASET_PATH, "utf8")
    );

    await fs.mkdir(REPORT_DIR, {
        recursive: true
    });

    const results = [];

    console.log(`Running ${dataset.length} test cases`);
    console.log(`Model: ${MODEL}`);

    for (let i = 0; i < dataset.length; i++) {
        const testCase = dataset[i];

        process.stdout.write(
            `[${i + 1}/${dataset.length}] ${testCase.id} `
        );

        const result = await runTest(testCase);

        results.push(result);

        console.log(result.passed ? "PASS" : "FAIL");
    }

    const metrics = calculateMetrics(results);

    const perTool = calculatePerTool(results);

    printReport(results, metrics, perTool);

    const report = {
        model: MODEL,
        timestamp: new Date().toISOString(),
        metrics,
        per_tool: perTool,
        results
    };

    const reportPath = path.join(
        REPORT_DIR,
        `report-${Date.now()}.json`
    );

    await fs.writeFile(
        reportPath,
        JSON.stringify(report, null, 2)
    );

    console.log(`\nFull report saved to: ${reportPath}`);
}

main().catch(error => {
    console.error("Evaluation failed:", error);
    process.exit(1);
});
