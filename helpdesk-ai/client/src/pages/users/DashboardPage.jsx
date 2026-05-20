import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useAxios } from "../../hooks/useAxios";
import TerminalEmulator from "./Modules/TerminalEmulator";
import { simulations } from "./helpdeskData";
import "./dashboard.css";

const QUESTION_BANK = [
  {
    label: "Network",
    title: "No Internet Connection",
    question: "No internet connection on this PC. Please walk me through terminal-based troubleshooting."
  },
  {
    label: "Network",
    title: "DNS Problem",
    question: "Website names are not resolving. Help me fix DNS issue using terminal commands."
  },
  {
    label: "Performance",
    title: "Slow Computer / High CPU",
    question: "Computer is slow and CPU usage is high. Provide terminal-based troubleshooting steps."
  },
  {
    label: "Peripheral",
    title: "Printer Spooler Issue",
    question: "Printer spooler is not working and printing is stuck. Help me fix it step by step."
  },
  {
    label: "Files",
    title: "Recover Hidden USB Files",
    question: "Files in USB became hidden. Show terminal-based recovery steps."
  },
  {
    label: "Account",
    title: "User Account Locked",
    question: "User account is locked. Guide me through safe unlock and reset workflow."
  },
  {
    label: "Server",
    title: "Website/Server Down",
    question: "Internal website/server is down. Give me terminal-based incident checks."
  },
  {
    label: "Security",
    title: "Suspicious Process / Malware Check",
    question: "Need to investigate suspicious process and possible malware via terminal workflow."
  },
  {
    label: "Performance",
    title: "Low Disk Space",
    question: "Drive is running low on disk space. Help me diagnose and clean safely."
  },
  {
    label: "Software",
    title: "Service Not Running",
    question: "A required system service is not running. Guide me with terminal/service checks."
  }
];

const QUESTION_VARIANTS_BY_TITLE = {
  "No Internet Connection": [
    "No internet connection on this PC. Please walk me through terminal-based troubleshooting.",
    "My workstation has no internet access. Can you guide me through command-line diagnostics?",
    "Internet is down on this device. Give me step-by-step terminal checks to restore connectivity."
  ],
  "DNS Problem": [
    "Website names are not resolving. Help me fix DNS issue using terminal commands.",
    "Hostnames are failing to resolve. Please guide a command-line DNS troubleshooting workflow.",
    "I can reach IPs but not domain names. What terminal checks should I run for DNS?"
  ],
  "Slow Computer / High CPU": [
    "Computer is slow and CPU usage is high. Provide terminal-based troubleshooting steps.",
    "This PC is lagging with high CPU load. Walk me through command-line performance checks.",
    "System performance dropped and CPU is spiking. Give me a terminal-first diagnostic flow."
  ],
  "Printer Spooler Issue": [
    "Printer spooler is not working and printing is stuck. Help me fix it step by step.",
    "Print jobs are stuck in queue. Guide me through spooler troubleshooting from terminal.",
    "Printer service looks broken. What command-line steps should I run to recover the spooler?"
  ],
  "Recover Hidden USB Files": [
    "Files in USB became hidden. Show terminal-based recovery steps.",
    "My USB files are hidden after infection. Walk me through safe command-line recovery.",
    "Need to recover hidden files from a flash drive. Provide terminal commands and sequence."
  ],
  "User Account Locked": [
    "User account is locked. Guide me through safe unlock and reset workflow.",
    "A domain user is locked out. What secure terminal/admin steps should I follow to unlock?",
    "Account lockout incident: provide a command-driven unlock and temporary reset process."
  ],
  "Website/Server Down": [
    "Internal website/server is down. Give me terminal-based incident checks.",
    "Our internal site is unreachable. Walk me through command-line outage diagnostics.",
    "Production web service appears down. Provide terminal-first checks before escalation."
  ],
  "Suspicious Process / Malware Check": [
    "Need to investigate suspicious process and possible malware via terminal workflow.",
    "Possible malware activity detected. Guide me through command-line process and network checks.",
    "I need a terminal-led triage for suspicious processes and indicators of compromise."
  ],
  "Low Disk Space": [
    "Drive is running low on disk space. Help me diagnose and clean safely.",
    "Disk capacity is almost full. Give me safe terminal checks and cleanup steps.",
    "Need to reclaim storage quickly. Walk me through command-line disk analysis and cleanup."
  ],
  "Service Not Running": [
    "A required system service is not running. Guide me with terminal/service checks.",
    "Critical service failed to start. Provide a command-line troubleshooting sequence.",
    "Service outage on endpoint. Walk me through terminal checks to verify and recover it."
  ]
};

const SESSION_STORAGE_PREFIX = "helpdesk_simulation_sessions_";
const THEME_STORAGE_KEY = "helpdesk_simulation_theme";
const SIDEBAR_GROUP_PREFS_PREFIX = "helpdesk_sidebar_group_prefs_";
const MAX_COMPOSER_HEIGHT = 280;

const SUGGESTED_SIMULATION_MAP = {
  "No Internet Connection": "no-internet",
  "DNS Problem": "no-internet",
  "Slow Computer / High CPU": "slow-pc",
  "Printer Spooler Issue": "printer",
  "Recover Hidden USB Files": "file-recovery",
  "User Account Locked": "password-reset",
  "Website/Server Down": "server-down",
  "Suspicious Process / Malware Check": "malware",
  "Low Disk Space": "slow-pc",
  "Service Not Running": "printer"
};

const SIMULATION_PLAYBOOK_BY_TICKET = {
  "No Internet Connection": [
    { commands: ["ping 8.8.8.8"], result: "No external replies yet. Internet path is still down." },
    { commands: ["ipconfig /all"], result: "Adapter details captured. Next focus: DHCP/DNS refresh." },
    { commands: ["ipconfig /release", "ipconfig /renew"], result: "Lease cycle completed. New network lease received." },
    { commands: ["ipconfig /flushdns"], result: "DNS resolver cache cleared." },
    { commands: ["ping google.com", "tracert google.com"], result: "Name resolution and route path verified. Connectivity restored." }
  ],
  "DNS Problem": [
    { commands: ["nslookup google.com"], result: "Initial lookup failed or returned stale entries." },
    { commands: ["ipconfig /all"], result: "DNS server settings reviewed from adapter configuration." },
    { commands: ["ipconfig /flushdns"], result: "Stale local resolver entries removed." },
    { commands: ["nslookup google.com"], result: "DNS lookup now returns valid records." },
    { commands: ["ping google.com"], result: "Hostname now resolves and responds. DNS incident resolved." }
  ],
  "Slow Computer / High CPU": [
    { commands: ["tasklist /v"], result: "High-CPU process identified for remediation." },
    { commands: ["wmic startup get caption,command"], result: "Startup load reviewed; non-essential entries identified." },
    { commands: ["cleanmgr"], result: "Temporary/system junk cleanup executed." },
    { commands: ["sfc /scannow"], result: "System integrity scan completed." },
    { commands: ["dism /online /cleanup-image /restorehealth"], result: "Component store repair completed. System performance stabilized." }
  ],
  "Printer Spooler Issue": [
    { commands: ["wmic printer get name,workoffline"], result: "Printer state checked. Queue issue confirmed." },
    { commands: ["get-service spooler", "sc query spooler"], result: "Spooler service status collected." },
    { commands: ["net stop spooler"], result: "Spooler stopped. Queue can now be safely purged." },
    { commands: ["del /q %systemroot%\\system32\\spool\\printers\\*"], result: "Stuck spool files removed." },
    { commands: ["net start spooler"], result: "Spooler restarted successfully. Printing pipeline restored." }
  ],
  "Recover Hidden USB Files": [
    { commands: ["wmic logicaldisk get name,volumename,description"], result: "Removable drive letter validated." },
    { commands: ["dir /a"], result: "Hidden/system entries confirmed in the USB directory." },
    { commands: ["attrib -h -r -s /s /d *.*"], result: "Hidden/read-only/system attributes removed from user files." },
    { commands: ["dir /a"], result: "Previously hidden files are now visible." },
    { commands: ["xcopy *.* recovered /e /i /h"], result: "Recovered files copied to safe backup folder." }
  ],
  "User Account Locked": [
    { commands: ["net user jdoe /domain"], result: "Account status fetched from domain." },
    { commands: ["search-adaccount -lockedout"], result: "Locked account presence confirmed in AD." },
    { commands: ["unlock-adaccount -identity jdoe"], result: "Domain account unlocked." },
    { commands: ["set-adaccountpassword -identity jdoe -reset"], result: "Temporary password reset applied." },
    { commands: ["net user jdoe /domain"], result: "Account is active and ready for user logon." }
  ],
  "Website/Server Down": [
    { commands: ["ping 10.10.1.50", "nslookup intranet.company.local"], result: "Outage scope validated from endpoint checks." },
    { commands: ["ssh admin@10.10.1.50"], result: "Connected to affected server for service inspection." },
    { commands: ["systemctl status nginx"], result: "Web service state confirmed as failed." },
    { commands: ["tail -n 50 /var/log/nginx/error.log", "netstat -tulpn | grep 443"], result: "Root cause identified from logs/port binding." },
    { commands: ["systemctl restart nginx"], result: "Service restored. Availability checks passing." }
  ],
  "Suspicious Process / Malware Check": [
    { commands: ["tasklist /svc"], result: "Suspicious process list exported for triage." },
    { commands: ["wmic process get name,processid,parentprocessid"], result: "Process lineage inspected for anomalies." },
    { commands: ["netstat -ano"], result: "Live network connections linked to suspicious PIDs." },
    { commands: ["mrt /f:y"], result: "Full malware scan started and completed." },
    { commands: ["sfc /scannow"], result: "Post-cleanup system file integrity validated." }
  ],
  "Low Disk Space": [
    { commands: ["wmic logicaldisk get caption,freespace,size"], result: "Disk usage baseline captured." },
    { commands: ["dir c:\\ /a /s"], result: "Large file footprint identified for cleanup." },
    { commands: ["cleanmgr"], result: "Disk Cleanup removed temporary/update cache data." },
    { commands: ["dism /online /cleanup-image /startcomponentcleanup"], result: "Component store cleanup completed." },
    { commands: ["wmic logicaldisk get caption,freespace,size"], result: "Free space increased to acceptable threshold." }
  ],
  "Service Not Running": [
    { commands: ["sc query spooler"], result: "Service state confirmed as stopped/faulted." },
    { commands: ["sc qc spooler"], result: "Service configuration and dependencies inspected." },
    { commands: ["net start spooler"], result: "Service start attempted successfully." },
    { commands: ["sc query spooler"], result: "Service now reported as RUNNING." },
    { commands: ["eventvwr.msc"], result: "Event logs reviewed for recurrence prevention." }
  ]
};

const SIMULATION_PLAYBOOK_BY_MODULE = {
  "no-internet": SIMULATION_PLAYBOOK_BY_TICKET["No Internet Connection"],
  "slow-pc": SIMULATION_PLAYBOOK_BY_TICKET["Slow Computer / High CPU"],
  printer: SIMULATION_PLAYBOOK_BY_TICKET["Printer Spooler Issue"],
  "file-recovery": SIMULATION_PLAYBOOK_BY_TICKET["Recover Hidden USB Files"],
  "password-reset": SIMULATION_PLAYBOOK_BY_TICKET["User Account Locked"],
  "server-down": SIMULATION_PLAYBOOK_BY_TICKET["Website/Server Down"],
  malware: SIMULATION_PLAYBOOK_BY_TICKET["Suspicious Process / Malware Check"]
};

function normalizeCommand(input = "") {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s+/g, " ");
}

function getSimulationPlaybook({ ticketTitle = "", simulationId = "" } = {}) {
  if (ticketTitle && SIMULATION_PLAYBOOK_BY_TICKET[ticketTitle]) {
    return SIMULATION_PLAYBOOK_BY_TICKET[ticketTitle];
  }
  if (simulationId && SIMULATION_PLAYBOOK_BY_MODULE[simulationId]) {
    return SIMULATION_PLAYBOOK_BY_MODULE[simulationId];
  }
  return null;
}

function extractExpectedCommands(stepText = "", stepDetail = {}, context = {}) {
  const playbook = getSimulationPlaybook(context);
  const playbookStep = Array.isArray(playbook) ? playbook[context?.stepIndex || 0] : null;
  if (Array.isArray(playbookStep?.commands) && playbookStep.commands.length > 0) {
    return [...new Set(playbookStep.commands.map((cmd) => normalizeCommand(cmd)).filter(Boolean))];
  }

  const source = `${stepText}\n${stepDetail?.desc || ""}\n${stepDetail?.action || ""}\n${stepDetail?.screen || ""}`;
  const commands = [];
  const explicit = source.match(/`([^`]+)`/g) || [];
  explicit.forEach((chunk) => commands.push(chunk.replace(/`/g, "").trim()));

  if (/nslookup|dns/i.test(source)) commands.push("nslookup google.com", "ipconfig /flushdns", "ipconfig /all");
  if (/ipconfig|dhcp|gateway|network|internet|wifi/i.test(source)) commands.push("ipconfig /all", "ipconfig /release", "ipconfig /renew", "ping 8.8.8.8");
  if (/ping/i.test(source)) commands.push("ping 8.8.8.8", "ping google.com");
  if (/tracert|traceroute|route/i.test(source)) commands.push("tracert google.com");
  if (/cpu|slow|performance|task manager|startup/i.test(source)) commands.push("tasklist /v", "wmic startup get caption,command");
  if (/disk|storage|space|cleanup/i.test(source)) commands.push("wmic logicaldisk get caption,freespace,size", "cleanmgr");
  if (/spooler|printer|queue|print/i.test(source)) commands.push("sc query spooler", "net stop spooler", "net start spooler");
  if (/service/i.test(source)) commands.push("sc query spooler", "sc qc spooler");
  if (/locked|password|account|active directory/i.test(source)) commands.push("net user jdoe /domain", "unlock-adaccount -identity jdoe");
  if (/malware|suspicious|virus|process/i.test(source)) commands.push("tasklist /svc", "wmic process get name,processid,parentprocessid", "netstat -ano");
  if (/integrity|repair|system file/i.test(source)) commands.push("sfc /scannow", "dism /online /cleanup-image /restorehealth");
  if (/event viewer|eventvwr/i.test(source)) commands.push("eventvwr.msc");

  if (commands.length === 0) {
    commands.push("help");
  }

  return [...new Set(commands.map((cmd) => normalizeCommand(cmd)).filter(Boolean))];
}

function simulateTerminalCommand(command, scenarioType) {
  const cmd = normalizeCommand(command);
  if (!cmd) {
    return { output: "No command entered.", kind: "error", known: false };
  }
  if (cmd === "help") {
    return {
      output:
        "Supported commands: help, clear, ipconfig /all, ipconfig /release, ipconfig /renew, ipconfig /flushdns, nslookup google.com, ping 8.8.8.8, ping google.com, tracert google.com, tasklist /v, wmic startup get caption,command, wmic logicaldisk get caption,freespace,size, cleanmgr, sfc /scannow, dism /online /cleanup-image /restorehealth, sc query spooler, sc qc spooler, net stop spooler, net start spooler, del /q %systemroot%\\system32\\spool\\printers\\*, attrib -h -r -s /s /d *.*, dir /a, eventvwr.msc, ssh admin@10.10.1.50, systemctl status nginx, systemctl restart nginx, net user jdoe /domain, unlock-adaccount -identity jdoe, set-adaccountpassword -identity jdoe -reset, tasklist /svc, wmic process get name,processid,parentprocessid, netstat -ano",
      kind: "hint",
      known: true
    };
  }
  if (cmd === "clear") {
    return { output: "__CLEAR__", kind: "output", known: true };
  }
  if (/^ipconfig( \/all)?$/.test(cmd)) {
    return {
      output:
        "Windows IP Configuration\nEthernet adapter: Connected\nIPv4 Address: 192.168.1.42\nSubnet Mask: 255.255.255.0\nDefault Gateway: 192.168.1.1\nDNS Servers: 8.8.8.8, 1.1.1.1",
      kind: "output",
      known: true
    };
  }
  if (cmd === "ipconfig /release") {
    return { output: "Releasing adapter configuration... done.", kind: "output", known: true };
  }
  if (cmd === "ipconfig /renew") {
    return { output: "Renewing adapter configuration... lease acquired: 192.168.1.42", kind: "success", known: true };
  }
  if (cmd === "ipconfig /flushdns") {
    return { output: "Successfully flushed DNS Resolver Cache.", kind: "success", known: true };
  }
  if (cmd === "nslookup google.com") {
    return {
      output: "Server: dns.company.local\nAddress: 10.10.10.53\nNon-authoritative answer:\nName: google.com\nAddresses: 142.250.190.14",
      kind: "output",
      known: true
    };
  }
  if (cmd === "ping 8.8.8.8") {
    return { output: "Reply from 8.8.8.8: bytes=32 time=18ms TTL=118", kind: "output", known: true };
  }
  if (cmd === "ping google.com") {
    return { output: "Pinging google.com [142.250.190.14]...\nReply from 142.250.190.14: bytes=32 time=21ms TTL=117", kind: "output", known: true };
  }
  if (cmd === "ping 192.168.1.1") {
    return { output: "Reply from 192.168.1.1: bytes=32 time<1ms TTL=64", kind: "output", known: true };
  }
  if (cmd === "tracert google.com") {
    return { output: "Tracing route to google.com\n1   1 ms  192.168.1.1\n2  12 ms  ISP edge\n3  19 ms  core transit\n4  21 ms  google.com", kind: "output", known: true };
  }
  if (cmd === "tasklist /v") {
    return { output: "Image Name                 PID  CPU Time  Mem Usage  Status\nSearchIndexer.exe         4112  00:08:11   412,344 K  Running\nMsMpEng.exe               2284  00:03:17   276,220 K  Running", kind: "output", known: true };
  }
  if (cmd === "wmic startup get caption,command") {
    return { output: "Caption                    Command\nOneDrive                   C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe /background\nTeams                      C:\\Users\\Public\\Teams\\Update.exe --processStart Teams.exe", kind: "output", known: true };
  }
  if (cmd === "wmic logicaldisk get name,volumename,description") {
    return { output: "Description       Name  VolumeName\nLocal Fixed Disk  C:    OS\nRemovable Disk    E:    USB_RECOVERY", kind: "output", known: true };
  }
  if (cmd === "wmic logicaldisk get caption,freespace,size") {
    return { output: "Caption  FreeSpace      Size\nC:       11824578560    255030124544\nD:       742552641536   1000202039296", kind: "output", known: true };
  }
  if (cmd === "cleanmgr") {
    return { output: "Disk Cleanup launched...\nTemporary files removed: 4.3 GB\nWindows Update cache removed: 1.9 GB", kind: "success", known: true };
  }
  if (cmd === "sfc /scannow") {
    return { output: "Beginning system scan. This process will take some time.\nVerification 100% complete.\nWindows Resource Protection found corrupt files and successfully repaired them.", kind: "success", known: true };
  }
  if (cmd === "dism /online /cleanup-image /restorehealth") {
    return { output: "Deployment Image Servicing and Management tool\n[==========================100.0%==========================]\nThe restore operation completed successfully.", kind: "success", known: true };
  }
  if (cmd === "dism /online /cleanup-image /startcomponentcleanup") {
    return { output: "Component Store cleanup completed.\nReclaimable packages removed.", kind: "success", known: true };
  }
  if (cmd === "wmic printer get name,workoffline") {
    return { output: "Name              WorkOffline\nHP LaserJet Pro   TRUE", kind: "output", known: true };
  }
  if (cmd === "get-service spooler" || cmd === "sc query spooler") {
    return { output: "SERVICE_NAME: spooler\nSTATE              : 1  STOPPED", kind: "output", known: true };
  }
  if (cmd === "sc qc spooler") {
    return { output: "SERVICE_NAME: spooler\nSTART_TYPE         : AUTO_START\nDEPENDENCIES       : RPCSS", kind: "output", known: true };
  }
  if (cmd === "net stop spooler") {
    return { output: "The Print Spooler service was stopped successfully.", kind: "success", known: true };
  }
  if (cmd === "net start spooler") {
    return { output: "The Print Spooler service was started successfully.", kind: "success", known: true };
  }
  if (cmd === "del /q %systemroot%\\system32\\spool\\printers\\*") {
    return { output: "Deleted queued spool files from C:\\Windows\\System32\\spool\\PRINTERS", kind: "success", known: true };
  }
  if (cmd === "attrib -h -r -s /s /d *.*") {
    return { output: "File attributes updated. Hidden/system/read-only flags removed.", kind: "success", known: true };
  }
  if (cmd === "dir /a") {
    return { output: "Directory of E:\\\n05/08/2026  08:42 AM    <DIR>          .\n05/08/2026  08:42 AM    <DIR>          ..\n05/08/2026  08:37 AM           253,944 Q3_Budget_Final.xlsx", kind: "output", known: true };
  }
  if (cmd === "xcopy *.* recovered /e /i /h") {
    return { output: "32 File(s) copied to E:\\recovered", kind: "success", known: true };
  }
  if (cmd === "net user jdoe /domain") {
    return { output: "User name                    jdoe\nAccount active               Yes\nAccount expires              Never\nPassword last set            05/08/2026 08:11", kind: "output", known: true };
  }
  if (cmd === "search-adaccount -lockedout") {
    return { output: "SamAccountName  ObjectClass\njdoe            user", kind: "output", known: true };
  }
  if (cmd === "unlock-adaccount -identity jdoe") {
    return { output: "Account 'jdoe' unlocked successfully.", kind: "success", known: true };
  }
  if (cmd === "set-adaccountpassword -identity jdoe -reset") {
    return { output: "Temporary password reset completed for jdoe.", kind: "success", known: true };
  }
  if (cmd === "ssh admin@10.10.1.50") {
    return { output: "Connected to web-prod-01 (10.10.1.50).", kind: "output", known: true };
  }
  if (cmd === "systemctl status nginx") {
    return { output: "● nginx.service - nginx\n   Loaded: loaded\n   Active: failed (Result: exit-code)\n   Docs: man:nginx(8)", kind: "error", known: true };
  }
  if (cmd === "tail -n 50 /var/log/nginx/error.log") {
    return { output: "[emerg] bind() to 0.0.0.0:443 failed (98: Address already in use)", kind: "error", known: true };
  }
  if (cmd === "netstat -tulpn | grep 443") {
    return { output: "tcp 0 0 0.0.0.0:443 0.0.0.0:* LISTEN 8821/orphan-httpd", kind: "output", known: true };
  }
  if (cmd === "systemctl restart nginx") {
    return { output: "nginx restarted successfully.\nActive: active (running)", kind: "success", known: true };
  }
  if (cmd === "tasklist /svc") {
    return { output: "Image Name                 PID  Services\nsvchost.exe               1120  Dnscache\nexplorer.exe              5584  N/A\nunknownproc.exe           7724  N/A", kind: "output", known: true };
  }
  if (cmd === "wmic process get name,processid,parentprocessid") {
    return { output: "Name               ParentProcessId  ProcessId\nunknownproc.exe     5584             7724\npowershell.exe      3500             9044", kind: "output", known: true };
  }
  if (cmd === "netstat -ano") {
    return { output: "TCP 10.10.10.25:49722 198.51.100.12:443 ESTABLISHED 7724", kind: "output", known: true };
  }
  if (cmd === "mrt /f:y") {
    return { output: "Microsoft Malicious Software Removal Tool\nFull scan completed.\nThreats detected: 0", kind: "success", known: true };
  }
  if (cmd === "eventvwr.msc") {
    return { output: "Event Viewer opened. Review System/Application logs near incident timestamp.", kind: "output", known: true };
  }
  if (cmd === "nslookup intranet.company.local") {
    return { output: "Server: dns.company.local\nAddress: 10.10.10.53\nName: intranet.company.local\nAddress: 10.10.1.50", kind: "output", known: true };
  }
  if (cmd === "ping 10.10.1.50") {
    return { output: "Request timed out.\nRequest timed out.\nPackets: Sent = 4, Received = 0, Lost = 4 (100% loss)", kind: "error", known: true };
  }
  return {
    output: `'${command}' is not recognized in this simulation context. Type 'help' for supported commands.`,
    kind: "error",
    known: false
  };
}

function classifyTerminalOutput(output = "") {
  const text = String(output || "").toLowerCase();
  if (!text) return "output";
  if (text.includes("not recognized") || text.includes("error") || text.includes("failed")) return "error";
  if (text.includes("success") || text.includes("completed") || text.includes("repaired") || text.includes("resolved")) return "success";
  return "output";
}

function formatTerminalCommandForDisplay(cmd = "") {
  const text = String(cmd || "").trim();
  if (!text) {
    return "";
  }
  return text;
}

function stripHtml(value = "") {
  return String(value || "").replace(/<[^>]+>/g, "").trim();
}

const SIM_ACTION_LIBRARY = {
  network: [
    {
      label: "Adapter Diagnostics",
      output: "NIC status and driver health validated. Link is active and adapter responds normally.",
      keywords: ["adapter", "ethernet", "wifi", "network", "lan"]
    },
    {
      label: "DHCP Lease Renew",
      output: "IP lease renewed successfully. Host received a valid address, gateway, and DNS values.",
      keywords: ["dhcp", "ip renew", "renew", "address"]
    },
    {
      label: "DNS Cache Reset",
      output: "Local resolver cache flushed and registration refreshed.",
      keywords: ["dns", "name resolution", "resolve", "lookup"]
    },
    {
      label: "Gateway Reachability Test",
      output: "Gateway latency is stable and local route is healthy.",
      keywords: ["gateway", "ping", "router", "route"]
    },
    {
      label: "Network Escalation Packet",
      output: "Escalation handoff drafted with traces, lease details, and replication notes.",
      keywords: ["escalate", "handoff", "network team"]
    }
  ],
  email: [
    {
      label: "Mailbox Access Probe",
      output: "Mailbox access via OWA succeeds. Server-side mailbox is available.",
      keywords: ["owa", "mailbox", "access", "exchange", "email"]
    },
    {
      label: "Outlook Connectivity Reset",
      output: "Client offline/online state cycled and transport session rebuilt.",
      keywords: ["outlook", "offline", "sync"]
    },
    {
      label: "Profile Repair Wizard",
      output: "Outlook profile integrity check completed with repaired account metadata.",
      keywords: ["profile", "repair", "account"]
    },
    {
      label: "Send/Receive Queue Run",
      output: "Send/receive queue processed and pending items synchronized.",
      keywords: ["send/receive", "queue", "sync"]
    }
  ],
  printer: [
    {
      label: "Printer Power & Link Check",
      output: "Printer power and interface link validated.",
      keywords: ["power", "printer", "link", "offline"]
    },
    {
      label: "Spool Queue Cleanup",
      output: "Stuck jobs removed and print queue reset.",
      keywords: ["queue", "spool", "stuck", "job"]
    },
    {
      label: "Spooler Service Restart",
      output: "Print Spooler restarted. Service dependencies are healthy.",
      keywords: ["spooler", "service", "restart"]
    },
    {
      label: "Device Online Recovery",
      output: "Device state switched to online and endpoint heartbeat restored.",
      keywords: ["online", "offline", "device"]
    },
    {
      label: "Controlled Test Print",
      output: "Test page transmitted and printer acknowledged completion.",
      keywords: ["test page", "print", "output"]
    }
  ],
  security: [
    {
      label: "Endpoint Isolation Control",
      output: "Endpoint isolated from lateral movement paths.",
      keywords: ["isolate", "contain", "endpoint", "network"]
    },
    {
      label: "Security Bridge Alert",
      output: "Security response channel notified with incident context.",
      keywords: ["security", "incident", "soc", "alert"]
    },
    {
      label: "Offline Threat Scan",
      output: "Offline scanning routine completed and suspicious artifacts tagged.",
      keywords: ["scan", "malware", "virus", "threat"]
    },
    {
      label: "Credential Recovery Workflow",
      output: "Credential reset sequence initiated from trusted endpoint guidance.",
      keywords: ["credential", "password", "reset", "account"]
    },
    {
      label: "Reimage & Restore Plan",
      output: "Reimage recommendation prepared with backup and restore checkpoints.",
      keywords: ["reimage", "restore", "clean"]
    }
  ],
  hardware: [
    {
      label: "Power Cycle Controller",
      output: "Forced power cycle executed to clear transient kernel lock state.",
      keywords: ["force restart", "hold power", "power button", "restart"]
    },
    {
      label: "Boot Interrupt Trigger",
      output: "Boot interruption succeeded and recovery flow became available.",
      keywords: ["f8", "shift+f8", "automatic repair", "interrupt boot", "recovery"]
    },
    {
      label: "Recovery Menu Navigator",
      output: "Reached Troubleshoot > Advanced options > Startup Settings path.",
      keywords: ["troubleshoot", "advanced options", "startup settings", "restart"]
    },
    {
      label: "Safe Mode Launcher",
      output: "Safe Mode selected and minimal driver stack started.",
      keywords: ["safe mode", "press 4", "f4"]
    },
    {
      label: "Dump & Driver Analyzer",
      output: "Crash dump metadata reviewed; suspected driver class identified for next checks.",
      keywords: ["bsod", "blue screen", "dump", "driver", "crash"]
    }
  ],
  general: [
    {
      label: "Prerequisite Verifier",
      output: "Baseline prerequisites validated before execution.",
      keywords: ["check", "verify", "prerequisite"]
    },
    {
      label: "Step Execution Engine",
      output: "Current troubleshooting action executed and tracked.",
      keywords: ["run", "execute", "step", "next"]
    },
    {
      label: "Outcome Recorder",
      output: "Observed result captured in simulation evidence log.",
      keywords: ["result", "outcome", "capture"]
    },
    {
      label: "Escalation Draft Tool",
      output: "Escalation narrative prepared with completed diagnostics.",
      keywords: ["escalate", "handoff"]
    }
  ]
};

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek}w ago`;
  return formatDateTime(isoString);
}

function normalizeForHistory(messages) {
  const blockedPrompts = new Set();
  messages.forEach((message, index) => {
    if (message?.role !== "ai" || message?.type !== "policy") {
      return;
    }

    const explicitPrompt = String(message?.userPromptText || "").trim().toLowerCase();
    if (explicitPrompt) {
      blockedPrompts.add(explicitPrompt);
    }

    const previous = messages[index - 1];
    if (previous?.role === "user" && previous?.type === "text") {
      const previousPrompt = String(previous.text || "").trim().toLowerCase();
      if (previousPrompt) {
        blockedPrompts.add(previousPrompt);
      }
    }
  });

  return messages
    .filter((m) => {
      if (m.type !== "text") {
        return false;
      }
      if (m.role !== "user") {
        return true;
      }
      const userPrompt = String(m.text || "").trim().toLowerCase();
      return userPrompt ? !blockedPrompts.has(userPrompt) : true;
    })
    .slice(-10)
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text
    }));
}

function pickRandomQuestions(count = 6) {
  const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function pickSuggestionQuestion(suggestion = {}) {
  const variants = QUESTION_VARIANTS_BY_TITLE[suggestion?.title];
  if (Array.isArray(variants) && variants.length > 0) {
    const index = Math.floor(Math.random() * variants.length);
    return variants[index];
  }
  return String(suggestion?.question || "").trim();
}

function firstUserPrompt(messages) {
  return messages.find((m) => m.role === "user" && m.type === "text")?.text || "";
}

function createSession(title = "New Chat", options = {}) {
  const now = new Date().toISOString();
  const isSimulationSession = Boolean(options?.isSimulationSession);
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    actionableAiMessageId: null,
    hasSimulation: isSimulationSession,
    isSimulationSession,
    userEditCount: 0,
    isFavorite: false,
    simulationStepsByMessage: {},
    simulationCanvasByMessage: {},
    suggestedQuestions: pickRandomQuestions()
  };
}

function normalizeLoadedSession(session, idx) {
  const now = new Date().toISOString();
  const parsedMessages = Array.isArray(session?.messages) ? session.messages : [];
  const firstPrompt = firstUserPrompt(parsedMessages);
  const incomingTitle = typeof session?.title === "string" ? session.title.trim() : "";
  const hasGenericTitle = /^Session\s+\d+$/i.test(incomingTitle);
  const computedTitle = firstPrompt
    ? sessionTitleFromMessage(firstPrompt)
    : incomingTitle && !hasGenericTitle
      ? incomingTitle
      : "New Chat";

  return {
    id: session?.id || `session-${Date.now()}-${idx}`,
    title: computedTitle,
    createdAt: session?.createdAt || now,
    updatedAt: session?.updatedAt || now,
    messages: parsedMessages,
    actionableAiMessageId: session?.actionableAiMessageId || null,
    hasSimulation: Boolean(session?.hasSimulation),
    isSimulationSession: Boolean(session?.isSimulationSession || session?.hasSimulation),
    userEditCount: Math.max(0, Number(session?.userEditCount || 0)),
    isFavorite: Boolean(session?.isFavorite),
    simulationStepsByMessage:
      session?.simulationStepsByMessage && typeof session.simulationStepsByMessage === "object"
        ? session.simulationStepsByMessage
        : {},
    simulationCanvasByMessage:
      session?.simulationCanvasByMessage && typeof session.simulationCanvasByMessage === "object"
        ? session.simulationCanvasByMessage
        : {},
    suggestedQuestions:
      Array.isArray(session?.suggestedQuestions) && session.suggestedQuestions.length > 0
        ? session.suggestedQuestions
        : pickRandomQuestions()
  };
}

function sessionTitleFromMessage(text) {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "New Chat";
  }
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}...` : cleaned;
}

function sessionPreview(session) {
  if (!session.messages.length) {
    return "No messages yet";
  }
  const firstUser = session.messages.find((m) => m.role === "user" && m.type === "text");
  if (!firstUser) {
    return "No user prompt yet";
  }
  return sessionTitleFromMessage(firstUser.text);
}

function SuggestionIcon({ label }) {
  const key = String(label || "").toLowerCase();

  const icons = {
    account: (
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.31 0-6 1.79-6 4v1h12v-1c0-2.21-2.69-4-6-4z" />
    ),
    hardware: (
      <path d="M4 7h16v8H4zm2 10h12v2H6zm3-12h6v2H9z" />
    ),
    network: (
      <path d="M12 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6-4a10 10 0 0 1 12 0m-9-3a6 6 0 0 1 6 0M4 11a14 14 0 0 1 16 0" />
    ),
    peripheral: (
      <path d="M6 8h12v8H6zm2 10h8m-6-6h4" />
    ),
    performance: (
      <path d="M4 18h16M7 14l3-3 2 2 5-5" />
    ),
    critical: (
      <path d="M12 3 2 20h20L12 3zm1 13h-2v-2h2zm0-4h-2v-4h2z" />
    ),
    email: (
      <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
    ),
    security: (
      <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3zm0 5a2 2 0 0 0-2 2v1h4v-1a2 2 0 0 0-2-2zm-3 4h6v4H9z" />
    ),
    access: (
      <path d="M8 12h8m-2-2 2 2-2 2M5 5h8v2H7v10h6v2H5z" />
    ),
    server: (
      <path d="M4 5h16v4H4zm0 6h16v4H4zm0 6h16v2H4M7 7h2m0 6h2" />
    ),
    files: (
      <path d="M6 3h8l4 4v14H6zM14 3v5h5M8 13h8M8 17h8" />
    ),
    software: (
      <path d="M4 7h16v10H4zM9 7V5h6v2M8 12h8M12 10v4" />
    )
  };

  return (
    <span className="quick-icon-wrap" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="quick-icon">
        {icons[key] || <path d="M12 3v18M3 12h18" />}
      </svg>
    </span>
  );
}

function SidebarTypeIcon({ type }) {
  if (type === "simulation") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M10 9.4 15.2 12 10 14.6z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20c4.42 0 8-3.13 8-7s-3.58-7-8-7-8 3.13-8 7c0 1.74.73 3.33 1.94 4.55L5 20l2.49-1.24A9.2 9.2 0 0 0 12 20z" />
    </svg>
  );
}

function EmptySlot({ type }) {
  const config = type === "simulation"
    ? {
        title: "No simulations yet",
        description: "Pick a ticket scenario to practice your skills."
      }
    : {
        title: "No chats yet",
        description: "Start a conversation to get help with any issue."
      };

  return (
    <div className="sidebar-empty-slot" aria-live="polite">
      <div className="sidebar-empty-icon">
        <SidebarTypeIcon type={type} />
      </div>
      <div className="sidebar-empty-title">{config.title}</div>
      <div className="sidebar-empty-desc">{config.description}</div>
    </div>
  );
}

function SessionItem({
  item,
  type,
  isActive,
  menuOpen,
  onSelect,
  onMenuToggle,
  onRename,
  onFavorite,
  onDelete
}) {
  return (
    <div className={`sidebar-session-row ${isActive ? "active" : ""} ${menuOpen ? "menu-open" : ""}`}>
      <button className="sidebar-session-btn hd-btn-reset" onClick={onSelect}>
        <div className={`sidebar-session-icon type-${type}`}>
          <SidebarTypeIcon type={type} />
        </div>
        <div className="sidebar-session-body">
          <div className="sidebar-session-title">
            {item.title}
            {item.isFavorite ? <span className="session-fav-dot" title="Favorite">★</span> : null}
          </div>
          <div className="sidebar-session-time">{formatRelativeTime(item.updatedAt)}</div>
        </div>
      </button>

      <div className="sidebar-session-menu-wrap">
        <button
          className="session-menu-btn hd-btn-reset"
          title="Session actions"
          aria-label="Session actions"
          onClick={onMenuToggle}
        >
          <span />
          <span />
          <span />
        </button>
        {menuOpen ? (
          <div className="session-menu-popover" onClick={(e) => e.stopPropagation()}>
            <button className="session-menu-item hd-btn-reset" onClick={onRename}>
              Rename
            </button>
            <button className="session-menu-item hd-btn-reset" onClick={onFavorite}>
              {item.isFavorite ? "Remove Favorite" : "Favorite"}
            </button>
            <button className="session-menu-item danger hd-btn-reset" onClick={onDelete}>
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SidebarGroup({
  label,
  type,
  icon,
  items,
  hasAnyItems,
  sidebarCollapsed,
  collapsed,
  searchActive,
  activeSessionId,
  openSessionMenuId,
  onToggle,
  onAdd,
  onSelectItem,
  onToggleMenu,
  onRename,
  onFavorite,
  onDelete
}) {
  const noResults = searchActive && items.length === 0;
  const hasSessionItems = !noResults && hasAnyItems;
  const showMoreHint = hasSessionItems && items.length > 3;
  const createLabel = type === "simulation" ? "New Simulation" : "New Chat";
  const createIcon = type === "simulation" ? ">" : "+";
  const toggleLabel = sidebarCollapsed ? createLabel : `Toggle ${label}`;
  const handleGroupToggle = sidebarCollapsed ? onAdd : onToggle;

  return (
    <section className="sidebar-group">
      <div className="sidebar-group-header">
        <button className="sidebar-group-toggle hd-btn-reset" onClick={handleGroupToggle} aria-label={toggleLabel} title={toggleLabel}>
          <span className={`sidebar-group-chevron ${collapsed ? "is-collapsed" : ""}`}>⌄</span>
          <span className="sidebar-group-icon">{icon}</span>
          <span className="sidebar-group-label">{label}</span>
        </button>
      </div>

      {!collapsed ? (
        <>
          {!noResults ? (
            <button
              className={`sidebar-create-card hd-btn-reset type-${type}`}
              onClick={onAdd}
              aria-label={createLabel}
              title={createLabel}
            >
              <span className="sidebar-create-card-icon" aria-hidden="true">{createIcon}</span>
              <span className="sidebar-create-card-label">{createLabel}</span>
            </button>
          ) : null}
          <div
            className={[
              "sidebar-group-list",
              !noResults && !hasAnyItems ? "is-empty" : "",
              hasSessionItems ? "has-session-items" : "",
              showMoreHint ? "show-more-hint" : ""
            ].filter(Boolean).join(" ")}
          >
            {noResults ? (
              <div className="sidebar-group-no-results">No results in {label}</div>
            ) : !hasAnyItems ? (
              <EmptySlot type={type} />
            ) : (
              items.map((item) => (
                <SessionItem
                  key={item.id}
                  item={item}
                  type={type}
                  isActive={activeSessionId === item.id}
                  menuOpen={openSessionMenuId === item.id}
                  onSelect={() => onSelectItem(item)}
                  onMenuToggle={(e) => {
                    e.stopPropagation();
                    onToggleMenu(item.id);
                  }}
                  onRename={() => onRename(item.id)}
                  onFavorite={() => onFavorite(item.id)}
                  onDelete={() => onDelete(item.id)}
                />
              ))
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

function normalizeAssistantText(rawText) {
  const input = String(rawText || "").replace(/\r\n/g, "\n").trim();
  if (!input) {
    return "";
  }

  if (/```[\s\S]*```/.test(input)) {
    return input;
  }

  return input
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\)\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferScenarioType(seedText = "") {
  const text = String(seedText || "").toLowerCase();
  if (/(boot|hardware|bios|power supply|bsod|blue screen|driver|ram|gpu|device|safe mode|startup settings|automatic repair)/i.test(text)) {
    return "hardware";
  }
  if (/(internet|network|dns|dhcp|wifi|router|vpn|gateway|ipconfig|ping)/i.test(text)) {
    return "network";
  }
  if (/(outlook|email|exchange|mailbox|owa|send\/receive|smtp|imap)/i.test(text)) {
    return "email";
  }
  if (/(printer|spooler|print queue|paper|offline print)/i.test(text)) {
    return "printer";
  }
  if (/(malware|virus|security|unauthorized|incident|soc|breach|phishing)/i.test(text)) {
    return "security";
  }
  return "general";
}

function detectScenarioTypeFromContext({ steps = [], sourceText = "", firstPromptText = "" }) {
  const joinedSteps = Array.isArray(steps) ? steps.join(" ") : "";
  const directType = inferScenarioType(`${sourceText} ${joinedSteps}`);
  if (directType !== "general") {
    return directType;
  }
  return inferScenarioType(`${firstPromptText} ${sourceText} ${joinedSteps}`);
}

function createSimulationCanvasState(steps, scenarioType, meta = {}) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  return {
    scenarioType: scenarioType || "general",
    simulationId: meta?.simulationId || "",
    ticketTitle: meta?.ticketTitle || "",
    currentIndex: 0,
    completed: safeSteps.map(() => false),
    evidence: [],
    actionsTakenByStep: safeSteps.map(() => []),
    stepOutcomes: safeSteps.map(() => null),
    resolved: false,
    createdAt: new Date().toISOString()
  };
}

function normalizeSimulationCanvasState(state, steps, fallbackType) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const completed = Array.isArray(state?.completed) ? state.completed : [];
  const actions = Array.isArray(state?.actionsTakenByStep) ? state.actionsTakenByStep : [];
  const outcomes = Array.isArray(state?.stepOutcomes) ? state.stepOutcomes : [];

  return {
    scenarioType: state?.scenarioType || fallbackType || "general",
    simulationId: state?.simulationId || "",
    ticketTitle: state?.ticketTitle || "",
    currentIndex: Number.isInteger(state?.currentIndex) ? Math.max(0, state.currentIndex) : 0,
    completed: safeSteps.map((_, idx) => Boolean(completed[idx])),
    evidence: Array.isArray(state?.evidence) ? state.evidence : [],
    actionsTakenByStep: safeSteps.map((_, idx) => (Array.isArray(actions[idx]) ? actions[idx] : [])),
    stepOutcomes: safeSteps.map((_, idx) => (outcomes[idx] && typeof outcomes[idx] === "object" ? outcomes[idx] : null)),
    resolved: Boolean(state?.resolved),
    stepDetails: Array.isArray(state?.stepDetails) ? state.stepDetails : [],
    createdAt: state?.createdAt || new Date().toISOString()
  };
}

function getActionsForStep(scenarioType, stepText) {
  const base = SIM_ACTION_LIBRARY[scenarioType] || SIM_ACTION_LIBRARY.general;
  const text = String(stepText || "").toLowerCase();
  const scored = base.map((action) => {
    const keywordHits = Array.isArray(action.keywords)
      ? action.keywords.reduce((acc, keyword) => (text.includes(String(keyword).toLowerCase()) ? acc + 1 : acc), 0)
      : 0;
    return { action, score: keywordHits };
  });
  const prioritized = scored
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.action);
  return prioritized.slice(0, 4);
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const api = useAxios();
  const location = useLocation();
  const chatWrapRef = useRef(null);
  const textareaRef = useRef(null);
  const editTextareaRef = useRef(null);
  const accountMenuRef = useRef(null);
  const autoAdvanceTimeoutRef = useRef(null);
  const sessionsSaveTimerRef = useRef(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [sessionsHydrated, setSessionsHydrated] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState("");

  const [stepModalOpen, setStepModalOpen] = useState(false);
  const [modalSteps, setModalSteps] = useState([]);
  const [modalStepDetails, setModalStepDetails] = useState([]);
  const [modalSourceTitle, setModalSourceTitle] = useState("AI Response");
  const [modalActiveStep, setModalActiveStep] = useState(0);
  const [modalMessageId, setModalMessageId] = useState(null);
  const [modalCanvasState, setModalCanvasState] = useState(null);
  const [terminalQueuedCommand, setTerminalQueuedCommand] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [openSessionMenuId, setOpenSessionMenuId] = useState(null);
  const [theme, setTheme] = useState("dark");
  const [showSimulationCatalog, setShowSimulationCatalog] = useState(false);
  const [pendingSimulationCreation, setPendingSimulationCreation] = useState(false);
  const [mobileView, setMobileView] = useState(false);
  const [sidebarSearchInput, setSidebarSearchInput] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarGroupsCollapsed, setSidebarGroupsCollapsed] = useState({
    chats: false,
    simulations: false
  });

  const denied = useMemo(() => new URLSearchParams(location.search).get("denied") === "1", [location.search]);
  const requestedSessionId = useMemo(
    () => new URLSearchParams(location.search).get("session") || "",
    [location.search]
  );
  const storageKey = useMemo(
    () => (user?.id ? `${SESSION_STORAGE_PREFIX}${user.id}` : null),
    [user?.id]
  );
  const sidebarPrefsKey = useMemo(
    () => (user?.id ? `${SIDEBAR_GROUP_PREFS_PREFIX}${user.id}` : null),
    [user?.id]
  );

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );
  const isSimulationSession = Boolean(currentSession?.isSimulationSession);
  const messages = currentSession?.messages || [];
  const showWelcome = messages.length === 0;
  const topbarSessionTitle = currentSession?.title || (showSimulationCatalog ? "Simulation Tickets" : "New Chat");
  const chatSessions = useMemo(() => sessions.filter((session) => !session.isSimulationSession), [sessions]);
  const simulationSessions = useMemo(() => sessions.filter((session) => session.isSimulationSession), [sessions]);
  const searchActive = sidebarSearch.trim().length > 0;

  const filteredChatSessions = useMemo(() => {
    const term = sidebarSearch.trim().toLowerCase();
    if (!term) {
      return chatSessions;
    }
    return chatSessions.filter((session) => {
      const title = String(session.title || "").toLowerCase();
      const preview = String(sessionPreview(session) || "").toLowerCase();
      return title.includes(term) || preview.includes(term);
    });
  }, [chatSessions, sidebarSearch]);

  const filteredSimulationSessions = useMemo(() => {
    const term = sidebarSearch.trim().toLowerCase();
    if (!term) {
      return simulationSessions;
    }
    return simulationSessions.filter((session) => {
      const title = String(session.title || "").toLowerCase();
      const preview = String(sessionPreview(session) || "").toLowerCase();
      return title.includes(term) || preview.includes(term);
    });
  }, [simulationSessions, sidebarSearch]);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const media = window.matchMedia("(max-width: 880px)");
    const syncLayout = (eventOrMedia) => {
      const isMobile = Boolean(eventOrMedia.matches);
      setMobileView(isMobile);
      setSidebarCollapsed(isMobile);
    };
    syncLayout(media);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncLayout);
      return () => media.removeEventListener("change", syncLayout);
    }
    media.addListener(syncLayout);
    return () => media.removeListener(syncLayout);
  }, []);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false);
      }
      if (!event.target.closest(".session-menu-wrap") && !event.target.closest(".sidebar-session-menu-wrap")) {
        setOpenSessionMenuId(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSidebarSearch(sidebarSearchInput);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [sidebarSearchInput]);

  useEffect(() => {
    if (!sidebarPrefsKey) {
      return;
    }
    try {
      const raw = localStorage.getItem(sidebarPrefsKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      setSidebarGroupsCollapsed({
        chats: Boolean(parsed?.chats),
        simulations: Boolean(parsed?.simulations)
      });
    } catch (_err) {
      // ignore malformed local preference values
    }
  }, [sidebarPrefsKey]);

  useEffect(() => {
    if (!sidebarPrefsKey) {
      return;
    }
    localStorage.setItem(sidebarPrefsKey, JSON.stringify(sidebarGroupsCollapsed));
  }, [sidebarGroupsCollapsed, sidebarPrefsKey]);

  useEffect(() => {
    if (!user?.id) {
      setSessions([]);
      setActiveSessionId("");
      setSessionsHydrated(false);
      return;
    }

    let cancelled = false;
    setSessionsHydrated(false);

    const loadSessions = async () => {
      try {
        const response = await api.get("/api/sessions");
        let source = Array.isArray(response.data?.sessions) ? response.data.sessions : [];

        // One-time migration path from legacy local cache.
        if (source.length === 0 && storageKey) {
          try {
            const raw = localStorage.getItem(storageKey);
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed) && parsed.length > 0) {
              source = parsed;
              await api.put("/api/sessions", { sessions: source });
            }
          } catch (_migrationErr) {
            // ignore local cache parse errors
          }
        }

        if (cancelled) {
          return;
        }

        if (source.length > 0) {
          const normalized = source.map((session, idx) => normalizeLoadedSession(session, idx));
          setSessions(normalized);
          setActiveSessionId((prev) => prev || normalized[0].id);
        } else {
          setSessions([]);
          setActiveSessionId("");
        }
      } catch (_err) {
        if (!cancelled) {
          setSessions([]);
          setActiveSessionId("");
        }
      } finally {
        if (!cancelled) {
          setSessionsHydrated(true);
        }
      }
    };

    loadSessions();

    return () => {
      cancelled = true;
    };
  }, [api, storageKey, user?.id]);

  useEffect(() => {
    if (!user?.id || !sessionsHydrated) {
      return;
    }

    if (sessionsSaveTimerRef.current) {
      window.clearTimeout(sessionsSaveTimerRef.current);
    }

    sessionsSaveTimerRef.current = window.setTimeout(async () => {
      try {
        await api.put("/api/sessions", { sessions });
        if (storageKey) {
          localStorage.setItem(storageKey, JSON.stringify(sessions));
        }
      } catch (_err) {
        // best-effort save
      }
    }, 250);

    return () => {
      if (sessionsSaveTimerRef.current) {
        window.clearTimeout(sessionsSaveTimerRef.current);
        sessionsSaveTimerRef.current = null;
      }
    };
  }, [api, sessions, sessionsHydrated, storageKey, user?.id]);

  useEffect(() => {
    if (!sessionsHydrated || !requestedSessionId) {
      return;
    }
    const exists = sessions.some((session) => session.id === requestedSessionId);
    if (exists && activeSessionId !== requestedSessionId) {
      setActiveSessionId(requestedSessionId);
    }
  }, [sessionsHydrated, requestedSessionId, sessions, activeSessionId]);

  useEffect(() => {
    if (!chatWrapRef.current) {
      return;
    }
    chatWrapRef.current.scrollTop = chatWrapRef.current.scrollHeight;
  }, [messages.length, typing, activeSessionId]);

  useEffect(() => {
    if (!currentSession) {
      return;
    }
    if (currentSession.isSimulationSession) {
      loadSimulationWorkspaceFromSession(currentSession);
      return;
    }
    setStepModalOpen(false);
    setShowSimulationCatalog(false);
  }, [activeSessionId]);

  const ensureSession = () => {
    if (currentSession) {
      return currentSession;
    }
    const fresh = createSession();
    setSessions((prev) => [fresh, ...prev]);
    setActiveSessionId(fresh.id);
    return fresh;
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  };

  const autoResizeEditTextarea = () => {
    const el = editTextareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`;
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, [input, showWelcome, showSimulationCatalog]);

  useEffect(() => {
    autoResizeEditTextarea();
  }, [editingMessageId, editingText]);

  const updateMessageById = (messageId, updater) => {
    let didUpdate = false;
    setSessions((prev) =>
      prev.map((session) => {
        let touched = false;
        const nextMessages = session.messages.map((message) => {
          if (message.id !== messageId) {
            return message;
          }
          touched = true;
          return updater(message, session);
        });
        if (!touched) {
          return session;
        }
        didUpdate = true;
        return {
          ...session,
          updatedAt: new Date().toISOString(),
          messages: nextMessages
        };
      })
    );
    return didUpdate;
  };

  const copyText = async (messageId, text) => {
    const payload = String(text || "").trim();
    if (!payload) {
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        const fallback = document.createElement("textarea");
        fallback.value = payload;
        fallback.setAttribute("readonly", "");
        fallback.style.position = "absolute";
        fallback.style.left = "-9999px";
        document.body.appendChild(fallback);
        fallback.select();
        document.execCommand("copy");
        document.body.removeChild(fallback);
      }
      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId((prev) => (prev === messageId ? "" : prev));
      }, 1400);
    } catch (_err) {
      setCopiedMessageId("");
    }
  };

  const startEditingUserMessage = (msg) => {
    const remaining = Math.max(0, 2 - Number(currentSession?.userEditCount || 0));
    if (remaining <= 0) {
      return;
    }
    setEditingMessageId(msg.id);
    setEditingText(String(msg.text || ""));
  };

  const cancelEditingUserMessage = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const saveEditedUserMessage = () => {
    const nextText = editingText.trim();
    if (!editingMessageId || !nextText) {
      return;
    }
    setSessions((prev) =>
      prev.map((session) => {
        const messageExists = session.messages.some((message) => message.id === editingMessageId);
        if (!messageExists) {
          return session;
        }
        const currentEditCount = Math.max(0, Number(session.userEditCount || 0));
        if (currentEditCount >= 2) {
          return session;
        }
        return {
          ...session,
          updatedAt: new Date().toISOString(),
          userEditCount: currentEditCount + 1,
          messages: session.messages.map((message) =>
            message.id === editingMessageId
              ? {
                  ...message,
                  text: nextText,
                  time: formatTime()
                }
              : message
          )
        };
      })
    );
    setEditingMessageId(null);
    setEditingText("");
  };

  const toggleStepCompletion = (messageId, stepIndex, stepCount) => {
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= stepCount) {
      return;
    }
    updateMessageById(messageId, (message) => {
      const completion = Array.from(
        { length: stepCount },
        (_, idx) => Boolean(Array.isArray(message.stepCompletion) ? message.stepCompletion[idx] : false)
      );
      completion[stepIndex] = !completion[stepIndex];
      return {
        ...message,
        stepCompletion: completion
      };
    });
  };

  const appendMessageToSession = (sessionId, message) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }
        const hasUserPromptAlready = session.messages.some((item) => item.role === "user" && item.type === "text");
        const nextTitle =
          !hasUserPromptAlready && message.role === "user"
            ? sessionTitleFromMessage(message.text)
            : session.title;
        return {
          ...session,
          title: nextTitle,
          updatedAt: new Date().toISOString(),
          messages: [...session.messages, message]
        };
      })
    );
  };

  const pushAiMessage = (sessionId, text, type = "text", context = {}) => {
    const aiMessageId = `${Date.now()}-ai`;
    const cleanedText = type === "text" ? normalizeAssistantText(text) : String(text || "");
    const shouldOfferSimulation =
      type === "text" ? shouldOfferInteractiveSimulation(cleanedText, context) : false;
    appendMessageToSession(sessionId, {
      id: aiMessageId,
      role: "ai",
      type,
      text: cleanedText,
      time: formatTime(),
      userPromptText: String(context?.userPromptText || ""),
      firstPromptText: String(context?.firstPromptText || "")
    });
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              actionableAiMessageId: shouldOfferSimulation ? aiMessageId : null
            }
          : session
      )
    );
  };

  const sendMessage = async (overrideText = "") => {
    const text = (overrideText || input).trim();
    if (!text || typing) {
      return;
    }

    const targetSession = ensureSession();
    const sessionId = targetSession.id;
    const previousMessages = targetSession.messages;
    const firstPromptContext = firstUserPrompt([
      ...previousMessages,
      { role: "user", type: "text", text }
    ]);

    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              actionableAiMessageId: null
            }
          : session
      )
    );

    appendMessageToSession(sessionId, {
      id: `${Date.now()}-user`,
      role: "user",
      type: "text",
      text,
      time: formatTime()
    });

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setTyping(true);

    try {
      const history = normalizeForHistory(previousMessages);
      const response = await api.post("/api/ai/chat", {
        message: text,
        history
      });
      if (response.data?.policy?.blocked) {
        pushAiMessage(sessionId, response.data.reply || "Request blocked by policy.", "policy", {
          userPromptText: text,
          firstPromptText: firstPromptContext
        });
      } else {
        pushAiMessage(sessionId, response.data.reply || "No response generated.", "text", {
          userPromptText: text,
          firstPromptText: firstPromptContext
        });
      }
    } catch (error) {
      if (!error.response) {
        pushAiMessage(sessionId, "Connection error. Please try again.", "text", {
          userPromptText: text,
          firstPromptText: firstPromptContext
        });
      } else if (error.response.status === 503) {
        pushAiMessage(
          sessionId,
          "AI service is not configured yet. Please set AI_API_KEY on the server.",
          "text",
          {
            userPromptText: text,
            firstPromptText: firstPromptContext
          }
        );
      } else {
        pushAiMessage(sessionId, error.response.data?.message || "Unable to get AI response right now.", "text", {
          userPromptText: text,
          firstPromptText: firstPromptContext
        });
      }
    } finally {
      setTyping(false);
    }
  };

  const startSuggestedSimulation = (suggestion) => {
    setShowSimulationCatalog(false);
    const questionText = pickSuggestionQuestion(suggestion);
    const simulationId = SUGGESTED_SIMULATION_MAP[suggestion?.title];
    if (!simulationId || !simulations[simulationId]) {
      sendMessage(questionText);
      setPendingSimulationCreation(false);
      return;
    }

    const shouldCreateNewSimulationSession =
      pendingSimulationCreation || !currentSession || !currentSession.isSimulationSession;
    const targetSession = shouldCreateNewSimulationSession
      ? createSession("New Simulation", { isSimulationSession: true })
      : currentSession;
    const sessionId = targetSession.id;
    if (shouldCreateNewSimulationSession) {
      setSessions((prev) => [targetSession, ...prev]);
      setActiveSessionId(targetSession.id);
    }
    setPendingSimulationCreation(false);
    const sim = simulations[simulationId];
    const userMessageId = `${Date.now()}-user-suggested`;
    const aiMessageId = `${Date.now()}-ai-sim`;
    const steps = sim.steps.map((step) => step.title);
    const scenarioType = inferScenarioType(`${questionText} ${sim.title} ${steps.join(" ")}`);
    const canvasState = {
      ...createSimulationCanvasState(steps, scenarioType, {
        simulationId,
        ticketTitle: suggestion?.title || ""
      }),
      stepDetails: sim.steps
    };

    appendMessageToSession(sessionId, {
      id: userMessageId,
      role: "user",
      type: "text",
      text: questionText,
      time: formatTime()
    });

    appendMessageToSession(sessionId, {
      id: aiMessageId,
      role: "ai",
      type: "sim-module",
      text: `Simulation module loaded: ${sim.title}`,
      time: formatTime()
    });

    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              isSimulationSession: true,
              title: sim.title || session.title,
              hasSimulation: true,
              simulationStepsByMessage: {
                ...session.simulationStepsByMessage,
                [aiMessageId]: steps
              },
              simulationCanvasByMessage: {
                ...session.simulationCanvasByMessage,
                [aiMessageId]: canvasState
              }
            }
          : session
      )
    );

    openStepModalWithData({
      messageId: aiMessageId,
      sourceTitle: `Terminal Ticketing | ${sim.title}`,
      steps,
      scenarioType,
      canvasState,
      stepDetails: sim.steps
    });
  };

  const startNewSession = () => {
    setShowSimulationCatalog(false);
    setPendingSimulationCreation(false);
    setOpenSessionMenuId(null);
    setActiveSessionId("");
    setInput("");
    setTyping(false);
    setStepModalOpen(false);
    setModalMessageId(null);
    setModalCanvasState(null);
  };

  const startNewSimulationSession = () => {
    setOpenSessionMenuId(null);
    setPendingSimulationCreation(true);
    setActiveSessionId("");
    setShowSimulationCatalog(true);
    setStepModalOpen(false);
    setModalMessageId(null);
    setModalCanvasState(null);
    if (mobileView) {
      setSidebarCollapsed(true);
    }
  };

  function loadSimulationWorkspaceFromSession(session) {
    if (!session?.isSimulationSession) {
      return;
    }
    const canvasByMessage = session.simulationCanvasByMessage || {};
    const stepByMessage = session.simulationStepsByMessage || {};
    const messageIds = Object.keys(canvasByMessage);

    if (messageIds.length === 0) {
      setModalMessageId(null);
      setModalCanvasState(null);
      setModalSteps([]);
      setModalStepDetails([]);
      setModalSourceTitle("Simulation Workspace");
      setTerminalQueuedCommand(null);
      setShowSimulationCatalog(true);
      setStepModalOpen(false);
      return;
    }

    const selectedMessageId = messageIds
      .map((id) => ({ id, createdAt: canvasByMessage[id]?.createdAt || "" }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.id;

    if (!selectedMessageId) {
      setShowSimulationCatalog(true);
      setStepModalOpen(false);
      return;
    }

    const steps = Array.isArray(stepByMessage[selectedMessageId]) ? stepByMessage[selectedMessageId] : [];
    const existingCanvas = canvasByMessage[selectedMessageId] || {};
    const scenarioType = existingCanvas?.scenarioType || "general";
    const canvasState = normalizeSimulationCanvasState(existingCanvas, steps, scenarioType);

    setModalMessageId(selectedMessageId);
    setModalSteps(steps);
    setModalStepDetails(Array.isArray(existingCanvas?.stepDetails) ? existingCanvas.stepDetails : []);
    setModalSourceTitle(`Terminal Ticketing | ${canvasState?.ticketTitle || session?.title || "Simulation"}`);
    setTerminalQueuedCommand(null);
    setModalCanvasState(canvasState);
    setShowSimulationCatalog(false);
    setStepModalOpen(false);
  }

  const deleteSession = (sessionId) => {
    setOpenSessionMenuId(null);
    setSessions((prev) => {
      const next = prev.filter((session) => session.id !== sessionId);
      if (next.length === 0) {
        setActiveSessionId("");
        setShowSimulationCatalog(false);
        setPendingSimulationCreation(false);
        return [];
      }
      if (activeSessionId === sessionId) {
        setActiveSessionId(next[0].id);
      }
      return next;
    });
  };

  const renameSession = (sessionId) => {
    const current = sessions.find((session) => session.id === sessionId);
    if (!current) {
      return;
    }
    const inputTitle = window.prompt("Rename session title", current.title || "New Chat");
    if (inputTitle == null) {
      return;
    }
    const title = inputTitle.trim();
    if (!title) {
      return;
    }
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              title: sessionTitleFromMessage(title),
              updatedAt: new Date().toISOString()
            }
          : session
      )
    );
    setOpenSessionMenuId(null);
  };

  const toggleFavoriteSession = (sessionId) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              isFavorite: !session.isFavorite
            }
          : session
      )
    );
    setOpenSessionMenuId(null);
  };

  const extractStepsFromAiText = (text) => {
    const lines = String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const numberedOrBullets = lines
      .filter((line) => /^(\d+[\).\:-]|[-*])\s+/.test(line))
      .map((line) => line.replace(/^(\d+[\).\:-]|[-*])\s+/, "").trim())
      .filter(Boolean);

    if (numberedOrBullets.length > 0) {
      return numberedOrBullets.slice(0, 12);
    }

    const sentenceFallback = String(text || "")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 8);

    return sentenceFallback.length > 0 ? sentenceFallback : ["No steps detected from this response."];
  };

  const openStepModalWithData = ({
    messageId,
    sourceTitle,
    steps,
    scenarioType,
    canvasState,
    stepDetails = []
  }) => {
    setModalSteps(steps);
    setModalStepDetails(stepDetails);
    setModalActiveStep(0);
    setModalMessageId(messageId);
    setModalCanvasState(canvasState);
    setModalSourceTitle(sourceTitle);
    setTerminalQueuedCommand(null);
    setStepModalOpen(!isSimulationSession);
  };

  const openStepModalFromMessage = (msg) => {
    const existingSteps = currentSession?.simulationStepsByMessage?.[msg.id];
    const steps = existingSteps || extractStepsFromAiText(msg.text);
    const detectedScenarioType = detectScenarioTypeFromContext({
      steps,
      sourceText: msg.text,
      firstPromptText: firstUserPrompt(currentSession?.messages || [])
    });
    const existingCanvas = currentSession?.simulationCanvasByMessage?.[msg.id];
    const hasRecordedActions = Array.isArray(existingCanvas?.actionsTakenByStep)
      ? existingCanvas.actionsTakenByStep.some((bucket) => Array.isArray(bucket) && bucket.length > 0)
      : false;
    const scenarioType = hasRecordedActions
      ? existingCanvas?.scenarioType || detectedScenarioType
      : detectedScenarioType;
    const canvasState = existingCanvas
      ? normalizeSimulationCanvasState(existingCanvas, steps, scenarioType)
      : createSimulationCanvasState(steps, scenarioType);

    openStepModalWithData({
      messageId: msg.id,
      sourceTitle: "AI Response Steps",
      steps,
      scenarioType,
      canvasState,
      stepDetails: existingCanvas?.stepDetails || []
    });

    if (currentSession) {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentSession.id
            ? {
                ...session,
                isSimulationSession: true,
                hasSimulation: true,
                simulationStepsByMessage: {
                  ...session.simulationStepsByMessage,
                  [msg.id]: steps
                },
                simulationCanvasByMessage: {
                  ...session.simulationCanvasByMessage,
                  [msg.id]: canvasState
                }
              }
            : session
        )
      );
    }
  };

  const modalStepCount = modalSteps.length || 0;
  const modalRuntimeIndex = Number.isInteger(modalCanvasState?.currentIndex)
    ? modalCanvasState.currentIndex
    : modalActiveStep;
  const modalSafeStep = modalStepCount > 0 ? Math.min(Math.max(0, modalRuntimeIndex), modalStepCount - 1) : 0;
  const modalCompletedCount = Array.isArray(modalCanvasState?.completed)
    ? modalCanvasState.completed.filter(Boolean).length
    : 0;
  const modalResolved = Boolean(modalCanvasState?.resolved);
  const modalCompletionPct = modalStepCount > 0 ? Math.round((modalCompletedCount / modalStepCount) * 100) : 0;
  const modalProgress = modalCompletionPct;
  const modalNextRequiredStep = Array.isArray(modalCanvasState?.completed)
    ? modalCanvasState.completed.findIndex((done) => !done)
    : 0;
  const modalRequiredStep =
    modalStepCount > 0 ? (modalNextRequiredStep === -1 ? modalStepCount - 1 : modalNextRequiredStep) : 0;

  const syncModalCanvasState = (updater) => {
    setModalCanvasState((prev) => {
      if (!prev) {
        return prev;
      }
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (!next || !currentSession?.id || !modalMessageId) {
        return next;
      }
      setSessions((prevSessions) =>
        prevSessions.map((session) =>
          session.id === currentSession.id
            ? {
                ...session,
                simulationCanvasByMessage: {
                  ...session.simulationCanvasByMessage,
                  [modalMessageId]: next
                }
              }
            : session
        )
      );
      return next;
    });
  };

  const setModalStepIndex = (index) => {
    if (modalStepCount <= 0) {
      return;
    }
    const safeIndex = Math.max(0, Math.min(modalStepCount - 1, index));
    setModalActiveStep(safeIndex);
    syncModalCanvasState((prev) => ({
      ...prev,
      currentIndex: safeIndex
    }));
  };

  const handleTerminalCommand = ({ command, normalizedCommand: normalizedFromTerminal, result }) => {
    if (!command || modalStepCount <= 0) {
      return [];
    }

    const normalizedCommand = normalizedFromTerminal || normalizeCommand(command);
    const output = result?.clear ? "__CLEAR__" : String(result?.output || "");
    const isKnownCommand = Boolean(result?.known);
    const terminalFeedback = [];
    const isUtilityCommand = ["help", "clear", "cls"].includes(normalizedCommand);

    if (!isUtilityCommand && modalSafeStep !== modalRequiredStep) {
      const requiredStepDetail = modalStepDetails[modalRequiredStep] || {};
      const requiredCommands = extractExpectedCommands(modalSteps[modalRequiredStep] || "", requiredStepDetail, {
        stepIndex: modalRequiredStep,
        simulationId: modalCanvasState?.simulationId || "",
        ticketTitle: modalCanvasState?.ticketTitle || ""
      });
      const orderMessage = `Step order enforced. Complete Step ${modalRequiredStep + 1} first.`;
      const hintMessage = `Use Step ${modalRequiredStep + 1} commands: ${requiredCommands
        .slice(0, 4)
        .map(formatTerminalCommandForDisplay)
        .join(", ")}`;

      syncModalCanvasState((prev) => {
        const actionsByStep = prev.actionsTakenByStep.map((bucket) => [...bucket]);
        actionsByStep[modalSafeStep] = [
          ...(actionsByStep[modalSafeStep] || []),
          {
            label: `Command: ${command}`,
            output: "",
            time: formatTime(),
            kind: "command"
          },
          {
            label: "Output",
            output: orderMessage,
            time: formatTime(),
            kind: "error"
          },
          {
            label: "Hint",
            output: hintMessage,
            time: formatTime(),
            kind: "hint"
          }
        ];
        return {
          ...prev,
          actionsTakenByStep: actionsByStep
        };
      });

      terminalFeedback.push(orderMessage, hintMessage);
      return terminalFeedback;
    }

    const stepDetail = modalStepDetails[modalSafeStep] || {};
    const expectedCommands = extractExpectedCommands(modalSteps[modalSafeStep] || "", stepDetail, {
      stepIndex: modalSafeStep,
      simulationId: modalCanvasState?.simulationId || "",
      ticketTitle: modalCanvasState?.ticketTitle || ""
    });
    const matchesExpected = expectedCommands.some((expected) => normalizedCommand === expected);
    const stepAlreadyCompleted = Boolean(modalCanvasState?.completed?.[modalSafeStep]);
    const shouldScheduleAdvance = matchesExpected && !stepAlreadyCompleted;

    syncModalCanvasState((prev) => {
      const actionsByStep = prev.actionsTakenByStep.map((bucket) => [...bucket]);
      const stepOutcomes = Array.isArray(prev.stepOutcomes)
        ? prev.stepOutcomes.map((item) => (item ? { ...item } : null))
        : modalSteps.map(() => null);
      const nextEntries = [];
      const playbook = getSimulationPlaybook({
        ticketTitle: prev?.ticketTitle || "",
        simulationId: prev?.simulationId || ""
      });
      const playbookStep = Array.isArray(playbook) ? playbook[modalSafeStep] : null;

      if (output === "__CLEAR__") {
        actionsByStep[modalSafeStep] = [];
      } else {
        nextEntries.push(
          {
            label: `Command: ${command}`,
            output: "",
            time: formatTime(),
            kind: "command"
          },
          {
            label: "Output",
            output,
            time: formatTime(),
            kind: classifyTerminalOutput(output)
          }
        );

        if (matchesExpected && playbookStep?.result) {
          nextEntries.push({
            label: "Step Result",
            output: `Result: ${playbookStep.result}`,
            time: formatTime(),
            kind: "success"
          });
        }

        if (!matchesExpected && !["help", "clear", "cls"].includes(normalizedCommand)) {
          const guide = expectedCommands.slice(0, 4).map(formatTerminalCommandForDisplay).join(", ");
          const hintMessage = isKnownCommand
            ? `Command executed, but not for this step. Try: ${guide}`
            : `Wrong command for this step. Try: ${guide}`;
          nextEntries.push({
            label: "Hint",
            output: hintMessage,
            time: formatTime(),
            kind: "hint"
          });
          terminalFeedback.push(hintMessage);
        }
        actionsByStep[modalSafeStep] = [...(actionsByStep[modalSafeStep] || []), ...nextEntries];
      }

      const completed = [...prev.completed];
      if (matchesExpected) {
        completed[modalSafeStep] = true;
        const explanation = stripHtml(
          playbookStep?.explanation
          || modalStepDetails[modalSafeStep]?.action
          || modalStepDetails[modalSafeStep]?.desc
          || `This command is required to complete Step ${modalSafeStep + 1}.`
        );
        stepOutcomes[modalSafeStep] = {
          command,
          result: playbookStep?.result || output,
          explanation,
          time: formatTime()
        };
      }

      return {
        ...prev,
        completed,
        stepOutcomes,
        resolved: completed.every(Boolean),
        actionsTakenByStep: actionsByStep,
        evidence: output === "__CLEAR__"
          ? prev.evidence
          : [
              ...prev.evidence,
              {
                type: "terminal",
                message: `${command} -> ${output}`,
                time: formatTime()
              }
            ]
      };
    });

    if (shouldScheduleAdvance) {
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        autoAdvanceTimeoutRef.current = null;
        syncModalCanvasState((prev) => {
          if (!prev) {
            return prev;
          }
          const nextRequiredStep = Array.isArray(prev.completed)
            ? prev.completed.findIndex((done) => !done)
            : -1;
          if (nextRequiredStep === -1 || nextRequiredStep === prev.currentIndex) {
            return prev;
          }
          return {
            ...prev,
            currentIndex: nextRequiredStep
          };
        });
      }, 5000);
    }

    return terminalFeedback;
  };

  const closeStepModal = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    setStepModalOpen(false);
    setModalMessageId(null);
    setModalCanvasState(null);
    setModalStepDetails([]);
    setTerminalQueuedCommand(null);
  };
  const modalStepOutcome = modalCanvasState?.stepOutcomes?.[modalSafeStep] || null;
  const modalExpectedCommands = extractExpectedCommands(
    modalSteps[modalSafeStep] || "",
    modalStepDetails[modalSafeStep] || {},
    {
      stepIndex: modalSafeStep,
      simulationId: modalCanvasState?.simulationId || "",
      ticketTitle: modalCanvasState?.ticketTitle || ""
    }
  );

  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
    };
  }, []);

  const parseProcessResponse = (text, context = {}) => {
    const normalized = normalizeAssistantText(text);
    const compactText = String(normalized || "").replace(/\s+/g, " ").trim();
    const userPromptText = String(context?.userPromptText || "");
    const firstPromptText = String(context?.firstPromptText || "");
    const userIntentText = `${userPromptText} ${firstPromptText}`.trim();
    const contextText = `${compactText} ${userPromptText} ${firstPromptText}`.trim();
    const lines = String(normalized || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const isStepLine = (line) =>
      /^(\d+[\).\:-]|[-*])\s+/.test(line) || /^(#{1,6}\s*)?(step|phase)\s*\d+\s*[:\-]/i.test(line);
    const cleanStepLine = (line) =>
      String(line || "")
        .replace(/^#{1,6}\s*/, "")
        .replace(/^(\d+[\).\:-]|[-*])\s+/, "")
        .replace(/^(step|phase)\s*\d+\s*[:\-]\s*/i, "")
        .trim();

    const parsedStepItems = [];
    let activeStep = null;
    for (const rawLine of lines) {
      const line = String(rawLine || "").trim();
      if (!line) {
        continue;
      }

      if (isStepLine(line)) {
        if (activeStep) {
          parsedStepItems.push(activeStep);
        }
        const cleaned = cleanStepLine(line);
        let title = cleaned;
        let inlineContent = "";
        const splitByColon = cleaned.split(/:\s+/);
        if (splitByColon.length > 1) {
          title = splitByColon.shift()?.trim() || cleaned;
          inlineContent = splitByColon.join(": ").trim();
        }
        activeStep = {
          title,
          detailLines: inlineContent ? [inlineContent] : []
        };
        continue;
      }

      if (activeStep) {
        if (/^[-_]{3,}$/.test(line)) {
          continue;
        }
        activeStep.detailLines.push(line.replace(/^[-*]\s+/, "").trim());
      }
    }

    if (activeStep) {
      parsedStepItems.push(activeStep);
    }

    const stepItems = parsedStepItems
      .map((step) => ({
        title: step.title,
        content: step.detailLines.filter(Boolean).join("\n").trim()
      }))
      .filter((step) => step.title)
      .slice(0, 10);

    const steps = stepItems.map((step) => step.title);

    const troubleHints = lines.filter((line) =>
      /(trouble|if .* issue|if .* fails|if this does not work|cannot|can't|unable)/i.test(line)
    );

    const intro =
      lines.find((line) => !/^(\d+[\).\:-]|[-*])\s+/.test(line)) ||
      "Please follow the guided steps below.";

    const stepQuestionCount = steps.filter((step) => /\?\s*$/.test(step)).length;
    const hasOnlyQuestionSteps = steps.length > 0 && stepQuestionCount === steps.length;
    const isQuestionHeavyStepList = steps.length > 0 && stepQuestionCount / steps.length >= 0.6;
    const asksForUserInput =
      /(please confirm|can you confirm|please clarify|can you clarify|let me know|reply with|which one|what is your|do you have|are you using|once you confirm|before i give|to proceed,? please|need (a )?(bit )?more detail|provide more context)/i.test(
        compactText
      );
    const hasTroubleshootingIntent =
      /(can't|cannot|unable|not working|won't|error|issue|problem|failed|fails|failure|offline|down|broken|slow|malware|virus|bsod|crash|disconnect|no internet|not syncing|black screen|stuck|fix|troubleshoot|diagnose|repair|resolve)/i.test(
        contextText
      );
    const hasSetupGuideIntent =
      /(install|installation|set up|setup|download|office\.com|sign in|subscription|product key|activate|trial|purchase|buy|tutorial|walkthrough|how do i install|how to install)/i.test(
        contextText
      );
    const hasDefinitionIntent =
      /(what is|what are|define|definition|meaning of|explain|overview of|introduction to|difference between)\b/i.test(
        userIntentText
      );
    const hasExplicitStepRequest =
      /(step by step|steps?|procedure|walk ?through|guide me|how to|troubleshoot|fix|resolve|diagnose|repair)\b/i.test(
        userIntentText
      );
    const isNonTroubleshootingGuide = hasSetupGuideIntent && !hasTroubleshootingIntent;
    const hasActionableStepTone = /(check|verify|run|open|click|type|enter|press|restart|reset|enable|disable|update|flush|ping|tracert|navigate|go to|select|clear|remove|repair|diagnose|test)\b/i.test(
      `${steps.join(" ")} ${compactText}`
    );
    const isDefinitionLike =
      !hasTroubleshootingIntent &&
      /(what is|definition|defined as|refers to|means|overview|concept|components?|types?)/i.test(contextText);

    return {
      intro,
      steps: steps.slice(0, 10),
      stepItems,
      troubleHints: troubleHints.slice(0, 4),
      hasCodeBlock: /```[\s\S]*```/.test(String(normalized || "")),
      isClarificationRequest:
        /(need (a )?(bit )?more detail|please clarify|could refer to|which .* (do you mean|should)|once you confirm|can you confirm|can you clarify|provide (more )?context)/i.test(
          compactText
        ),
      hasOnlyQuestionSteps,
      isQuestionHeavyStepList,
      asksForUserInput,
      hasTroubleshootingIntent,
      isNonTroubleshootingGuide,
      hasDefinitionIntent,
      hasExplicitStepRequest,
      hasActionableStepTone,
      isDefinitionLike,
      hasProcessCue: /(steps?|procedure|troubleshoot|follow|first|next|then|finally|check|verify|run)/i.test(
        String(normalized || "")
      )
    };
  };

  const shouldRenderProcessCard = (parsed) => {
    if (parsed.hasDefinitionIntent && !parsed.hasExplicitStepRequest) {
      return false;
    }
    if (parsed.isClarificationRequest) {
      return false;
    }
    if (parsed.hasOnlyQuestionSteps) {
      return false;
    }
    if (parsed.isQuestionHeavyStepList && parsed.asksForUserInput) {
      return false;
    }
    if (parsed.isDefinitionLike) {
      return false;
    }
    if (parsed.steps.length >= 2 && (parsed.hasActionableStepTone || parsed.hasTroubleshootingIntent || parsed.hasProcessCue)) {
      return true;
    }
    if (parsed.steps.length === 1 && parsed.hasActionableStepTone && (parsed.hasTroubleshootingIntent || parsed.hasProcessCue)) {
      return true;
    }
    return false;
  };

  const shouldOfferInteractiveSimulation = (text, context = {}) => {
    const parsed = parseProcessResponse(text, context);
    if (!shouldRenderProcessCard(parsed)) {
      return false;
    }
    if (parsed.isNonTroubleshootingGuide) {
      return false;
    }
    return true;
  };

  const renderMessageBody = (msg, msgIndex = -1) => {
    if (msg.role === "user") {
      const remainingEdits = Math.max(0, 2 - Number(currentSession?.userEditCount || 0));
      const isEditing = editingMessageId === msg.id;

      if (isEditing) {
        return (
          <div className="user-bubble-block is-editing">
            <div className="user-edit-card">
              <textarea
                ref={editTextareaRef}
                value={editingText}
                onChange={(event) => {
                  setEditingText(event.target.value);
                  autoResizeEditTextarea();
                }}
                className="user-edit-textarea"
                rows={3}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEditingUserMessage();
                  }
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    saveEditedUserMessage();
                  }
                }}
              />
              <div className="user-edit-actions">
                <button className="mini-action-btn hd-btn-reset" type="button" onClick={cancelEditingUserMessage}>
                  Cancel
                </button>
                <button
                  className="mini-action-btn primary hd-btn-reset"
                  type="button"
                  onClick={saveEditedUserMessage}
                  disabled={!editingText.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="user-bubble-block">
          <div className="user-bubble">{msg.text}</div>
          <div className="user-msg-actions">
            <button
              className={`mini-action-btn user-icon-btn hd-btn-reset ${copiedMessageId === msg.id ? "is-copied" : ""}`}
              type="button"
              onClick={() => copyText(msg.id, msg.text)}
              aria-label="Copy user prompt"
              title={copiedMessageId === msg.id ? "Copied" : "Copy prompt"}
            >
              {copiedMessageId === msg.id ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="9" width="10" height="10" rx="2" />
                  <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
            <button
              className="mini-action-btn user-icon-btn hd-btn-reset"
              type="button"
              onClick={() => startEditingUserMessage(msg)}
              disabled={remainingEdits <= 0}
              aria-label="Edit user prompt"
              title={remainingEdits > 0 ? `Edit prompt (${remainingEdits} left)` : "Edit limit reached"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h4l10-10-4-4L4 16v4z" />
                <path d="M13 7l4 4" />
              </svg>
            </button>
          </div>
        </div>
      );
    }

    if (msg.type === "sim-choice") {
      return (
        <div className="msg-bubble">
          <h3>Terminal Simulation Ready</h3>
          <p style={{ fontSize: "13px", color: "var(--text2)", marginBottom: 12 }}>
            Choose a suggested ticket and run it in the terminal simulation workspace.
          </p>
          <span className="input-hint">Use suggested cards above to launch a module.</span>
        </div>
      );
    }

    if (msg.type === "sim-module") {
      return (
        <div className="msg-bubble">
          <h3>Terminal Module Loaded</h3>
          <p style={{ fontSize: "13px", color: "var(--text2)", marginBottom: 12 }}>
            {msg.text}
          </p>
          <button className="create-sim-btn hd-btn-reset" onClick={() => openStepModalFromMessage(msg)}>
            Open Simulation
          </button>
        </div>
      );
    }

    if (msg.type === "policy") {
      return (
        <div className="response-card policy-bubble">
          {/* <div className="response-top">
            <div className="issue-tag">Policy Filter</div>
            <div className="status-pill">Notice</div>
          </div> */}
          <div className="step-header">
            <h2>Request blocked by policy</h2>
            <p>{normalizeAssistantText(msg.text)}</p>
          </div>
        </div>
      );
    }

    let fallbackUserPrompt = "";
    if (msgIndex > 0 && Array.isArray(messages)) {
      for (let i = msgIndex - 1; i >= 0; i -= 1) {
        const previous = messages[i];
        if (previous?.role === "user" && previous?.type === "text") {
          fallbackUserPrompt = previous.text || "";
          break;
        }
      }
    }
    const parsed = parseProcessResponse(msg.text, {
      userPromptText: msg.userPromptText || fallbackUserPrompt || "",
      firstPromptText: msg.firstPromptText || firstUserPrompt(messages) || ""
    });
    const renderAsProcess = shouldRenderProcessCard(parsed);
    const stepItems = Array.isArray(parsed.stepItems) && parsed.stepItems.length > 0
      ? parsed.stepItems
      : parsed.steps.map((step) => ({ title: step, content: "" }));
    const totalSteps = Math.max(stepItems.length, 1);
    const completion = Array.from(
      { length: stepItems.length },
      (_, idx) => Boolean(Array.isArray(msg.stepCompletion) ? msg.stepCompletion[idx] : false)
    );
    const completedCount = completion.filter(Boolean).length;
    const progressPct = stepItems.length > 0 ? Math.round((completedCount / stepItems.length) * 100) : 0;
    const activeStepIdx = stepItems.length > 0 ? completion.findIndex((done) => !done) : -1;
    const activeStepNum = stepItems.length > 0 ? (activeStepIdx === -1 ? stepItems.length : activeStepIdx + 1) : 1;
    const processCopyText = [
      parsed.intro,
      "",
      ...stepItems.map((step, idx) => `${idx + 1}. ${step.title}${step.content ? `\n${step.content}` : ""}`),
      ...(parsed.troubleHints.length > 0 ? ["", "Recommended next checks:", ...parsed.troubleHints.map((hint) => `- ${hint}`)] : [])
    ]
      .join("\n")
      .trim();

    return (
      <>
        {renderAsProcess ? (
          <div className="response-shell">
            <div className="response-card">
            <div className="step-header">
              <small>Step {activeStepNum} of {totalSteps}</small>
              <h2>{stepItems[0]?.title || "Start with these checks"}</h2>
              <p>{parsed.intro}</p>
            </div>

            <div className="progress-wrap">
              <div className="progress-info">
                <span>{completedCount === stepItems.length && stepItems.length > 0 ? "Completed" : "In progress"}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${progressPct}%`
                  }}
                />
              </div>
            </div>

            <ul className="check-list">
              {stepItems.map((step, idx) => {
                const hasDesc = Boolean(step.content);
                const isActive = idx === activeStepIdx && !completion[idx];
                return (
                  <li
                    key={`${step.title.slice(0, 24)}-${idx}`}
                    className={`check-item ${completion[idx] ? "is-complete" : ""} ${isActive ? "is-active" : ""}`}
                  >
                    <div className="check-item-main">
                      <div className={`check-number ${completion[idx] ? "is-complete" : ""}`}>{idx + 1}</div>
                      <div>
                        <h3>{step.title}</h3>
                        <p style={{ whiteSpace: "pre-wrap" }}>
                          {hasDesc ? step.content : "Follow this step and confirm the result."}
                        </p>
                      </div>
                    </div>
                    <button
                      className={`check-toggle-btn hd-btn-reset ${completion[idx] ? "is-complete" : ""} ${isActive ? "is-active" : ""}`}
                      type="button"
                      onClick={() => toggleStepCompletion(msg.id, idx, stepItems.length)}
                      aria-label={`Mark step ${idx + 1} as ${completion[idx] ? "incomplete" : "complete"}`}
                      title={completion[idx] ? "Completed" : "Mark complete"}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>

            {parsed.troubleHints.length > 0 ? (
              <div className="question-box">
                <h3>Recommended next checks</h3>
                <div className="trouble-items">
                  {parsed.troubleHints.map((hint, idx) => (
                    <div key={`${hint.slice(0, 22)}-${idx}`} className="trouble-item">
                      {hint}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            </div>
            <div className="response-actions">
              <button
                className={`copy-btn copy-icon-btn hd-btn-reset ${copiedMessageId === msg.id ? "is-copied" : ""}`}
                type="button"
                onClick={() => copyText(msg.id, processCopyText)}
                aria-label="Copy AI response"
                title={copiedMessageId === msg.id ? "Copied" : "Copy"}
              >
                {copiedMessageId === msg.id ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="9" width="10" height="10" rx="2" />
                    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="response-shell">
            <div className="response-card">
              <div className="plain-answer" style={{ whiteSpace: "pre-wrap" }}>
                {normalizeAssistantText(msg.text)}
              </div>
            </div>
            <div className="response-actions">
              <button
                className={`copy-btn copy-icon-btn hd-btn-reset ${copiedMessageId === msg.id ? "is-copied" : ""}`}
                type="button"
                onClick={() => copyText(msg.id, normalizeAssistantText(msg.text))}
                aria-label="Copy AI response"
                title={copiedMessageId === msg.id ? "Copied" : "Copy"}
              >
                {copiedMessageId === msg.id ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="9" width="10" height="10" rx="2" />
                    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderSessionCard = (session) => (
    <button
      key={session.id}
      className={`session-item hd-btn-reset ${activeSessionId === session.id ? "active" : ""} ${openSessionMenuId === session.id ? "menu-open" : ""}`}
      onClick={() => {
        setActiveSessionId(session.id);
        if (session.isSimulationSession) {
          loadSimulationWorkspaceFromSession(session);
        } else {
          setShowSimulationCatalog(false);
        }
        setOpenSessionMenuId(null);
        if (mobileView) {
          setSidebarCollapsed(true);
        }
      }}
    >
      <div className="session-icon">
        {((firstUserPrompt(session.messages) || session.title || "?").trim().charAt(0) || "?").toUpperCase()}
      </div>
      <div className="session-body">
        <div className="session-head">
          <div className="session-title">{session.title}</div>
          {session.isFavorite ? <span className="session-fav-dot" title="Favorite">★</span> : null}
        </div>
        <div className="session-preview">{sessionPreview(session)}</div>
        <div className="session-time">{formatDateTime(session.updatedAt)}</div>
      </div>
      <div className="session-menu-wrap">
        <button
          className="session-menu-btn hd-btn-reset"
          title="Session actions"
          aria-label="Session actions"
          onClick={(e) => {
            e.stopPropagation();
            setOpenSessionMenuId((prev) => (prev === session.id ? null : session.id));
          }}
        >
          <span />
          <span />
          <span />
        </button>
        {openSessionMenuId === session.id ? (
          <div className="session-menu-popover" onClick={(e) => e.stopPropagation()}>
            <button className="session-menu-item hd-btn-reset" onClick={() => renameSession(session.id)}>
              Rename
            </button>
            <button className="session-menu-item hd-btn-reset" onClick={() => toggleFavoriteSession(session.id)}>
              {session.isFavorite ? "Remove Favorite" : "Favorite"}
            </button>
            <button className="session-menu-item danger hd-btn-reset" onClick={() => deleteSession(session.id)}>
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </button>
  );

  const toggleSidebarGroup = (groupName) => {
    setSidebarGroupsCollapsed((prev) => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  const handleSelectSession = (session) => {
    setPendingSimulationCreation(false);
    setActiveSessionId(session.id);
    if (session.isSimulationSession) {
      loadSimulationWorkspaceFromSession(session);
    } else {
      setShowSimulationCatalog(false);
    }
    setOpenSessionMenuId(null);
    if (mobileView) {
      setSidebarCollapsed(true);
    }
  };

  return (
    <div className={`helpdesk-root ${theme === "light" ? "theme-light" : ""}`}>
      {stepModalOpen && !isSimulationSession ? (
        <div className="step-modal-overlay" onClick={closeStepModal}>
          <div className="step-modal" onClick={(e) => e.stopPropagation()}>
            <div className="step-modal-header">
              <div className="step-modal-title">{modalSourceTitle}</div>
              <button className="step-modal-close hd-btn-reset" onClick={closeStepModal}>
                X
              </button>
            </div>
            <div className="step-modal-progress-wrap">
              <div className="step-modal-progress-info">
                <span>Step {modalStepCount === 0 ? 0 : modalSafeStep + 1} of {modalStepCount}</span>
                <span>{modalProgress}%</span>
              </div>
              <div className="step-modal-progress-track">
                <div className="step-modal-progress-fill" style={{ width: `${modalProgress}%` }} />
              </div>
            </div>
            <div className="step-modal-body">
              <div className="step-modal-left">
                <h3>Simulation Steps</h3>
                <div className="step-modal-list">
                  {modalSteps.map((step, idx) => (
                    <button
                      key={`${step.slice(0, 20)}-${idx}`}
                      className={`step-modal-item hd-btn-reset ${idx === modalSafeStep ? "active" : ""} ${modalCanvasState?.completed?.[idx] ? "completed" : ""}`}
                      onClick={() => setModalStepIndex(idx)}
                    >
                      <span className="step-modal-item-num">{modalCanvasState?.completed?.[idx] ? "✓" : idx + 1}</span>
                      <span className="step-modal-item-text">{step}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="step-modal-right">
                <h3>Simulation Canvas</h3>
                <div className="step-modal-status-row">
                  <span className="step-modal-status-pill">
                    Scenario: {(modalCanvasState?.scenarioType || "general").toUpperCase()}
                  </span>
                  <span className={`step-modal-status-pill ${modalResolved ? "is-resolved" : ""}`}>
                    {modalResolved ? "Resolved" : "In Progress"} | {modalCompletionPct}%
                  </span>
                </div>
                <div className="step-modal-current">
                  <div className="step-modal-current-label">Current Step</div>
                  <div className="step-modal-current-head">
                    <span className="step-modal-current-num">{modalStepCount === 0 ? 0 : modalSafeStep + 1}</span>
                    <span className="step-modal-current-title">
                      Step {modalStepCount === 0 ? 0 : modalSafeStep + 1}
                    </span>
                  </div>
                  <div className="step-modal-current-text">{modalSteps[modalSafeStep] || "No steps available."}</div>
                  {modalStepDetails[modalSafeStep]?.desc ? (
                    <div className="step-modal-current-text step-modal-current-subtext" dangerouslySetInnerHTML={{ __html: modalStepDetails[modalSafeStep].desc }} />
                  ) : null}
                  {modalStepOutcome ? (
                    <div className="step-result-card">
                      <div className="step-result-title">Step Result</div>
                      <div className="step-result-row">
                        <strong>Command:</strong> <code>{modalStepOutcome.command}</code>
                      </div>
                      <div className="step-result-row">
                        <strong>Result:</strong> {modalStepOutcome.result}
                      </div>
                      <div className="step-result-row">
                        <strong>Why this command:</strong> {modalStepOutcome.explanation}
                      </div>
                      {modalCanvasState?.completed?.[modalSafeStep] && modalSafeStep !== modalRequiredStep && !modalResolved ? (
                        <div className="step-result-row">
                          Proceeding to next required step in 5 seconds...
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="terminal-guide">
                    <div className="terminal-guide-label">Suggested Commands For This Step</div>
                    <div className="terminal-guide-list">
                      {modalExpectedCommands.map((cmd) => (
                        <button
                          key={cmd}
                          className="terminal-guide-chip hd-btn-reset"
                          onClick={() =>
                            setTerminalQueuedCommand({
                              id: `${Date.now()}-${Math.random()}`,
                              command: formatTerminalCommandForDisplay(cmd)
                            })
                          }
                          title="Use this command"
                        >
                          {formatTerminalCommandForDisplay(cmd)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="step-modal-canvas">
                  <div className="step-modal-canvas-header">
                    <div className="step-modal-canvas-title">Terminal Simulation</div>
                  </div>
                  <div className="terminal-shell">
                    <div className="terminal-header">
                      <div className="terminal-header-left">
                        <span className="terminal-dot red" />
                        <span className="terminal-dot yellow" />
                        <span className="terminal-dot green" />
                        <span className="terminal-title">Helpdesk Terminal</span>
                      </div>
                      <span>{(modalCanvasState?.scenarioType || "general").toUpperCase()} MODE</span>
                    </div>
                    <TerminalEmulator
                      className="terminal-body"
                      initialMessage="Windows Terminal simulation ready. Type 'help' for available commands."
                      username="student"
                      hostname="DESKTOP-SIM"
                      initialPath="C:\\Users\\student"
                      queuedCommand={terminalQueuedCommand}
                      onCommand={handleTerminalCommand}
                    />
                  </div>
                </div>
                <div className="step-modal-footer">
                  <div className="terminal-line muted">
                    Step navigation is click-based. Completion is sequential. Required step: {modalRequiredStep + 1} of {modalStepCount}.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div id="helpdesk-app" className={sidebarCollapsed ? "sidebar-collapsed" : ""}>
        {mobileView && !sidebarCollapsed ? (
          <button
            className="sidebar-backdrop hd-btn-reset"
            aria-label="Close sidebar"
            onClick={() => setSidebarCollapsed(true)}
          />
        ) : null}
        <div className={`hd-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="hd-sidebar-header">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">HS</div>
              <div className="sidebar-logo-text">
                Helpdesk <span>Simulation</span>
              </div>
            </div>
            <button
              className="sidebar-edit-btn hd-btn-reset"
              onClick={() => {
                startNewSession();
                if (mobileView) {
                  setSidebarCollapsed(true);
                }
              }}
              aria-label="New chat"
              title="New chat"
            >
              ✎
            </button>
          </div>

          <div className="hd-modules-list">
            <label className="sidebar-search-wrap">
              <span className="sidebar-search-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
              </span>
              <input
                className="sidebar-search-input"
                value={sidebarSearchInput}
                onChange={(e) => setSidebarSearchInput(e.target.value)}
                placeholder="Search chats & sims…"
              />
            </label>

            <div className="sidebar-groups">
              <SidebarGroup
                label="Chats"
                type="chat"
                icon={
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 6h16v10H7l-3 3V6z" />
                  </svg>
                }
                items={filteredChatSessions}
                hasAnyItems={chatSessions.length > 0}
                sidebarCollapsed={sidebarCollapsed}
                collapsed={sidebarGroupsCollapsed.chats}
                searchActive={searchActive}
                activeSessionId={activeSessionId}
                openSessionMenuId={openSessionMenuId}
                onToggle={() => toggleSidebarGroup("chats")}
                onAdd={() => {
                  startNewSession();
                  if (mobileView) {
                    setSidebarCollapsed(true);
                  }
                }}
                onSelectItem={handleSelectSession}
                onToggleMenu={(id) => setOpenSessionMenuId((prev) => (prev === id ? null : id))}
                onRename={renameSession}
                onFavorite={toggleFavoriteSession}
                onDelete={deleteSession}
              />

              <SidebarGroup
                label="Simulations"
                type="simulation"
                icon={
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 10h10a4 4 0 0 1 4 4v2h-2l-2-2h-2l-1 2h-4l-1-2H7l-2 2H3v-2a4 4 0 0 1 4-4z" />
                    <path d="M9 7h6" />
                  </svg>
                }
                items={filteredSimulationSessions}
                hasAnyItems={simulationSessions.length > 0}
                sidebarCollapsed={sidebarCollapsed}
                collapsed={sidebarGroupsCollapsed.simulations}
                searchActive={searchActive}
                activeSessionId={activeSessionId}
                openSessionMenuId={openSessionMenuId}
                onToggle={() => toggleSidebarGroup("simulations")}
                onAdd={startNewSimulationSession}
                onSelectItem={handleSelectSession}
                onToggleMenu={(id) => setOpenSessionMenuId((prev) => (prev === id ? null : id))}
                onRename={renameSession}
                onFavorite={toggleFavoriteSession}
                onDelete={deleteSession}
              />
            </div>
          </div>

          <div className="hd-sidebar-footer" ref={accountMenuRef}>
            <div className="sidebar-footer-row">
              <button className="avatar-menu-btn hd-btn-reset" onClick={() => setAccountMenuOpen((prev) => !prev)}>
                <div className="avatar-dot">{(user?.firstName || "U").slice(0, 1).toUpperCase()}</div>
                <div className="avatar-labels">
                  <div className="avatar-name">{user?.firstName || "User"} {user?.lastName || ""}</div>
                  <div className="avatar-sub">Account</div>
                </div>
              </button>
              <button
                className="sidebar-settings-btn hd-btn-reset"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                aria-label="Account settings"
                title="Account settings"
              >
                ⚙
              </button>
            </div>
            {accountMenuOpen ? (
              <div className="avatar-popover">
                <div className="avatar-popover-name">{user?.firstName || ""} {user?.lastName || ""}</div>
                <div className="avatar-popover-email">{user?.email || ""}</div>
                <div className="avatar-theme-row">
                  <span className="avatar-theme-label">Light Mode</span>
                  <button
                    className={`avatar-theme-switch hd-btn-reset ${theme === "light" ? "is-on" : ""}`}
                    onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                    aria-label="Toggle light mode"
                    aria-pressed={theme === "light"}
                  >
                    <span className="avatar-theme-track">
                      <span className="avatar-theme-thumb" />
                    </span>
                    <span className="avatar-theme-state">{theme === "light" ? "On" : "Off"}</span>
                  </button>
                </div>
                <button className="avatar-popover-btn danger hd-btn-reset" onClick={logout}>
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="hd-main">
          <div className="hd-topbar">
            <button
              className={`toggle-sidebar hd-btn-reset ${sidebarCollapsed ? "is-collapsed" : ""}`}
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              <span className="toggle-icon">&lt;</span>
            </button>
            <div className="topbar-title">{topbarSessionTitle}</div>
            <div className="status-dot" />
            <span className="status-text">System Online</span>
            {denied ? <span className="denied-pill">Access denied</span> : null}
            {user?.role === "ADMIN" ? (
              <Link to="/admin" className="top-btn">
                Admin
              </Link>
            ) : null}
          </div>

          <div className="chat-wrap" ref={chatWrapRef}>
            {isSimulationSession ? (
              <div className="simulation-inline-shell">
                {showSimulationCatalog ? (
                  <div className="messages messages-welcome">
                    <div className="welcome">
                      <h1>Simulation Tickets</h1>
                      <p>Select a related ticket below to launch guided simulation.</p>
                      <div className="welcome-related-label">Related Tickets and Common Problems</div>
                      <div className="quick-grid">
                        {QUESTION_BANK.map((q) => (
                          <button key={`sim-${q.title}`} className="quick-card hd-btn-reset" onClick={() => startSuggestedSimulation(q)}>
                            <div className="quick-card-head">
                              <SuggestionIcon label={q.label} />
                              <div className="qc-label">{q.label}</div>
                            </div>
                            <div className="qc-title">{q.title}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="step-modal step-inline">
                    <div className="step-modal-header">
                      <div className="step-modal-title">{modalSourceTitle}</div>
                    </div>
                    <div className="step-modal-progress-wrap">
                      <div className="step-modal-progress-info">
                        <span>Step {modalStepCount === 0 ? 0 : modalSafeStep + 1} of {modalStepCount}</span>
                        <span>{modalProgress}%</span>
                      </div>
                      <div className="step-modal-progress-track">
                        <div className="step-modal-progress-fill" style={{ width: `${modalProgress}%` }} />
                      </div>
                    </div>
                    <div className="step-modal-body">
                      <div className="step-modal-left">
                        <h3>Simulation Steps</h3>
                        <div className="step-modal-list">
                          {modalSteps.map((step, idx) => (
                            <button
                              key={`${step.slice(0, 20)}-${idx}`}
                              className={`step-modal-item hd-btn-reset ${idx === modalSafeStep ? "active" : ""} ${modalCanvasState?.completed?.[idx] ? "completed" : ""}`}
                              onClick={() => setModalStepIndex(idx)}
                            >
                              <span className="step-modal-item-num">{modalCanvasState?.completed?.[idx] ? "âœ“" : idx + 1}</span>
                              <span className="step-modal-item-text">{step}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="step-modal-right">
                        <h3>Simulation Canvas</h3>
                        <div className="step-modal-status-row">
                          <span className="step-modal-status-pill">
                            Scenario: {(modalCanvasState?.scenarioType || "general").toUpperCase()}
                          </span>
                          <span className={`step-modal-status-pill ${modalResolved ? "is-resolved" : ""}`}>
                            {modalResolved ? "Resolved" : "In Progress"} | {modalCompletionPct}%
                          </span>
                        </div>
                        <div className="step-modal-current">
                          <div className="step-modal-current-label">Current Step</div>
                          <div className="step-modal-current-head">
                            <span className="step-modal-current-num">{modalStepCount === 0 ? 0 : modalSafeStep + 1}</span>
                            <span className="step-modal-current-title">
                              Step {modalStepCount === 0 ? 0 : modalSafeStep + 1}
                            </span>
                          </div>
                          <div className="step-modal-current-text">{modalSteps[modalSafeStep] || "No steps available."}</div>
                          {modalStepDetails[modalSafeStep]?.desc ? (
                            <div className="step-modal-current-text step-modal-current-subtext" dangerouslySetInnerHTML={{ __html: modalStepDetails[modalSafeStep].desc }} />
                          ) : null}
                          {modalStepOutcome ? (
                            <div className="step-result-card">
                              <div className="step-result-title">Step Result</div>
                              <div className="step-result-row">
                                <strong>Command:</strong> <code>{modalStepOutcome.command}</code>
                              </div>
                              <div className="step-result-row">
                                <strong>Result:</strong> {modalStepOutcome.result}
                              </div>
                              <div className="step-result-row">
                                <strong>Why this command:</strong> {modalStepOutcome.explanation}
                              </div>
                            </div>
                          ) : null}
                          <div className="terminal-guide">
                            <div className="terminal-guide-label">Suggested Commands For This Step</div>
                            <div className="terminal-guide-list">
                              {modalExpectedCommands.map((cmd) => (
                                <button
                                  key={cmd}
                                  className="terminal-guide-chip hd-btn-reset"
                                  onClick={() =>
                                    setTerminalQueuedCommand({
                                      id: `${Date.now()}-${Math.random()}`,
                                      command: formatTerminalCommandForDisplay(cmd)
                                    })
                                  }
                                  title="Use this command"
                                >
                                  {formatTerminalCommandForDisplay(cmd)}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="step-modal-canvas">
                          <div className="step-modal-canvas-header">
                            <div className="step-modal-canvas-title">Terminal Simulation</div>
                          </div>
                          <div className="terminal-shell">
                            <div className="terminal-header">
                              <div className="terminal-header-left">
                                <span className="terminal-dot red" />
                                <span className="terminal-dot yellow" />
                                <span className="terminal-dot green" />
                                <span className="terminal-title">Helpdesk Terminal</span>
                              </div>
                              <span>{(modalCanvasState?.scenarioType || "general").toUpperCase()} MODE</span>
                            </div>
                            <TerminalEmulator
                              className="terminal-body"
                              initialMessage="Windows Terminal simulation ready. Type 'help' for available commands."
                              username="student"
                              hostname="DESKTOP-SIM"
                              initialPath="C:\\Users\\student"
                              queuedCommand={terminalQueuedCommand}
                              onCommand={handleTerminalCommand}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            {!isSimulationSession ? (
              <>
            <div className={`messages ${showWelcome || showSimulationCatalog ? "messages-welcome" : ""}`}>
              {showSimulationCatalog ? (
                <div className="welcome">
                  <h1>Simulation Tickets</h1>
                  <p>Select a related ticket below to launch guided simulation.</p>
                  <div className="welcome-related-label">Related Tickets and Common Problems</div>
                  <div className="quick-grid">
                    {QUESTION_BANK.map((q) => (
                      <button key={`sim-${q.title}`} className="quick-card hd-btn-reset" onClick={() => startSuggestedSimulation(q)}>
                        <div className="quick-card-head">
                          <SuggestionIcon label={q.label} />
                          <div className="qc-label">{q.label}</div>
                        </div>
                        <div className="qc-title">{q.title}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {!showSimulationCatalog && showWelcome ? (
                <div className="welcome">
                  <h1>Hello, {user?.firstName || "there"}.</h1>
                  <p>What IT issue can I help you troubleshoot today?</p>
                  <div className="welcome-composer">
                    <div className="welcome-input-box composer-shell">
                      <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value);
                          autoResize();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        rows={1}
                        placeholder="Ask about password reset, VPN, printer, internet, BSOD..."
                      />
                      <button
                        className="send-btn hd-btn-reset"
                        onClick={() => sendMessage()}
                        disabled={typing || !input.trim()}
                        aria-label="Send message"
                      >
                        ↑
                      </button>
                    </div>
                  </div>
                  <div className="welcome-related-label">Related Tickets and Common Problems</div>
                  <div className="quick-grid">
                    {(currentSession?.suggestedQuestions || pickRandomQuestions()).map((q) => (
                      <button key={q.title} className="quick-card hd-btn-reset" onClick={() => sendMessage(pickSuggestionQuestion(q))}>
                        <div className="quick-card-head">
                          <SuggestionIcon label={q.label} />
                          <div className="qc-label">{q.label}</div>
                        </div>
                        <div className="qc-title">{q.title}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {!showSimulationCatalog ? messages.map((msg, idx) => (
                <div key={msg.id} className={msg.role === "user" ? "message-row user" : "ai-block"}>
                  {msg.role === "user" ? (
                    <>
                      <div className={`user-bubble-wrap ${editingMessageId === msg.id ? "is-editing" : ""}`}>
                        <div className="message-meta">
                          <span>{msg.time}</span>
                          <span>{(user?.firstName || user?.email || "U").charAt(0).toUpperCase()}</span>
                        </div>
                        {renderMessageBody(msg, idx)}
                      </div>
                      <div className="avatar user-avatar">{(user?.firstName || user?.email || "U").charAt(0).toUpperCase()}</div>
                    </>
                  ) : (
                    <>
                      <div className="avatar ai-avatar">HD</div>
                      <div className="ai-content">
                        <div className="ai-label">
                          <span aria-hidden="true" />
                          Helpdesk Simulation Response
                        </div>
                        <div className="msg-meta">{msg.time}</div>
                        {renderMessageBody(msg, idx)}
                      </div>
                    </>
                  )}
                </div>
              )) : null}
            </div>

            {!showSimulationCatalog && typing ? (
              <div className="typing-wrap ai-block">
                <div className="avatar ai-avatar">HD</div>
                <div className="typing-bubble">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : null}
              </>
            ) : null}
          </div>

          {!isSimulationSession && !showWelcome && !showSimulationCatalog ? (
            <div className="input-area">
              <div className="input-inner">
                <div className="input-box composer-shell">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      autoResize();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder="Describe your IT issue or ask how to fix something..."
                  />
                  <button
                    className="send-btn hd-btn-reset"
                    onClick={() => sendMessage()}
                    disabled={typing || !input.trim()}
                    aria-label="Send message"
                  >
                    ↑
                  </button>
                </div>
                <div className="input-hint">Press Enter to send. Shift+Enter for newline.</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
