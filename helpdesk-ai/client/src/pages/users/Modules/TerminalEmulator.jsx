import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

function normalizeCommand(input = "") {
  return String(input).trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePath(path = "") {
  const safe = String(path || "").replace(/\//g, "\\").trim();
  if (!safe) {
    return "C:\\";
  }
  const driveMatch = safe.match(/^[a-z]:/i);
  const drive = driveMatch ? `${driveMatch[0][0].toUpperCase()}:` : "C:";
  const remainder = safe.slice(drive.length).replace(/^\\+/, "");
  const parts = remainder.split("\\").filter(Boolean);
  return parts.length ? `${drive}\\${parts.join("\\")}` : `${drive}\\`;
}

function resolvePath(currentPath, targetPath) {
  const current = normalizePath(currentPath);
  const rawTarget = String(targetPath || "").trim();
  if (!rawTarget) {
    return current;
  }

  const target = rawTarget.replace(/\//g, "\\");
  if (/^[a-z]:/i.test(target)) {
    return normalizePath(target);
  }

  const drive = current.slice(0, 2);
  if (target.startsWith("\\")) {
    return normalizePath(`${drive}${target}`);
  }

  const currentParts = current.split("\\");
  const targetParts = target.split("\\").filter(Boolean);
  for (const part of targetParts) {
    if (part === ".") {
      continue;
    }
    if (part === "..") {
      if (currentParts.length > 1) {
        currentParts.pop();
      }
      continue;
    }
    currentParts.push(part);
  }
  return normalizePath(currentParts.join("\\"));
}

function randomLatency(min = 14, max = 52) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildIpConfigOutput(hostname) {
  return [
    "",
    "Windows IP Configuration",
    "",
    `Host Name . . . . . . . . . . . . : ${hostname}`,
    "Primary Dns Suffix  . . . . . . . : sim.lab.local",
    "Node Type . . . . . . . . . . . . : Hybrid",
    "IP Routing Enabled. . . . . . . . : No",
    "WINS Proxy Enabled. . . . . . . . : No",
    "",
    "Ethernet adapter Ethernet0:",
    "",
    "   Connection-specific DNS Suffix  . : sim.lab.local",
    "   Description . . . . . . . . . . . : Intel(R) Ethernet Controller",
    "   Physical Address. . . . . . . . . : 00-15-5D-4A-B2-C1",
    "   DHCP Enabled. . . . . . . . . . . : Yes",
    "   Autoconfiguration Enabled . . . . : Yes",
    "   IPv4 Address. . . . . . . . . . . : 10.0.0.42(Preferred)",
    "   Subnet Mask . . . . . . . . . . . : 255.255.255.0",
    "   Default Gateway . . . . . . . . . : 10.0.0.1",
    "   DNS Servers . . . . . . . . . . . : 1.1.1.1",
    "                                       8.8.8.8"
  ].join("\n");
}

function buildDirOutput(path) {
  const now = new Date();
  const datePart = now.toLocaleDateString();
  const timePart = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return [
    ` Volume in drive ${path[0]} has no label.`,
    " Volume Serial Number is 7A3D-19C2",
    "",
    ` Directory of ${path}`,
    "",
    `${datePart}  ${timePart}    <DIR>          .`,
    `${datePart}  ${timePart}    <DIR>          ..`,
    `${datePart}  ${timePart}    <DIR>          Desktop`,
    `${datePart}  ${timePart}    <DIR>          Documents`,
    `${datePart}  ${timePart}               182 notes.txt`,
    `${datePart}  ${timePart}            12,844 troubleshooting-log.md`,
    "               2 File(s)         13,026 bytes",
    "               4 Dir(s)  124,980,785,152 bytes free"
  ].join("\n");
}

export default function TerminalEmulator({
  className = "",
  initialMessage = "Windows Terminal simulation. Type 'help' for available commands.",
  username = "student",
  hostname = "DESKTOP-SIM",
  initialPath = "C:\\Users\\student",
  queuedCommand = null,
  onCommand
}) {
  const containerRef = useRef(null);
  const inputBufferRef = useRef("");
  const historyRef = useRef([]);
  const historyIndexRef = useRef(0);
  const currentPathRef = useRef(normalizePath(initialPath));
  const onCommandRef = useRef(onCommand);
  const runQueuedCommandRef = useRef(null);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    currentPathRef.current = normalizePath(initialPath);
  }, [initialPath]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const term = new Terminal({
      theme: {
        background: "#0c0c0c",
        foreground: "#cccccc",
        cursor: "#ffffff",
        selectionBackground: "#ffffff40",
        black: "#0c0c0c",
        brightBlack: "#767676",
        red: "#c50f1f",
        brightRed: "#e74856",
        green: "#13a10e",
        brightGreen: "#16c60c",
        yellow: "#c19c00",
        brightYellow: "#f9f1a5",
        blue: "#0037da",
        brightBlue: "#3b78ff",
        magenta: "#881798",
        brightMagenta: "#b4009e",
        cyan: "#3a96dd",
        brightCyan: "#61d6d6",
        white: "#cccccc",
        brightWhite: "#f2f2f2"
      },
      fontFamily: "Cascadia Code, Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 1000,
      convertEol: true
    });
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);
    fitAddon.fit();
    term.focus();

    const writePrompt = () => {
      term.write(`${currentPathRef.current}> `);
    };

    const clearCurrentInput = () => {
      if (!inputBufferRef.current.length) {
        return;
      }
      term.write("\b \b".repeat(inputBufferRef.current.length));
      inputBufferRef.current = "";
    };

    const replaceCurrentInput = (value) => {
      clearCurrentInput();
      if (value) {
        inputBufferRef.current = value;
        term.write(value);
      }
    };

    const writeLines = (value) => {
      const lines = Array.isArray(value) ? value : String(value || "").split("\n");
      lines.forEach((line) => term.writeln(String(line)));
    };

    const handleBuiltInCommand = (rawInput) => {
      const command = String(rawInput || "").trim();
      const normalized = normalizeCommand(command);
      if (!normalized) {
        return { normalized, output: "", known: true, clear: false, ended: false };
      }

      if (normalized === "help") {
        return {
          normalized,
          output: [
            "Available commands:",
            "help, cls, clear, ver, whoami, hostname, ipconfig, ping <host>,",
            "echo <text>, dir, cd <path>, mkdir <name>, date, time, exit"
          ].join("\n"),
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "cls" || normalized === "clear") {
        return { normalized, output: "", known: true, clear: true, ended: false };
      }

      if (normalized === "ver") {
        return {
          normalized,
          output: "Microsoft Windows [Version 10.0.22631.4602]",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "whoami") {
        return {
          normalized,
          output: `${hostname}\\${username}`,
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "hostname") {
        return { normalized, output: hostname, known: true, clear: false, ended: false };
      }

      if (normalized === "ipconfig") {
        return { normalized, output: buildIpConfigOutput(hostname), known: true, clear: false, ended: false };
      }

      if (normalized.startsWith("ping")) {
        const host = command.slice(4).trim();
        if (!host) {
          return {
            normalized,
            output: "Usage: ping <host>",
            known: true,
            clear: false,
            ended: false
          };
        }
        const latency = randomLatency();
        return {
          normalized,
          output: [
            `Pinging ${host} with 32 bytes of data:`,
            `Reply from ${host}: bytes=32 time=${latency}ms TTL=57`,
            `Reply from ${host}: bytes=32 time=${latency + 1}ms TTL=57`,
            "",
            `Ping statistics for ${host}:`,
            "    Packets: Sent = 2, Received = 2, Lost = 0 (0% loss)"
          ].join("\n"),
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized.startsWith("echo")) {
        return {
          normalized,
          output: command.slice(4).trim(),
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "dir") {
        return { normalized, output: buildDirOutput(currentPathRef.current), known: true, clear: false, ended: false };
      }

      if (normalized.startsWith("cd")) {
        const target = command.slice(2).trim();
        if (!target) {
          return { normalized, output: currentPathRef.current, known: true, clear: false, ended: false };
        }
        currentPathRef.current = resolvePath(currentPathRef.current, target);
        return { normalized, output: "", known: true, clear: false, ended: false };
      }

      if (normalized.startsWith("mkdir")) {
        const folderName = command.slice(5).trim();
        if (!folderName) {
          return {
            normalized,
            output: "Syntax: mkdir <name>",
            known: true,
            clear: false,
            ended: false
          };
        }
        return {
          normalized,
          output: `Created directory ${folderName}`,
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "date") {
        return {
          normalized,
          output: new Date().toLocaleDateString([], {
            weekday: "short",
            year: "numeric",
            month: "long",
            day: "numeric"
          }),
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "time") {
        return {
          normalized,
          output: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          }),
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "exit") {
        return {
          normalized,
          output: "Session ended.",
          known: true,
          clear: false,
          ended: true
        };
      }

      return {
        normalized,
        output: `'${command}' is not recognized as an internal or external command.`,
        known: false,
        clear: false,
        ended: false
      };
    };

    const submitCommand = (command) => {
      const result = handleBuiltInCommand(command);
      if (result.clear) {
        term.clear();
      } else if (result.output) {
        writeLines(result.output);
      }

      let callbackLines = [];
      if (typeof onCommandRef.current === "function") {
        const callbackResult = onCommandRef.current({
          command,
          normalizedCommand: result.normalized,
          result
        });
        if (typeof callbackResult === "string") {
          callbackLines = [callbackResult];
        } else if (Array.isArray(callbackResult)) {
          callbackLines = callbackResult.filter(Boolean).map((line) => String(line));
        }
      }
      if (callbackLines.length) {
        writeLines(callbackLines);
      }

      if (!result.ended) {
        writePrompt();
      }
    };

    const onEnter = () => {
      const command = inputBufferRef.current;
      term.write("\r\n");
      inputBufferRef.current = "";

      const trimmed = String(command || "").trim();
      if (trimmed) {
        const previous = historyRef.current[historyRef.current.length - 1];
        if (previous !== trimmed) {
          historyRef.current.push(trimmed);
        }
      }
      historyIndexRef.current = historyRef.current.length;
      submitCommand(command);
    };

    const moveHistory = (direction) => {
      if (!historyRef.current.length) {
        return;
      }
      if (direction < 0 && historyIndexRef.current > 0) {
        historyIndexRef.current -= 1;
      } else if (direction > 0 && historyIndexRef.current < historyRef.current.length) {
        historyIndexRef.current += 1;
      }
      if (historyIndexRef.current >= historyRef.current.length) {
        replaceCurrentInput("");
        return;
      }
      replaceCurrentInput(historyRef.current[historyIndexRef.current]);
    };

    term.writeln(initialMessage);
    writePrompt();

    const disposable = term.onData((data) => {
      if (data === "\r") {
        onEnter();
        return;
      }
      if (data === "\u007F") {
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }
      if (data === "\u001b[A") {
        moveHistory(-1);
        return;
      }
      if (data === "\u001b[B") {
        moveHistory(1);
        return;
      }
      for (const char of data) {
        const code = char.charCodeAt(0);
        const printable = code >= 32 && code !== 127;
        if (!printable) {
          continue;
        }
        inputBufferRef.current += char;
        term.write(char);
      }
    });

    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener("resize", handleResize);

    runQueuedCommandRef.current = (queued) => {
      const value = String(queued || "").trim();
      if (!value) {
        return;
      }
      replaceCurrentInput(value);
      onEnter();
    };

    return () => {
      runQueuedCommandRef.current = null;
      window.removeEventListener("resize", handleResize);
      disposable.dispose();
      term.dispose();
    };
  }, [hostname, initialMessage, initialPath, username]);

  useEffect(() => {
    if (!queuedCommand || !runQueuedCommandRef.current) {
      return;
    }
    if (typeof queuedCommand === "string") {
      runQueuedCommandRef.current(queuedCommand);
      return;
    }
    runQueuedCommandRef.current(queuedCommand.command);
  }, [queuedCommand]);

  return <div ref={containerRef} className={`terminal-emulator ${className}`.trim()} />;
}
