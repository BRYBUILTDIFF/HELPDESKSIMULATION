const { execFileSync } = require("child_process");
const path = require("path");
const root = path.resolve(__dirname, "../../..");
const git = args => execFileSync("git", ["-c", `safe.directory=${root.replace(/\\/g, "/")}`, ...args], {cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
const patterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["provider-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ["credential-assignment", /(?:JWT_(?:ACCESS|REFRESH)_SECRET|AWS_SECRET_ACCESS_KEY|GUAC_JSON_SECRET)\s*=\s*["']?[a-zA-Z0-9/+_-]{24,}/]
];
let matches = 0, inspected = 0, skipped = 0;
const candidates = git(["rev-list", "--objects", "--all"]).trim().split("\n").flatMap(item => {
  const separator=item.indexOf(" ");if(separator<0)return [];
  const id=item.slice(0,separator),name=item.slice(separator+1);
  if (/(?:^|\/)(?:node_modules|dist)\//.test(name) || !/\.(?:js|jsx|json|md|txt|sql|ya?ml|env|pem|key|conf|ps1|sh)$|(?:^|\/)\.env(?:\.|$)/i.test(name)) {skipped++;return [];}
  return [{id,name}];
});
if(candidates.length){
  const metadata=execFileSync("git",["-c", "safe.directory="+root.replace(/\\/g,"/"),"cat-file","--batch-check"],{cwd:root,input:candidates.map(x=>x.id).join("\n")+"\n",encoding:"utf8",maxBuffer:64*1024*1024}).trim().split("\n");
  const selected=candidates.filter((x,i)=>{const parts=metadata[i].split(" ");if(parts[1]!=="blob"||Number(parts[2])>2*1024*1024){skipped++;return false;}return true;});
  const data=execFileSync("git",["-c","safe.directory="+root.replace(/\\/g,"/"),"cat-file","--batch"],{cwd:root,input:selected.map(x=>x.id).join("\n")+"\n",maxBuffer:256*1024*1024});
  let cursor=0;
  for(const item of selected){
    const end=data.indexOf(10,cursor);const size=Number(data.subarray(cursor,end).toString().split(" ")[2]);cursor=end+1;
    const content=data.subarray(cursor,cursor+size).toString("utf8");cursor+=size+1;inspected++;
    content.split("\n").forEach((line,index)=>{for(const [type,pattern]of patterns)if(pattern.test(line)){console.log(JSON.stringify({path:item.name,line:index+1,type,revisionBlob:item.id.slice(0,12),testFixture:/test\//i.test(item.name)}));matches++;}});
  }
}
console.log(JSON.stringify({inspected,skipped,potentialMatches:matches,scope:"Reachable Git history; selected source text formats up to 2 MB; excludes node_modules/dist and uncommitted working-tree files."}));
if(matches)process.exitCode=2;
