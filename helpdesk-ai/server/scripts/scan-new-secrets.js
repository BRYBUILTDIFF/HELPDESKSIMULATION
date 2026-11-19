// Scan added Git lines only; report filenames/line numbers, never secret values.
const {execFileSync} = require('child_process');
function suspicious(line) {
  return /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@[^\s]+/i.test(line);
}
function scan(diff) {
  const findings=[]; let file='',number=0;
  for(const line of diff.split(/\r?\n/)) {
    if(line.startsWith('+++ b/')) {file=line.slice(6);continue;}
    const hunk=/^@@ .* \+(\d+)/.exec(line);if(hunk){number=Number(hunk[1]);continue;}
    if(line.startsWith('+')&&!line.startsWith('+++')) {
      if(suspicious(line.slice(1)))findings.push({file,line:number}); number++;
    } else if(!line.startsWith('-')&&!line.startsWith('\\'))number++;
  }
  return findings;
}
if(require.main===module) {
  try {
    const base=process.env.SECRET_SCAN_BASE;
    if(base&&!/^[a-f0-9]{40}$/i.test(base))throw new Error('Invalid base revision');
    const range=base&&!/^0+$/.test(base)?[base,'HEAD']:['--cached'];
    const diff=execFileSync('git',['diff','--no-ext-diff','--no-textconv','--unified=0',...range,'--','.',':(exclude)**/node_modules/**',':(exclude)**/dist/**'],{encoding:'utf8',maxBuffer:32*1024*1024});
    const findings=scan(diff);
    for(const finding of findings)console.error(`Potential credential in ${finding.file}:${finding.line}; remove it and rotate if real.`);
    if(findings.length)process.exitCode=1;
    else console.log('No known credential patterns found in added lines. This does not verify credential revocation.');
  }catch{console.error('Secret scan could not complete. Check Git/base revision configuration.');process.exitCode=1;}
}
module.exports={scan,suspicious};
