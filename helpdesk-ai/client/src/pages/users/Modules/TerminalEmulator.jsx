import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

function normalizeCommand(input = "") {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s+/g, " ");
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
  onCommand,
  resolveUnknownCommand,
  autoFocus = true
}) {
  const containerRef = useRef(null);
  const inputBufferRef = useRef("");
  const historyRef = useRef([]);
  const historyIndexRef = useRef(0);
  const currentPathRef = useRef(normalizePath(initialPath));
  const onCommandRef = useRef(onCommand);
  const resolveUnknownCommandRef = useRef(resolveUnknownCommand);
  const runQueuedCommandRef = useRef(null);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    resolveUnknownCommandRef.current = resolveUnknownCommand;
  }, [resolveUnknownCommand]);

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
    if (autoFocus) {
      term.focus();
    }

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
            "help, cls, clear, ver, whoami, hostname, ipconfig, ipconfig /all, ipconfig /release, ipconfig /renew, ipconfig /flushdns,",
            "nslookup google.com, nslookup intranet.company.local, ping <host>, tracert google.com, tasklist /v, tasklist /svc,",
            "wmic startup get caption,command, wmic logicaldisk get caption,freespace,size, wmic logicaldisk get name,volumename,description,",
            "wmic printer get name,workoffline, get-service spooler, sc query spooler, sc qc spooler, net stop spooler, net start spooler,",
            "del /q %systemroot%\\system32\\spool\\printers\\*, attrib -h -r -s /s /d *.*, dir /a, xcopy *.* recovered /e /i /h,",
            "cleanmgr, sfc /scannow, dism /online /cleanup-image /restorehealth, dism /online /cleanup-image /startcomponentcleanup,",
            "net user jdoe /domain, search-adaccount -lockedout, unlock-adaccount -identity jdoe, set-adaccountpassword -identity jdoe -reset,",
            "ssh admin@10.10.1.50, systemctl status nginx, tail -n 50 /var/log/nginx/error.log, netstat -tulpn | grep 443, systemctl restart nginx,",
            "wmic process get name,processid,parentprocessid, netstat -ano, mrt /f:y, eventvwr.msc, echo <text>, dir, cd <path>, mkdir <name>, date, time, exit"
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

      if (normalized === "ipconfig" || normalized === "ipconfig /all") {
        return { normalized, output: buildIpConfigOutput(hostname), known: true, clear: false, ended: false };
      }

      if (normalized === "ipconfig /release") {
        return {
          normalized,
          output: "Releasing adapter configuration... done.",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "ipconfig /renew") {
        return {
          normalized,
          output: "Renewing adapter configuration... lease acquired: 192.168.1.42",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "ipconfig /flushdns") {
        return {
          normalized,
          output: "Successfully flushed DNS Resolver Cache.",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "nslookup google.com") {
        return {
          normalized,
          output:
            "Server: dns.company.local\nAddress: 10.10.10.53\nNon-authoritative answer:\nName: google.com\nAddresses: 142.250.190.14",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "nslookup intranet.company.local") {
        return {
          normalized,
          output: "Server: dns.company.local\nAddress: 10.10.10.53\nName: intranet.company.local\nAddress: 10.10.1.50",
          known: true,
          clear: false,
          ended: false
        };
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
        if (normalizeCommand(`ping ${host}`) === "ping 10.10.1.50") {
          return {
            normalized,
            output: "Request timed out.\nRequest timed out.\nPackets: Sent = 4, Received = 0, Lost = 4 (100% loss)",
            known: true,
            clear: false,
            ended: false
          };
        }
        if (normalizeCommand(`ping ${host}`) === "ping 8.8.8.8") {
          return {
            normalized,
            output: "Reply from 8.8.8.8: bytes=32 time=18ms TTL=118",
            known: true,
            clear: false,
            ended: false
          };
        }
        if (normalizeCommand(`ping ${host}`) === "ping google.com") {
          return {
            normalized,
            output: "Pinging google.com [142.250.190.14]...\nReply from 142.250.190.14: bytes=32 time=21ms TTL=117",
            known: true,
            clear: false,
            ended: false
          };
        }
        if (normalizeCommand(`ping ${host}`) === "ping 192.168.1.1") {
          return {
            normalized,
            output: "Reply from 192.168.1.1: bytes=32 time<1ms TTL=64",
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

      if (normalized === "tracert google.com") {
        return {
          normalized,
          output: "Tracing route to google.com\n1   1 ms  192.168.1.1\n2  12 ms  ISP edge\n3  19 ms  core transit\n4  21 ms  google.com",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "tasklist /v") {
        return {
          normalized,
          output:
            "Image Name                 PID  CPU Time  Mem Usage  Status\nSearchIndexer.exe         4112  00:08:11   412,344 K  Running\nMsMpEng.exe               2284  00:03:17   276,220 K  Running",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "tasklist /svc") {
        return {
          normalized,
          output:
            "Image Name                 PID  Services\nsvchost.exe               1120  Dnscache\nexplorer.exe              5584  N/A\nunknownproc.exe           7724  N/A",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "wmic startup get caption,command") {
        return {
          normalized,
          output:
            "Caption                    Command\nOneDrive                   C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe /background\nTeams                      C:\\Users\\Public\\Teams\\Update.exe --processStart Teams.exe",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "wmic logicaldisk get name,volumename,description") {
        return {
          normalized,
          output: "Description       Name  VolumeName\nLocal Fixed Disk  C:    OS\nRemovable Disk    E:    USB_RECOVERY",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "wmic logicaldisk get caption,freespace,size") {
        return {
          normalized,
          output: "Caption  FreeSpace      Size\nC:       11824578560    255030124544\nD:       742552641536   1000202039296",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "wmic printer get name,workoffline") {
        return {
          normalized,
          output: "Name              WorkOffline\nHP LaserJet Pro   TRUE",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "get-service spooler" || normalized === "sc query spooler") {
        return {
          normalized,
          output: "SERVICE_NAME: spooler\nSTATE              : 1  STOPPED",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "sc qc spooler") {
        return {
          normalized,
          output: "SERVICE_NAME: spooler\nSTART_TYPE         : AUTO_START\nDEPENDENCIES       : RPCSS",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "net stop spooler") {
        return {
          normalized,
          output: "The Print Spooler service was stopped successfully.",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "net start spooler") {
        return {
          normalized,
          output: "The Print Spooler service was started successfully.",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "del /q %systemroot%\\system32\\spool\\printers\\*") {
        return {
          normalized,
          output: "Deleted queued spool files from C:\\Windows\\System32\\spool\\PRINTERS",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "attrib -h -r -s /s /d *.*") {
        return {
          normalized,
          output: "File attributes updated. Hidden/system/read-only flags removed.",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "dir /a") {
        return {
          normalized,
          output:
            "Directory of E:\\\n05/08/2026  08:42 AM    <DIR>          .\n05/08/2026  08:42 AM    <DIR>          ..\n05/08/2026  08:37 AM           253,944 Q3_Budget_Final.xlsx",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "dir c:\\ /a /s") {
        return {
          normalized,
          output:
            " Directory of C:\\\n06/15/2026  09:02 AM    <DIR>          Users\n06/15/2026  09:02 AM    <DIR>          Program Files\n06/15/2026  09:02 AM    <DIR>          Windows\n\n Total Files Listed:\n       4,812 File(s)  198,443,522,048 bytes",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "xcopy *.* recovered /e /i /h") {
        return {
          normalized,
          output: "32 File(s) copied to E:\\recovered",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "cleanmgr") {
        return {
          normalized,
          output: "Disk Cleanup launched...\nTemporary files removed: 4.3 GB\nWindows Update cache removed: 1.9 GB",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "sfc /scannow") {
        return {
          normalized,
          output:
            "Beginning system scan. This process will take some time.\nVerification 100% complete.\nWindows Resource Protection found corrupt files and successfully repaired them.",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "dism /online /cleanup-image /restorehealth") {
        return {
          normalized,
          output:
            "Deployment Image Servicing and Management tool\n[==========================100.0%==========================]\nThe restore operation completed successfully.",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "dism /online /cleanup-image /startcomponentcleanup") {
        return {
          normalized,
          output: "Component Store cleanup completed.\nReclaimable packages removed.",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "net user jdoe /domain") {
        return {
          normalized,
          output: "User name                    jdoe\nAccount active               Yes\nAccount expires              Never\nPassword last set            05/08/2026 08:11",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "search-adaccount -lockedout") {
        return {
          normalized,
          output: "SamAccountName  ObjectClass\njdoe            user",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "unlock-adaccount -identity jdoe") {
        return {
          normalized,
          output: "Account 'jdoe' unlocked successfully.",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "set-adaccountpassword -identity jdoe -reset") {
        return {
          normalized,
          output: "Temporary password reset completed for jdoe.",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "ssh admin@10.10.1.50") {
        return {
          normalized,
          output: "Connected to web-prod-01 (10.10.1.50).",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "systemctl status nginx") {
        return {
          normalized,
          output: "nginx.service - nginx\nLoaded: loaded\nActive: failed (Result: exit-code)\nDocs: man:nginx(8)",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "tail -n 50 /var/log/nginx/error.log") {
        return {
          normalized,
          output: "[emerg] bind() to 0.0.0.0:443 failed (98: Address already in use)",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "netstat -tulpn | grep 443") {
        return {
          normalized,
          output: "tcp 0 0 0.0.0.0:443 0.0.0.0:* LISTEN 8821/orphan-httpd",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "systemctl restart nginx") {
        return {
          normalized,
          output: "nginx restarted successfully.\nActive: active (running)",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "wmic process get name,processid,parentprocessid") {
        return {
          normalized,
          output: "Name               ParentProcessId  ProcessId\nunknownproc.exe     5584             7724\npowershell.exe      3500             9044",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "netstat -ano") {
        return {
          normalized,
          output: "TCP 10.10.10.25:49722 198.51.100.12:443 ESTABLISHED 7724",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "mrt /f:y") {
        return {
          normalized,
          output: "Microsoft Malicious Software Removal Tool\nFull scan completed.\nThreats detected: 0",
          known: true,
          clear: false,
          ended: false
        };
      }

      if (normalized === "eventvwr.msc") {
        return {
          normalized,
          output: "Event Viewer opened. Review System/Application logs near incident timestamp.",
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
      const builtInResult = handleBuiltInCommand(command);
      let result = builtInResult;
      if (!builtInResult.known && typeof resolveUnknownCommandRef.current === "function") {
        const override = resolveUnknownCommandRef.current({
          command,
          normalizedCommand: builtInResult.normalized,
          result: builtInResult,
          currentPath: currentPathRef.current
        });
        if (override && typeof override === "object") {
          result = {
            ...builtInResult,
            ...override,
            normalized: String(override.normalized || builtInResult.normalized || ""),
            known: typeof override.known === "boolean" ? override.known : true
          };
        }
      }

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
  }, [autoFocus, hostname, initialMessage, initialPath, username]);

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
