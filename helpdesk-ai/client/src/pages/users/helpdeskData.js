export const modules = [
  {
    cat: "Account & Access",
    items: [
      { id: "password-reset", label: "Password Reset", keys: ["password", "forgot", "locked", "reset", "account locked"] },
      { id: "access-request", label: "Access Requests", keys: ["access", "permission", "shared folder", "new account", "new employee"] },
      { id: "account-setup", label: "New Employee Setup", keys: ["new employee", "onboarding", "setup account", "new user"] }
    ]
  },
  {
    cat: "Hardware Issues",
    items: [
      { id: "pc-no-boot", label: "PC Won't Turn On", keys: ["won't turn on", "not booting", "boot", "black screen", "power", "no power", "dead computer"] },
      { id: "monitor", label: "Monitor Not Working", keys: ["monitor", "display", "screen not working", "no display"] },
      { id: "keyboard-mouse", label: "Keyboard / Mouse", keys: ["keyboard", "mouse", "not working", "broken keyboard", "broken mouse"] },
      { id: "overheating", label: "Laptop Overheating", keys: ["overheating", "hot", "laptop hot", "cooling", "fan noise"] }
    ]
  },
  {
    cat: "Network & Internet",
    items: [
      { id: "no-internet", label: "No Internet Connection", keys: ["no internet", "internet down", "connection", "wifi not working", "no wifi", "no network"] },
      { id: "slow-wifi", label: "Slow Wi-Fi", keys: ["slow wifi", "slow internet", "slow connection", "weak signal"] },
      { id: "vpn", label: "VPN Issues", keys: ["vpn", "cannot connect vpn", "vpn not working"] }
    ]
  },
  {
    cat: "Printers & Peripherals",
    items: [
      { id: "printer", label: "Printer Offline", keys: ["printer", "print", "offline printer", "cannot print", "paper jam"] },
      { id: "webcam", label: "Webcam Problems", keys: ["webcam", "camera", "not detected", "webcam not working"] },
      { id: "headset", label: "Headset / Mic Issues", keys: ["headset", "microphone", "mic", "audio", "no sound", "headphones"] }
    ]
  },
  {
    cat: "Software & Email",
    items: [
      { id: "software-install", label: "Software Installation", keys: ["install", "software", "microsoft office", "antivirus", "application setup"] },
      { id: "email", label: "Email Issues", keys: ["email", "cannot send", "receive email", "outlook", "email not working", "sync", "phishing", "spam"] }
    ]
  },
  {
    cat: "Security & Malware",
    items: [
      { id: "malware", label: "Virus / Malware Detected", keys: ["virus", "malware", "antivirus", "suspicious", "pop-up", "infected", "security"] },
      { id: "unauthorized", label: "Unauthorized Login", keys: ["unauthorized", "suspicious login", "account breach", "hacked"] }
    ]
  },
  {
    cat: "System Performance",
    items: [
      { id: "slow-pc", label: "Slow Computer / High CPU", keys: ["slow computer", "slow pc", "high cpu", "high ram", "cpu usage", "performance", "lagging"] },
      { id: "freezing", label: "Frequent Freezing", keys: ["freezing", "frozen", "hangs", "not responding", "freeze"] },
      { id: "bsod", label: "Blue Screen (BSOD)", keys: ["blue screen", "bsod", "crash", "unexpected shutdown", "stop error"] }
    ]
  },
  {
    cat: "Files & Recovery",
    items: [{ id: "file-recovery", label: "File Recovery", keys: ["deleted", "file recovery", "corrupted", "lost file", "recover"] }]
  },
  {
    cat: "Mobile & Remote",
    items: [
      { id: "mobile-email", label: "Mobile Email Setup", keys: ["mobile email", "company email phone", "phone setup", "email on phone"] },
      { id: "mobile-wifi", label: "Device Wi-Fi Issues", keys: ["mobile wifi", "phone wifi", "device wifi", "tablet wifi"] }
    ]
  },
  {
    cat: "Server & Downtime",
    items: [{ id: "server-down", label: "Server / Website Down", keys: ["server down", "website down", "internal website", "database", "server not responding"] }]
  }
];

export const kb = {
  "password-reset": {
    title: "Password Reset Procedure",
    severity: "medium",
    tags: ["Account", "Windows AD", "Self-Service"],
    steps: [
      { n: "Verify Identity", t: "Confirm the user's employee ID or staff email before proceeding. Never reset without verification." },
      { n: "Check Account Status", t: "In Active Directory, check if the account is <code>Locked Out</code>. Go to <b>ADUC → Find User → Account tab</b>." },
      { n: "Unlock if Locked", t: "If locked, click <b>Unlock Account</b> checkbox and apply. Check the \"User must change password at next logon\" option." },
      { n: "Reset Password", t: "Right-click the user → <b>Reset Password</b>. Set a temp password: <code>TempPass@[YearMonth]</code>. Tick \"change at next logon\"." },
      { n: "Inform the User", t: "Provide the temp password via secure channel (phone or IT secure portal — never plaintext email)." },
      { n: "Confirm Access", t: "Ask the user to log in and change their password. Confirm they can access their account and close the ticket." }
    ],
    info: "For self-service resets, direct users to the SSP portal at <code>https://reset.company.com</code>.",
    warn: "Never share passwords over email or chat. Always use a secure, verified communication channel.",
    sim: "password-reset"
  },
  "pc-no-boot": {
    title: "PC Won't Turn On / Boot Issue",
    severity: "high",
    tags: ["Hardware", "BIOS", "Power Supply"],
    steps: [
      { n: "Check Power Connections", t: "Verify the power cable is fully seated in the PSU and wall outlet. Try a different outlet or power strip." },
      { n: "Check Power Indicators", t: "Look for LED lights on the motherboard or front panel. A light means power is reaching the board." },
      { n: "Test the Power Supply", t: "Use a PSU tester or swap with a known-good PSU. A failed PSU is the #1 cause of dead PCs." },
      { n: "Disconnect Peripherals", t: "Unplug all external devices (USB drives, monitors via adapters, extra GPUs). Attempt boot with bare minimum hardware." },
      { n: "Reseat RAM & GPU", t: "Open the case, remove and re-insert RAM sticks and GPU. Clean contacts with a dry eraser if needed." },
      { n: "Check Boot Device", t: "If POST screen appears but hangs, press <code>F2/Del</code> to enter BIOS. Verify the correct boot drive is selected." },
      { n: "Escalate if Needed", t: "If no signs of life after all steps, log a hardware replacement request and assign to Level 2 support." }
    ],
    info: "If the PC powers on but shows a black screen, check monitor cable and try with integrated graphics first.",
    warn: "Always ground yourself before opening the case to prevent electrostatic discharge (ESD) damage.",
    sim: "pc-no-boot"
  },
  "no-internet": {
    title: "No Internet Connection — Troubleshooting",
    severity: "high",
    tags: ["Network", "TCP/IP", "Router", "DNS"],
    steps: [
      { n: "Check Physical Connections", t: "Ensure Ethernet cable is firmly connected or Wi-Fi is enabled on the device. Look for link lights on the NIC." },
      { n: "Run Network Troubleshooter", t: "Windows: <code>Settings → Network → Troubleshoot</code>. Mac: <code>System Settings → Network → Diagnose</code>." },
      { n: "Release & Renew IP", t: "Open CMD as Admin. Run: <code>ipconfig /release</code> then <code>ipconfig /renew</code>. Try pinging: <code>ping 8.8.8.8</code>." },
      { n: "Flush DNS Cache", t: "Run: <code>ipconfig /flushdns</code>. Also try changing DNS to <code>8.8.8.8</code> and <code>8.8.4.4</code> in adapter settings." },
      { n: "Restart Network Devices", t: "Restart the router/switch: unplug power for 30 seconds, then reconnect. Wait for all lights to stabilize." },
      { n: "Check with Another Device", t: "Test internet on a different device on the same network. If it works there, the issue is device-specific." },
      { n: "Contact ISP/Network Team", t: "If all devices are affected, check for outages and escalate to the network team or ISP." }
    ],
    info: "Use <code>tracert google.com</code> to pinpoint where packets are dropping in the network path.",
    sim: "no-internet"
  },
  printer: {
    title: "Printer Offline / Cannot Print",
    severity: "medium",
    tags: ["Printer", "Spooler", "Driver", "Network Print"],
    steps: [
      { n: "Check Printer Status", t: "Ensure the printer is powered on. Look for error lights. Press the power button and check the display panel." },
      { n: "Set as Default Printer", t: "Go to <code>Control Panel → Devices & Printers</code>. Right-click your printer → <b>Set as default printer</b>." },
      { n: "Clear Print Queue", t: "Open the print queue, select all stuck jobs, and delete them. Then try printing a test page." },
      { n: "Restart Print Spooler", t: "Open <code>services.msc</code>, find <b>Print Spooler</b>, right-click → <b>Restart</b>. This clears most spooler errors." },
      { n: "Check Network Printer IP", t: "For network printers, ping the printer IP. If unreachable, check the printer's IP config and re-add it to the PC." },
      { n: "Reinstall Printer Driver", t: "Remove the printer from Devices & Printers, download the latest driver from manufacturer's site, and reinstall." }
    ],
    warn: "For paper jams: power off the printer first before removing paper to avoid damaging rollers.",
    sim: "printer"
  },
  malware: {
    title: "Malware / Virus Detection Response",
    severity: "critical",
    tags: ["Security", "Malware", "Incident Response", "Isolation"],
    steps: [
      { n: "ISOLATE IMMEDIATELY", t: "Disconnect the machine from the network (unplug Ethernet, disable Wi-Fi). Do NOT shut it down — evidence may be needed." },
      { n: "Alert Security Team", t: "Immediately notify your IT Security team or SOC. Log incident with time, symptoms, and affected user/machine." },
      { n: "Do Not Use the Machine", t: "Instruct the user to stop all activity on the device. Do not copy files to USB from the infected machine." },
      { n: "Run Full AV Scan", t: "Boot from a clean AV USB (bootable Malwarebytes or Windows Defender Offline). Run full scan." },
      { n: "Check Running Processes", t: "On a clean machine, review logs. Look for unknown processes, scheduled tasks, and startup items." },
      { n: "Change All Credentials", t: "From a CLEAN device, the user must change all passwords — especially email, VPN, and banking accounts." },
      { n: "Reimage if Necessary", t: "If infection is confirmed, perform a full system reimage. Do not simply remove malware — assume full compromise." }
    ],
    err: "This is a CRITICAL incident. Follow your company's Incident Response Plan immediately.",
    sim: "malware"
  },
  "slow-pc": {
    title: "Slow Computer / High CPU Usage",
    severity: "low",
    tags: ["Performance", "Task Manager", "Startup", "RAM", "SSD"],
    steps: [
      { n: "Check Task Manager", t: "Press <code>Ctrl+Shift+Esc</code>. Sort by CPU/Memory. Identify the process using the most resources." },
      { n: "Disable Startup Programs", t: "Go to <code>Task Manager → Startup</code> tab. Disable unnecessary programs that run at boot." },
      { n: "Check Disk Usage", t: "If disk is at 100%, check for Windows Update in background, or <code>SysMain</code> (Superfetch) service. Disable if SSD-based." },
      { n: "Run Disk Cleanup", t: "Search for <b>Disk Cleanup</b>. Clean temp files, Recycle Bin, Windows Update cache. Free up at least 15% of disk." },
      { n: "Check for Malware", t: "Run a full scan with Windows Defender or Malwarebytes. Malware often causes unexplained CPU spikes." },
      { n: "Upgrade Hardware", t: "If RAM is under 8GB, recommend upgrade to 16GB. If HDD, upgrade to SSD. Both yield significant improvements." }
    ],
    info: "Use <code>resmon.exe</code> (Resource Monitor) for more detailed insight into CPU, memory, disk, and network usage.",
    sim: "slow-pc"
  },
  bsod: {
    title: "Blue Screen of Death (BSOD) — Diagnosis",
    severity: "critical",
    tags: ["BSOD", "Windows", "Stop Error", "Driver", "Memory"],
    steps: [
      { n: "Note the Stop Code", t: "Write down the STOP error code shown on the blue screen (e.g., <code>PAGE_FAULT_IN_NONPAGED_AREA</code>, <code>IRQL_NOT_LESS_OR_EQUAL</code>)." },
      { n: "Check Event Viewer", t: "Open <code>eventvwr.msc</code> → Windows Logs → System. Look for critical errors around the crash timestamp." },
      { n: "Analyze Minidump", t: "Use <b>WinDbg</b> or <b>WhoCrashed</b> to analyze <code>C:\\Windows\\Minidump</code> files. Pinpoints the faulty driver." },
      { n: "Update/Roll Back Drivers", t: "If a recent driver update caused the BSOD, roll it back in Device Manager. Especially GPU and network drivers." },
      { n: "Run Memory Diagnostic", t: "Run <code>mdsched.exe</code> (Windows Memory Diagnostic). Bad RAM is a common BSOD cause." },
      { n: "Check Disk Health", t: "Run <code>chkdsk /f /r</code> from Admin CMD. Also check SSD/HDD health with CrystalDiskInfo." },
      { n: "Escalate to L2", t: "If BSODs persist after all steps, escalate with collected logs and minidump files to Level 2 support." }
    ],
    err: "Frequent BSODs indicate hardware failure or severe driver conflict. Do not dismiss — escalate promptly.",
    sim: "bsod"
  },
  email: {
    title: "Email Issues — Outlook / Exchange",
    severity: "medium",
    tags: ["Email", "Outlook", "Exchange", "IMAP", "SMTP"],
    steps: [
      { n: "Check Credentials", t: "Verify the user's email password hasn't expired. Try logging into OWA (Outlook Web App) first to isolate the issue." },
      { n: "Check Connection Status", t: "Look at the bottom of Outlook for status (e.g., \"Disconnected\" or \"Offline\"). Ensure \"Work Offline\" is not enabled." },
      { n: "Repair Outlook Profile", t: "Go to <code>Control Panel → Mail → Email Accounts</code>. Select the account and click <b>Repair</b>." },
      { n: "Rebuild OST File", t: "Close Outlook. Navigate to <code>%localappdata%\\Microsoft\\Outlook\\</code>. Rename the <code>.ost</code> file. Reopen Outlook to re-sync." },
      { n: "Check Exchange Server Status", t: "Confirm the Exchange/O365 service is running. Check <code>status.office.com</code> for Microsoft outages." },
      { n: "Flush Autocomplete Cache", t: "If sending to wrong address, clear the autocomplete: <code>File → Options → Mail → Empty Auto-Complete List</code>." }
    ],
    info: "For phishing emails: instruct user NOT to click any links. Forward to <code>security@company.com</code> and delete.",
    sim: "email"
  },
  "file-recovery": {
    title: "Accidentally Deleted File Recovery",
    severity: "medium",
    tags: ["File Recovery", "Recycle Bin", "Backup", "Shadow Copy", "OneDrive"],
    steps: [
      { n: "Check Recycle Bin", t: "First check the Recycle Bin on the desktop. Right-click the file → <b>Restore</b>. This works if not permanently deleted." },
      { n: "Check Cloud Sync", t: "If OneDrive/SharePoint is in use, check the Recycle Bin in the web portal — files stay 93 days." },
      { n: "Use Previous Versions", t: "Right-click the parent folder → <b>Properties → Previous Versions</b>. Restore from a shadow copy snapshot." },
      { n: "Check Network Backup", t: "Contact IT for the last backup snapshot. Most orgs run nightly backups to a NAS or cloud backup solution." },
      { n: "Run Recovery Tool", t: "If all else fails, use <b>Recuva</b> (free) or <b>Disk Drill</b> to scan the drive. Run ASAP — new writes overwrite deleted files." },
      { n: "Document for Prevention", t: "Educate user on saving to network drives or cloud storage to prevent future data loss." }
    ],
    warn: "Do NOT write new files to the affected drive before running recovery software — this permanently overwrites deleted data.",
    sim: "file-recovery"
  },
  "software-install": {
    title: "Software Installation Procedure",
    severity: "low",
    tags: ["Software", "Admin Rights", "MSI", "SCCM", "License"],
    steps: [
      { n: "Verify Authorization", t: "Confirm the software is approved by IT/management. Check the approved software list in the IT portal." },
      { n: "Check License Availability", t: "Verify there are available licenses for the requested software. Document the license key assignment." },
      { n: "Download from Official Source", t: "Download installers only from the vendor's official website or internal software repository. Never from third-party sites." },
      { n: "Run as Administrator", t: "Right-click the installer → <b>Run as Administrator</b>. This is required for system-level installations." },
      { n: "Follow Installation Wizard", t: "Accept the license, choose installation directory (default is usually fine), and deselect unwanted bundleware/toolbars." },
      { n: "Test & Confirm", t: "Launch the application, log in if needed, and confirm all features work. Update the asset management system." }
    ],
    info: "For enterprise deployments, use SCCM/Intune to push software silently to multiple machines simultaneously.",
    sim: "software-install"
  },
  "access-request": {
    title: "Access Request Procedure",
    severity: "low",
    tags: ["Access Control", "Active Directory", "RBAC", "Approval Workflow"],
    steps: [
      { n: "Receive & Validate Request", t: "Access requests must come through the official ticketing system. Verbal requests are not accepted." },
      { n: "Get Manager Approval", t: "A supervisor/manager must approve the request in writing (email or ticket approval). Document this." },
      { n: "Verify Business Justification", t: "Confirm the access is required for the employee's role. Apply the Principle of Least Privilege — grant minimum needed." },
      { n: "Grant Access in AD", t: "In Active Directory, add the user to the appropriate security group that controls the shared folder/resource." },
      { n: "Test Access", t: "Ask the user to try accessing the resource immediately to confirm permissions are active." },
      { n: "Document & Close", t: "Log the access grant with date, approver name, and resource. Close the ticket with full notes." }
    ],
    info: "All access changes must be reviewed quarterly for compliance. Unused access should be revoked promptly.",
    sim: null
  },
  "mobile-email": {
    title: "Company Email Setup on Mobile",
    severity: "low",
    tags: ["Mobile", "Exchange", "MDM", "iOS", "Android"],
    steps: [
      { n: "Check MDM Enrollment", t: "Corporate phones must be enrolled in MDM (Intune/Jamf) before email can be configured. Check enrollment first." },
      { n: "Open Mail Settings", t: "iOS: <code>Settings → Mail → Accounts → Add Account → Microsoft Exchange</code>. Android: <code>Settings → Accounts → Add Account → Exchange</code>." },
      { n: "Enter Credentials", t: "Enter the user's full company email and password. If MFA is enabled, complete the authentication prompt." },
      { n: "Auto-Discover Settings", t: "Allow the device to auto-discover server settings. If it fails, manually enter: Server: <code>mail.company.com</code>, Domain: <code>COMPANY</code>." },
      { n: "Configure Sync Settings", t: "Set sync period (last 1 month recommended), enable contacts/calendar sync as needed. Disable if personal privacy is a concern." },
      { n: "Test & Confirm", t: "Send a test email from PC to phone and reply. Confirm calendar events appear. Close ticket." }
    ],
    warn: "Ensure the device has a PIN/biometric lock — company policy may require this before email is allowed.",
    sim: null
  },
  "server-down": {
    title: "Server / Website Down — Response",
    severity: "critical",
    tags: ["Server", "Uptime", "Incident", "DNS", "Load Balancer"],
    steps: [
      { n: "Confirm the Outage", t: "Verify from multiple users/locations. Check your monitoring dashboard (Zabbix, Nagios, Datadog) for alerts." },
      { n: "Check Physical/VM Status", t: "Log into the hypervisor (VMware/Hyper-V) or data center console. Confirm the VM/server is running." },
      { n: "Check Services & Logs", t: "SSH into the server. Check service status: <code>systemctl status [service]</code>. Review logs in <code>/var/log/</code>." },
      { n: "Check DNS & Load Balancer", t: "Verify DNS is resolving correctly: <code>nslookup company.com</code>. Check if the load balancer shows the backend as healthy." },
      { n: "Restart Service if Safe", t: "If a specific service crashed, restart it: <code>systemctl restart nginx</code>. Only if confirmed safe by senior admin." },
      { n: "Notify Stakeholders", t: "Send a status update to affected users and management. Provide estimated resolution time." },
      { n: "Escalate to Senior Admin", t: "If root cause unclear, escalate immediately. Major outages require senior engineer or vendor involvement." }
    ],
    err: "This is a CRITICAL outage. Follow your Incident Response and Communication plan. Aim for RTO compliance.",
    sim: "server-down"
  }
};

export const simulations = {
  "password-reset": {
    title: "Password Reset Simulation",
    steps: [
      { title: "User Reports Issue", desc: "A call comes in. User says: <i>\"I can't log in, my password isn't working\"</i>. Your first step is identity verification.", screen: "> Helpdesk Portal\n> New Ticket #HD-4421\n> User: jdoe@company.com\n> Issue: Cannot login", action: "Verify: Ask for Employee ID and confirm staff email. Do NOT reset without verification.", result: null },
      { title: "Check Active Directory", desc: "Log into Active Directory Users & Computers to check the account status.", screen: "> Active Directory\n> Search: jdoe@company.com\n> Account Status: LOCKED (5 failed attempts)\n> Last login: Today 08:42 AM", action: "Action: Open account properties → Account tab → Check \"Unlock Account\".", result: "Account found: Locked after 5 failed attempts. Ready to unlock." },
      { title: "Unlock & Reset", desc: "Unlock the account and reset the password following security policy.", screen: "> AD Reset Password Dialog\n> User: jdoe\n> New Temp Password: ●●●●●●●●●\n> ☑ User must change at next logon", action: "Set temp password per policy (TempPass@[MonthYear]). Enable \"must change at next logon\".", result: "Password reset successful. Account unlocked." },
      { title: "Communicate Securely", desc: "Send the temporary password to the user via a secure, verified channel.", screen: "> Secure IT Portal Message\n> To: jdoe (verified phone: xxx-4421)\n> Message: Your temp password is ready.\n> Link: reset.company.com/verify", action: "Call the user on their verified phone number. Read temp password aloud — never email it.", result: "User notified via secure phone call." },
      { title: "Confirm & Close", desc: "Ask the user to log in and change their password right now.", screen: "> Ticket #HD-4421\n> Status: Pending User Confirmation\n> User logged in: ✓\n> Password changed: ✓", action: "Confirm user can access email and systems. Document the action in the ticket. Close.", result: "Ticket closed. User access restored successfully!" }
    ]
  },
  "no-internet": {
    title: "No Internet Connection Simulation",
    steps: [
      { title: "Initial Triage", desc: "User reports no internet. Start by checking if it's isolated to one device or the whole office.", screen: "> Ping Test\n> ping 8.8.8.8\n> Request timed out.\n> Request timed out.\n> Packets: Sent=4, Lost=4 (100%)", action: "Ask: Is it just this PC or all devices? Check another device on the same network.", result: "Other devices also have no internet — likely a router/network issue." },
      { title: "Check IP Address", desc: "Run ipconfig to check if the device has a valid IP or a self-assigned (APIPA) address.", screen: "> ipconfig\n> Ethernet adapter:\n> IPv4: 169.254.32.10 ← APIPA!\n> Subnet Mask: 255.255.0.0\n> Default Gateway: (blank)", action: "APIPA address (169.254.x.x) means DHCP server is not responding. Release and renew.", result: "Confirmed: Device has self-assigned IP — DHCP issue detected." },
      { title: "Release & Renew IP", desc: "Force the network adapter to request a new IP from the DHCP server.", screen: "> ipconfig /release\n> Releasing...\n> ipconfig /renew\n> Renewing...\n> IPv4: 192.168.1.42 ✓\n> Gateway: 192.168.1.1 ✓", action: "Run ipconfig /flushdns after getting a valid IP. Try browsing again.", result: "Valid IP obtained! Gateway is reachable. Testing internet..." },
      { title: "Test Connectivity", desc: "Ping the gateway and external addresses to confirm connectivity is restored.", screen: "> ping 192.168.1.1\n> Reply from 192.168.1.1: 1ms ✓\n> ping 8.8.8.8\n> Reply from 8.8.8.8: 18ms ✓\n> ping google.com\n> Reply from 142.250.x.x ✓", action: "Browser test: Open a website. Confirm full access.", result: "Internet restored! Root cause: DHCP lease had expired. Resolved by renewing." },
      { title: "Document & Close", desc: "Log the resolution steps and advise the user.", screen: "> Ticket #HD-7823\n> Resolution: DHCP renewal\n> Time to resolve: 12 min\n> Status: CLOSED ✓", action: "Educate user: If this recurs, they can run ipconfig /renew themselves. Escalate if persistent.", result: "Ticket closed. User confirmed internet working." }
    ]
  },
  malware: {
    title: "Malware Detection Simulation",
    steps: [
      { title: "Alert Received", desc: "AV software triggers an alert. User reports suspicious pop-ups and slow PC. Treat as active malware.", screen: "> ALERT: Malware Detected!\n> Threat: Trojan.GenericKD\n> Location: C:\\Users\\Downloads\\setup.exe\n> Risk: HIGH", action: "IMMEDIATELY isolate the machine. Do NOT wait. Unplug network cable NOW.", result: "Machine isolated. Network cable disconnected. Wi-Fi disabled." },
      { title: "Notify Security Team", desc: "This is a security incident. Escalate immediately — do not try to handle alone.", screen: "> Security Incident Ticket\n> Priority: CRITICAL\n> Assigned: SOC Team\n> Time logged: 10:23 AM\n> Machine: PC-JDOE-007", action: "Call the Security Operations Center directly. Do not just email — call.", result: "SOC notified. IR team is responding. User instructed to stop using PC." },
      { title: "Run Offline AV Scan", desc: "Boot from clean AV USB to scan without the OS being active (rootkits can hide from running OS).", screen: "> Windows Defender Offline\n> Scanning...\n> Files scanned: 284,921\n> Threats found: 3\n>  - Trojan.GenericKD ✗\n>  - PUP.Optional ✗\n>  - Backdoor.Agent ✗", action: "Let the scan complete fully. Note all threats found for the incident report.", result: "3 threats detected: 1 Trojan, 1 PUP, 1 Backdoor — reimage recommended." },
      { title: "Change All Passwords", desc: "Assume all credentials on this machine are compromised.", screen: "> From CLEAN device:\n> ☑ Email password changed\n> ☑ VPN credentials changed\n> ☑ Company portal reset\n> ☑ MFA devices re-enrolled", action: "User must change passwords from a DIFFERENT, clean machine. Enable MFA if not already on.", result: "All critical passwords changed from clean device." },
      { title: "Reimage Machine", desc: "Full reimage is the safest resolution for confirmed malware. Backup only clean data files.", screen: "> Reimage Tool\n> Format: Complete wipe\n> OS: Windows 11 Enterprise\n> Progress: ████████ 100%\n> Status: Clean install complete ✓", action: "After reimage: reinstall apps, restore clean files from backup, rejoin to domain.", result: "Machine reimaged. Clean and ready for user. Incident report filed." }
    ]
  },
  bsod: {
    title: "BSOD Diagnosis Simulation",
    steps: [
      { title: "Capture the Error", desc: "When the BSOD appears, photograph or note the STOP code and failing module shown on screen.", screen: "> STOP CODE:\n> IRQL_NOT_LESS_OR_EQUAL\n> Failing Module: NETIO.SYS\n> Error: 0x0000000A\n> Dump saved: C:\\Windows\\Minidump", action: "Note the STOP code. The module name (NETIO.SYS) suggests a network driver issue.", result: "STOP code noted: IRQL_NOT_LESS_OR_EQUAL | Module: NETIO.SYS" },
      { title: "Check Event Viewer", desc: "Boot into Windows and immediately check Event Viewer for critical errors at crash time.", screen: "> Event Viewer → System Log\n> [ERROR] 14:32:01 - Kernel-Power\n> [CRIT]  14:31:59 - NETIO.SYS fault\n> [WARN]  14:28:00 - Driver update applied", action: "Cross-reference: A driver update was applied 4 minutes before the crash. Likely root cause.", result: "Root cause identified: Network driver update at 14:28 caused BSOD." },
      { title: "Analyze Minidump", desc: "Use WhoCrashed or WinDbg to analyze the minidump file for detailed driver info.", screen: "> WhoCrashed Analysis\n> Crash Time: Today 14:32\n> Driver: Intel_82579LM.sys\n> Version: 12.18.9.23 (updated today)\n> Recommendation: Roll back driver", action: "The newly updated Intel NIC driver is the culprit. Roll it back in Device Manager.", result: "Faulty driver identified: Intel NIC driver v12.18.9.23" },
      { title: "Roll Back Driver", desc: "Open Device Manager, find the Network Adapter, and roll back to the previous driver version.", screen: "> Device Manager\n> Network Adapters\n>  Intel(R) Ethernet Connection\n>  Driver tab → Roll Back Driver\n>  Reverting to 12.17.10.9... ✓", action: "After rollback, restart the PC. Monitor for 30 minutes to confirm stability.", result: "Driver rolled back. PC rebooted. Monitoring... Stable after 30 min." },
      { title: "Document & Monitor", desc: "Document the incident and add a note to block the problematic driver update via WSUS.", screen: "> Ticket #HD-9912\n> Root Cause: Faulty NIC driver update\n> Resolution: Driver rollback\n> WSUS: Driver blocked from auto-deploy\n> Status: RESOLVED ✓", action: "Set a WSUS exclusion for the problematic driver version. Close ticket.", result: "Ticket resolved. Driver exclusion applied. No further BSODs reported." }
    ]
  },
  printer: {
    title: "Printer Offline Simulation",
    steps: [
      { title: "Check Printer Status", desc: "User says printer shows \"Offline\". Check the physical printer and Windows print queue.", screen: "> Devices & Printers\n> HP LaserJet Pro\n> Status: OFFLINE ⚠\n> Jobs in queue: 3 stuck", action: "Physically check the printer: Is it powered on? Does it show any error lights or messages?", result: "Printer is powered on but showing error light — paper present but not printing." },
      { title: "Clear Print Queue", desc: "Stuck jobs in the print queue can cause the printer to appear offline. Clear them first.", screen: "> Print Queue\n> Job 1: Report.pdf — Error\n> Job 2: Invoice.xlsx — Deleting...\n> Job 3: Email.pdf — Deleting...\n> Queue cleared ✓", action: "If jobs won't delete: restart the Print Spooler service via services.msc", result: "Queue cleared. Restarting Print Spooler service..." },
      { title: "Restart Print Spooler", desc: "The Print Spooler service manages all print jobs. Restarting it fixes most spooler-related issues.", screen: "> services.msc\n> Print Spooler\n> Status: Running\n> Right-click → Restart\n> Service restarted ✓", action: "After restart, right-click the printer → \"See what's printing\" → check if Offline is cleared.", result: "Print Spooler restarted. Printer status: checking..." },
      { title: "Set Online Manually", desc: "If still showing offline, manually set the printer online via the print queue window.", screen: "> Print Queue Window\n> Menu: Printer\n> ☑ Use Printer Offline ← UNCHECKED!\n> Printer set to ONLINE ✓", action: "Printer → Uncheck \"Use Printer Offline\". Print a test page.", result: "Printer is now ONLINE. Test page sent successfully." },
      { title: "Confirm & Close", desc: "User confirms printing is working. Close ticket with resolution notes.", screen: "> Ticket #HD-5531\n> Resolution: Cleared queue + Print\n>   Spooler restart + Set online\n> User confirmed: ✓ Printing\n> Status: CLOSED ✓", action: "Advise user: If this recurs, show them how to clear the queue themselves.", result: "Ticket closed. Printer operational." }
    ]
  },
  "slow-pc": {
    title: "Slow Computer Diagnosis Simulation",
    steps: [
      { title: "Open Task Manager", desc: "First, check what's actually consuming resources right now.", screen: "> Task Manager (Ctrl+Shift+Esc)\n> CPU: 94% ← HIGH\n> Memory: 87%\n> Disk: 12%\n> Top process: SearchIndexer.exe (68%)", action: "Sort by CPU. Identify the top offender. SearchIndexer at 68% is causing the slowdown.", result: "Root cause candidate: Windows Search Indexer spiking CPU." },
      { title: "Check Startup Programs", desc: "Too many startup programs drain resources on boot and keep running in background.", screen: "> Task Manager → Startup Tab\n> Skype: High impact ← DISABLED\n> OneDrive: High impact ← DISABLED\n> iTunes Helper: Medium ← DISABLED\n> Teams: Medium (kept — required)", action: "Disable non-essential startup programs. Do NOT disable antivirus or company security tools.", result: "Disabled 3 high-impact startup programs." },
      { title: "Run Disk Cleanup", desc: "Low disk space causes Windows to slow down significantly. Clean temp files.", screen: "> Disk Cleanup: C:\\\n> Temp files: 4.2 GB\n> Recycle Bin: 1.8 GB\n> Update cache: 2.1 GB\n> Total to free: 8.1 GB → Cleaning...", action: "Also check: is C: drive over 85% full? Recommend moving files to D: or network drive.", result: "8.1 GB reclaimed. Disk usage now at 67%." },
      { title: "Rebuild Search Index", desc: "A corrupted or actively-rebuilding search index causes massive CPU usage.", screen: "> Control Panel → Indexing Options\n> Advanced → Rebuild Index\n> Status: Rebuilding (this may take time)\n> CPU usage drop: 94% → 18% ✓", action: "Rebuilding takes 30-60 min. Advise user to leave PC on. CPU will spike initially then drop.", result: "Search index rebuilding. CPU normalizing." },
      { title: "Confirm & Monitor", desc: "Follow up with the user after 1 hour to confirm improvement.", screen: "> Follow-up check:\n> CPU: 14% ✓\n> Memory: 52% ✓\n> Boot time: 45s (was 3:20) ✓\n> User feedback: Much faster!", action: "If still slow: consider RAM upgrade (if under 8GB) or SSD upgrade (if still on HDD).", result: "Performance issue resolved. Ticket closed. Hardware upgrade noted for review." }
    ]
  },
  "server-down": {
    title: "Server Outage Response Simulation",
    steps: [
      { title: "Confirm the Outage", desc: "Multiple users report the internal portal is down. Verify scope before acting.", screen: "> Monitoring Dashboard\n> ALERT: web-prod-01 UNREACHABLE\n> Alert since: 10:47 AM\n> Affected users: 147\n> Uptime lost: 8 min", action: "Check monitoring dashboard. Confirm alert is real — not a false positive. Check from 2 locations.", result: "Confirmed: Server unreachable. Alert is genuine. Incident declared." },
      { title: "Check Server Status", desc: "Access the hypervisor/data center console to check if the VM/server is running.", screen: "> VMware vCenter\n> web-prod-01\n> Power: ON ✓\n> CPU: 0.2% (unusually low)\n> Network: No traffic ← SUSPICIOUS", action: "Server is on but serving no traffic. SSH into the server.", result: "Server powered on. No traffic suggests a service crash, not hardware failure." },
      { title: "Check Running Services", desc: "SSH into the server and check if the web service is actually running.", screen: "> ssh admin@10.10.1.50\n> $ systemctl status nginx\n> ● nginx - FAILED\n> Process exited with: 1\n> Error: /var/log/nginx/error.log", action: "Service is down. Check the error log to understand why it crashed.", result: "nginx is down. Checking error log..." },
      { title: "Identify Root Cause", desc: "Read the nginx error log to find what caused the service to crash.", screen: "> tail -n 50 /var/log/nginx/error.log\n> [emerg] 10:47:02 - bind() to\n>   0.0.0.0:443 failed (98: Address\n>   already in use)\n> nginx failed to start", action: "Port 443 is in use by another process. Find and resolve the conflict.", result: "Root cause: Port 443 conflict. Another process grabbed the port." },
      { title: "Resolve & Restore", desc: "Kill the conflicting process and restart nginx to restore service.", screen: "> netstat -tulpn | grep 443\n> tcp 0.0.0.0:443 PID 8821\n> ps aux | grep 8821 → orphan process\n> kill 8821\n> systemctl restart nginx ✓\n> Service restored! 10:58 AM", action: "Notify stakeholders immediately. Send all-clear message. Document timeline.", result: "Service restored. Outage duration: 11 minutes. RCA filed." }
    ]
  },
  "file-recovery": {
    title: "File Recovery Simulation",
    steps: [
      { title: "User Deleted File", desc: "User accidentally deleted an important spreadsheet. They just noticed it's gone.", screen: "> Recycle Bin: EMPTY\n> File: Q3_Budget_Final.xlsx\n> Last modified: Yesterday 5:30 PM\n> Location: C:\\Users\\ana\\Documents", action: "Recycle Bin is empty. Move to next recovery options immediately.", result: "Recycle Bin empty. File not there. Proceeding to shadow copy." },
      { title: "Check Previous Versions", desc: "Windows may have a shadow copy of the folder from before the deletion.", screen: "> Right-click: Documents folder\n> Properties → Previous Versions\n> Yesterday 6:00 PM ← AVAILABLE!\n> 2 days ago 6:00 PM\n> Last week 6:00 PM", action: "Double-click the \"Yesterday 6:00 PM\" snapshot. Browse to find the file.", result: "Shadow copy found from yesterday at 6:00 PM — file should be inside." },
      { title: "Restore the File", desc: "Copy the file from the shadow copy to a safe location (not the same folder yet).", screen: "> Shadow Copy: Yesterday 6:00 PM\n> Found: Q3_Budget_Final.xlsx ✓\n> Size: 248 KB\n> Modified: Yesterday 5:30 PM\n> Copying to Desktop... ✓", action: "Restore to Desktop first to verify integrity before overwriting anything.", result: "File successfully restored to Desktop from shadow copy!" },
      { title: "Verify File Integrity", desc: "Open the recovered file and confirm data is intact before closing the ticket.", screen: "> Q3_Budget_Final.xlsx opened ✓\n> Sheets: 8 (all present)\n> Last row: 247 (complete)\n> Formulas: Calculating ✓\n> User confirmed: All data intact!", action: "Ask user to check all sheets and key data before confirming.", result: "File verified intact. All data present." },
      { title: "Educate & Close", desc: "Prevent future data loss by educating the user on backup practices.", screen: "> Ticket #HD-6634\n> Recovery method: Shadow Copy\n> File restored: ✓\n> User trained on:\n>  - OneDrive auto-save\n>  - Network drive usage\n> Status: CLOSED ✓", action: "Enable OneDrive sync for the user. Show them how to use Previous Versions themselves.", result: "Ticket closed. User enrolled in OneDrive sync for automatic backup." }
    ]
  },
  email: {
    title: "Email Issue Simulation",
    steps: [
      { title: "Test via OWA First", desc: "User says Outlook won't send emails. Test via Outlook Web App to isolate app vs server.", screen: "> Outlook Web App\n> https://mail.company.com\n> Logging in... ✓\n> Sending test email...\n> SENT ✓ (received by tester)", action: "OWA works! This means Exchange server is fine — the issue is with Outlook desktop app.", result: "Server is healthy. Problem is the Outlook desktop application or local profile." },
      { title: "Check Outlook Status", desc: "Look at Outlook status bar and connection state.", screen: "> Outlook Status Bar (bottom right):\n> \"Disconnected\" ← problem!\n> Checking: File → Work Offline\n> ☑ Work Offline ← WAS CHECKED!", action: "\"Work Offline\" was accidentally enabled. Uncheck it: File → \"Work Offline\" to toggle off.", result: "Work Offline was the cause! Unchecking now..." },
      { title: "Reconnect & Test", desc: "Toggle offline mode off and watch Outlook reconnect to Exchange.", screen: "> Outlook connecting...\n> Authenticating...\n> Syncing inbox...\n> Status: Connected to Microsoft Exchange ✓\n> Sending queued emails... ✓", action: "Watch the status bar — should show \"Connected\" within 30 seconds.", result: "Outlook reconnected. Queued emails sent successfully." },
      { title: "Check Send/Receive", desc: "Manually trigger a send/receive to process any stuck items.", screen: "> Send/Receive → Send All\n> Sending: 3 queued messages\n> Receiving: 7 new emails\n> All synchronized ✓", action: "If any email still fails to send, check recipients' addresses and attachment size limits.", result: "All emails processed. Inbox and Outbox are clear." },
      { title: "Confirm & Close", desc: "User confirms everything is working. Note: educate about Work Offline mode.", screen: "> Ticket #HD-3371\n> Root cause: \"Work Offline\" enabled\n> Resolution: Toggled offline mode off\n> User educated: ✓\n> Status: CLOSED ✓", action: "Advise user: if Outlook ever says disconnected, check File menu for Work Offline toggle.", result: "Ticket closed. Quick resolution — 5 minutes total." }
    ]
  },
  "software-install": {
    title: "Software Installation Simulation",
    steps: [
      { title: "Receive & Validate Request", desc: "User submits a request to install Adobe Acrobat Pro.", screen: "> Ticket #HD-8812\n> Request: Adobe Acrobat Pro\n> Requested by: maria.santos\n> Department: Legal\n> Manager approval: PENDING", action: "Check the approved software list. Adobe Acrobat Pro is approved. Awaiting manager approval.", result: "Software is on approved list. Awaiting manager email approval." },
      { title: "Get Manager Approval", desc: "Wait for and confirm manager approval before proceeding.", screen: "> Email received:\n> From: supervisor@company.com\n> Subject: Re: Adobe Acrobat Pro\n> \"Approved for maria.santos.\n>  License from pool #AC-2024-047\"", action: "Save approval email to ticket. Note the license number for asset tracking.", result: "Approval received. License #AC-2024-047 assigned." },
      { title: "Download & Verify", desc: "Download the installer from the official Adobe source (not from the user's PC).", screen: "> Software Repository\n> Adobe Acrobat Pro 2024\n> Version: 24.2.20736\n> SHA256: a3f2...91bc ✓ (verified)\n> Size: 872 MB", action: "Always verify the file hash matches the official published hash before installing.", result: "Installer verified. Hash matches official source." },
      { title: "Run Installation", desc: "Connect to the user's machine (remote or in-person) and run the installer as admin.", screen: "> Installing Adobe Acrobat Pro\n> Running as: Administrator\n> ████████████████ 100%\n> Installation complete ✓\n> License activated: AC-2024-047", action: "Walk through the wizard — accept license, default directory, skip optional toolbars.", result: "Adobe Acrobat Pro installed and license activated." },
      { title: "Test & Document", desc: "Test the application with the user and update asset management.", screen: "> Test: Opening PDF... ✓\n> Test: Editing PDF... ✓\n> Asset DB updated:\n>   User: maria.santos\n>   License: AC-2024-047\n>   Date: Today\n> Ticket CLOSED ✓", action: "Show user the basic features. Confirm all functions they need work correctly.", result: "Installation confirmed. Asset recorded. Ticket closed." }
    ]
  }
};
