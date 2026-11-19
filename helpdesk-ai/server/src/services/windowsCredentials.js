const crypto = require('crypto');
const {seal, open} = require('../utils/encryptedSecret');
function uniqueCredentialsEnabled() { return process.env.NODE_ENV === 'production' || process.env.WINDOWS_UNIQUE_CREDENTIALS === 'true'; }
function username() {
  const name = process.env.WINDOWS_LAB_USERNAME || 'labuser';
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/.test(name)) throw new Error('Invalid Windows lab account name');
  return name;
}
function credentials(session) {
  if (session.credential) return { username:username(), password:open(session.credential, `lab:${session.id}`) };
  if (uniqueCredentialsEnabled()) throw new Error('This legacy lab must expire before a new secure lab can be opened');
  return {username:username(),password:process.env.WINDOWS_LAB_PASSWORD || ''};
}
async function prepare(session, db) {
  if (!uniqueCredentialsEnabled()) return session;
  if (!session.credential) {
    // Stable persisted credentials preserve EC2 ClientToken retry semantics.
    const encrypted = seal(`Aa1!${crypto.randomBytes(24).toString('hex')}`, `lab:${session.id}`);
    await db.simulationSession.updateMany({where:{id:session.id,credential:null},data:{credential:encrypted}});
    session = await db.simulationSession.findUnique({where:{id:session.id}});
  }
  return session;
}
function userData(session) {
  const account = credentials(session);
  // Account name is validated and password is generated hex with a fixed prefix.
  const script = `<powershell>
$ErrorActionPreference = 'Stop'
$secure = ConvertTo-SecureString '${account.password}' -AsPlainText -Force
if (Get-LocalUser -Name '${account.username}' -ErrorAction SilentlyContinue) {
  Set-LocalUser -Name '${account.username}' -Password $secure
} else {
  New-LocalUser -Name '${account.username}' -Password $secure -PasswordNeverExpires
}
Enable-LocalUser -Name '${account.username}'
$group = Get-LocalGroup -SID 'S-1-5-32-555'
Add-LocalGroupMember -Group $group -Member '${account.username}' -ErrorAction SilentlyContinue
</powershell>`;
  return Buffer.from(script).toString('base64');
}
module.exports = { uniqueCredentialsEnabled, credentials, prepare, userData };
