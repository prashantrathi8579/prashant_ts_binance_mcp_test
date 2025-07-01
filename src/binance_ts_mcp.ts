#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

const { version } = require("../package.json");

const ACTIVITY_LOG_FILE = path.join(__dirname, "../activity.log");

function getSymbolFromName(name: string): string {
    if (["bitcoin", "btc"].includes(name)) return "BTCUSDT";
    if (["ethereum", "eth"].includes(name)) return "ETHUSDT";

    return typeof name === "string" ? name.toUpperCase() : String(name).toUpperCase(); 
}

const server = new McpServer({
    name: "Binance MCP",
    version
});

server.tool(
    "get_price",
    { symbol: z.string() },
    async ({ symbol }) => {
        const resolvedSymbol = getSymbolFromName(symbol);
        const url = `https://api.binance.com/api/v3/ticker/price?symbol=${resolvedSymbol}`;
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            fs.appendFileSync(
                ACTIVITY_LOG_FILE,
                `Error getting price for ${resolvedSymbol}: ${response.status} ${errorText}\n`
            );
            throw new Error(`Error getting price for ${resolvedSymbol}: ${response.status} ${errorText}`);
        }
        const data = await response.json() as any;
        const price = data.price;
        fs.appendFileSync(
            ACTIVITY_LOG_FILE,
            `Successfully got price for ${resolvedSymbol}. Current price is ${price}. Current time is ${new Date().toISOString()}\n`
        );
        return { content: [{ type: "text", text: `The current price of ${resolvedSymbol} is ${price}` }] };
    }
);

server.tool(
    "get_price_price_change",
    { symbol: z.string() },
    async ({ symbol }) => {
        const resolvedSymbol = getSymbolFromName(symbol);
        const url = `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${resolvedSymbol}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error getting price change for ${resolvedSymbol}: ${response.status}`);
        }
        const data = await response.json() as any;
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
);

server.resource(
    "file://activity.log",
    new ResourceTemplate("file://activity.log", { list: undefined }),
    async () => {
        if (!fs.existsSync(ACTIVITY_LOG_FILE)) return { contents: [{ uri: "file://activity.log", text: "" }] };
        const text = fs.readFileSync(ACTIVITY_LOG_FILE, "utf-8");
        return { contents: [{ uri: "file://activity.log", text }] };
    }
);

server.resource(
    "resource://crypto_price/{symbol}",
    new ResourceTemplate("resource://crypto_price/{symbol}", { list: undefined }),
    async (uri, variables) => {
        const symbol = variables.symbol as string;
        const resolvedSymbol = getSymbolFromName(symbol);
        const url = `https://api.binance.com/api/v3/ticker/price?symbol=${resolvedSymbol}`;
        const response = await fetch(url);
        if (!response.ok) {
            return { contents: [{ uri: uri.href, text: `Error getting price for ${resolvedSymbol}` }] };
        }
        const data = await response.json() as any;
        return { contents: [{ uri: uri.href, text: `The current price of ${resolvedSymbol} is ${data.price}` }] };
    }
);


async function startServer() {
    if (!fs.existsSync(ACTIVITY_LOG_FILE)) {
        fs.writeFileSync(ACTIVITY_LOG_FILE, "");
    }
    // Create transport instance (equivalent to transport="stdio" in Python)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`Binance MCP Server v${version} started`);
    console.error("Tools: get_price, get_price_price_change");
    console.error("Resources: file://activity.log, resource://crypto_price/{symbol}");
}

startServer().catch(err => {
    console.error("Error starting server:", err);
    process.exit(1);
});
