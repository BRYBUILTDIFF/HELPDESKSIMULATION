const stripHtml = value => String(value || "").replace(/<[^>]*>/g, "");
function normalizeCommand(input = "") {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s+/g, " ");
}

function cleanCommandCandidate(value = "") {
  return String(value || "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.;:,!?]+$/g, "")
    .trim();
}

function isLikelyCommandCandidate(value = "") {
  const candidate = cleanCommandCandidate(value);
  if (!candidate || candidate.length < 2) {
    return false;
  }
  if (candidate.length > 140) {
    return false;
  }
  if (/^(ticket|status|category|user|issue|scenario|resolution|progress|result)\b/i.test(candidate)) {
    return false;
  }
  if (/\?$/.test(candidate)) {
    return false;
  }

  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length > 16) {
    return false;
  }

  const first = words[0] || "";
  if (!/^[a-z0-9_.-]+$/i.test(first)) {
    return false;
  }

  return (
    /(^|\s)(\/[-a-z0-9]+|--[-a-z0-9]+)\b/i.test(candidate) ||
    /[|\\]/.test(candidate) ||
    /^[a-z]+-[a-z]/i.test(first) ||
    /^(ipconfig|ping|tracert|nslookup|tasklist|wmic|cleanmgr|sfc|dism|sc|net|get-service|del|attrib|dir|xcopy|search-adaccount|unlock-adaccount|set-adaccountpassword|ssh|systemctl|tail|netstat|mrt|eventvwr|chkdsk|resmon|services\.msc|help|clear|cls|whoami|hostname|echo|cd|mkdir|gpupdate|netsh)\b/i.test(
      candidate
    )
  );
}

function splitMultiCommands(candidate = "") {
  const value = String(candidate || "").trim();
  if (!value) {
    return [];
  }
  return value
    .split(/\s+(?:then|and then)\s+|\s*&&\s*|\s*;\s*/i)
    .map((part) => cleanCommandCandidate(part))
    .filter(Boolean);
}

function extractCommandCandidatesFromLine(line = "") {
  const clean = stripHtml(String(line || "")).trim();
  if (!clean) {
    return [];
  }

  const candidates = [];
  const backtickMatches = clean.match(/`([^`]+)`/g) || [];
  backtickMatches.forEach((chunk) => {
    const command = cleanCommandCandidate(chunk.replace(/`/g, "").trim());
    splitMultiCommands(command).forEach((part) => candidates.push(part));
  });

  const promptStyle = clean.match(/^(?:PS\s+[^>]*>|[A-Za-z]:\\[^>]*>|[>$#$])\s*(.+)$/);
  if (promptStyle?.[1]) {
    splitMultiCommands(promptStyle[1].trim()).forEach((part) => candidates.push(part));
  }

  const taggedCommand = clean.match(/^(?:command|run|execute|type)\s*[:\-]\s*(.+)$/i);
  if (taggedCommand?.[1]) {
    splitMultiCommands(taggedCommand[1].trim()).forEach((part) => candidates.push(part));
  }

  const actionLabel = clean.match(/^(?:action|next|step)\s*[:\-]\s*(.+)$/i);
  if (actionLabel?.[1]) {
    splitMultiCommands(actionLabel[1].trim()).forEach((part) => candidates.push(part));
  }

  const runInlineMatches = clean.match(/\b(?:run|execute|type)\s+([a-z0-9_.-]+(?:\s+[^.;,\n]+)?)/gi) || [];
  runInlineMatches.forEach((match) => {
    const value = cleanCommandCandidate(match.replace(/^(?:run|execute|type)\s+/i, ""));
    splitMultiCommands(value).forEach((part) => candidates.push(part));
  });

  const unique = [];
  const seen = new Set();
  candidates.forEach((entry) => {
    const cleaned = cleanCommandCandidate(entry);
    const key = normalizeCommand(cleaned);
    if (!cleaned || !isLikelyCommandCandidate(cleaned) || seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(cleaned);
  });
  return unique;
}

function extractExpectedCommands(stepText = "", stepDetail = {}) {
  const explicitStepCommands = Array.isArray(stepDetail?.expectedCommands)
    ? stepDetail.expectedCommands.map((cmd) => cleanCommandCandidate(cmd)).filter(Boolean)
    : [];
  if (explicitStepCommands.length > 0) {
    return [...new Set(explicitStepCommands.map((cmd) => normalizeCommand(cmd)).filter(Boolean))];
  }

  const source = `${stepText}\n${stepDetail?.desc || ""}\n${stepDetail?.action || ""}\n${stepDetail?.screen || ""}`;
  const commands = source
    .split("\n")
    .flatMap((line) => extractCommandCandidatesFromLine(line))
    .filter(Boolean);

  if (commands.length === 0) {
    commands.push("help");
  }

  return [...new Set(commands.map((cmd) => normalizeCommand(cmd)).filter(Boolean))];
}


module.exports = { normalizeCommand, extractExpectedCommands };
