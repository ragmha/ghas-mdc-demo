import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";

function trimTrailingWhitespace(value) {
  return typeof value === "string" ? value.replace(/\s+$/u, "") : "";
}

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function createCommandError(command, args, result) {
  const stderr = trimTrailingWhitespace(result.stderr);
  const stdout = trimTrailingWhitespace(result.stdout);
  const detail = [stderr, stdout].filter(Boolean).join("\n");
  return new Error(
    `Command failed (${result.status ?? "unknown"}): ${formatCommand(command, args)}${
      detail ? `\n${detail}` : ""
    }`,
  );
}

function runProcess(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw createCommandError(command, args, result);
  }

  return trimTrailingWhitespace(result.stdout);
}

function isWindowsBatchCommand(command) {
  return /\.(cmd|bat)$/iu.test(command);
}

function resolveWindowsCommand(command) {
  if (isAbsolute(command) || command.includes("\\") || command.includes("/")) {
    return command;
  }

  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  if (result.status !== 0) {
    return command;
  }

  const candidates = String(result.stdout)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const extension of [".exe", ".com", ".cmd", ".bat"]) {
    const match = candidates.find((candidate) =>
      candidate.toLowerCase().endsWith(extension),
    );
    if (match) {
      return match;
    }
  }

  return candidates[0] ?? command;
}

function formatCmdToken(value) {
  const text = String(value);
  if (/["\r\n\0]/u.test(text)) {
    throw new Error(
      `Unsupported Windows command argument. Embedded quotes and newlines are not allowed: ${text}`,
    );
  }

  if (text.length === 0) {
    return '""';
  }

  const escaped = text
    .replace(/%/gu, "%%")
    .replace(/[&|<>^()!]/gu, "^$&");
  return /\s/u.test(escaped) ? `"${escaped}"` : escaped;
}

function runWindows(command, args, options) {
  const resolvedCommand = resolveWindowsCommand(command);
  if (!isWindowsBatchCommand(resolvedCommand)) {
    return runProcess(resolvedCommand, args, options);
  }

  const batchCommand =
    isAbsolute(command) || command.includes("\\") || command.includes("/")
      ? `call ${formatCmdToken(resolvedCommand)}`
      : formatCmdToken(command);
  const invocation = [batchCommand, ...args.map(formatCmdToken)].join(" ");
  return runProcess(process.env.ComSpec ?? "cmd.exe", [
    "/d",
    "/s",
    "/c",
    invocation,
  ], {
    ...options,
    windowsVerbatimArguments: true,
  });
}

export function run(command, args = [], options = {}) {
  const normalizedArgs = args.map((argument) => String(argument));
  if (process.platform === "win32") {
    return runWindows(command, normalizedArgs, options);
  }

  return runProcess(command, normalizedArgs, options);
}
