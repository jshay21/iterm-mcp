#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import CommandExecutor from "./CommandExecutor.js";
import TtyOutputReader from "./TtyOutputReader.js";
import SendControlCharacter from "./SendControlCharacter.js";

const server = new Server(
  {
    name: "iterm-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "write_to_terminal",
        description: "Writes text to the active iTerm terminal - often used to run a command in the terminal",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The command to run or text to write to the terminal",
            },
            ttyPath: {
              type: "string",
              description: "Optional: The TTY device path (e.g., /dev/ttys005) to target a specific iTerm session.",
            },
          },
          required: ["command"],
        },
      },
      {
        name: "read_terminal_output",
        description: "Reads the output from the active iTerm terminal",
        inputSchema: {
          type: "object",
          properties: {
            linesOfOutput: {
              type: "integer",
              description: "The number of lines of output to read.",
            },
            ttyPath: {
              type: "string",
              description: "Optional: The TTY device path (e.g., /dev/ttys005) to target a specific iTerm session.",
            },
          },
          required: ["linesOfOutput"],
        },
      },
      {
        name: "send_control_character",
        description: "Sends a control character to the active iTerm terminal (e.g., Control-C, or special sequences like ']' for telnet escape)",
        inputSchema: {
          type: "object",
          properties: {
            letter: {
              type: "string",
              description: "The letter corresponding to the control character (e.g., 'C' for Control-C, ']' for telnet escape)",
            },
            ttyPath: {
              type: "string",
              description: "Optional: The TTY device path (e.g., /dev/ttys005) to target a specific iTerm session.",
            },
          },
          required: ["letter"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const ttyPath = request.params.arguments?.ttyPath ? String(request.params.arguments.ttyPath) : undefined;

  switch (request.params.name) {
    case "write_to_terminal": {
      let executor = new CommandExecutor(ttyPath);
      const command = String(request.params.arguments?.command);
      const beforeCommandBuffer = await TtyOutputReader.retrieveBuffer(ttyPath);
      const beforeCommandBufferLines = beforeCommandBuffer.split("\n").length;

      await executor.executeCommand(command);

      const afterCommandBuffer = await TtyOutputReader.retrieveBuffer(ttyPath);
      const afterCommandBufferLines = afterCommandBuffer.split("\n").length;
      const outputLines = Math.max(0, afterCommandBufferLines - beforeCommandBufferLines);

      return {
        content: [
          {
            type: "text",
            text: `${outputLines} lines were output after sending the command to the terminal. Read the last ${outputLines} lines of terminal contents to orient yourself. Never assume that the command was executed or that it was successful.`,
          },
        ],
      };
    }
    case "read_terminal_output": {
      const linesOfOutput = Number(request.params.arguments?.linesOfOutput) || 25;
      const output = await TtyOutputReader.call(linesOfOutput, ttyPath);

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    }
    case "send_control_character": {
      const ttyControl = new SendControlCharacter(ttyPath);
      const letter = String(request.params.arguments?.letter);
      await ttyControl.send(letter);

      return {
        content: [
          {
            type: "text",
            text: `Sent control character: Control-${letter.toUpperCase()}`,
          },
        ],
      };
    }
    default:
      throw new Error("Unknown tool");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
