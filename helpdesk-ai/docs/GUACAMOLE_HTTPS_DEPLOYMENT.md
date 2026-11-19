# Guacamole HTTPS setup for Vercel and Render

Prepared: 19 November 2026 (Asia/Manila).

This guide uses a free DuckDNS hostname, the existing Ubuntu EC2 gateway, Nginx and a Let's Encrypt certificate. It does not create or change cloud resources automatically. DuckDNS and the certificate do not remove AWS compute/public IPv4 charges.

Keep Windows launches disabled until the gateway, AWS permissions and independent expiration cleanup are verified. Existing admin Windows drafts can remain available.

## Before starting

You need access to AWS EC2, the gateway Ubuntu shell, Render, Vercel and a DuckDNS account. Do not post SSH keys, API keys, DuckDNS tokens, Windows passwords or signed Guacamole links.

Replace every `YOUR-HOST.duckdns.org` below with your actual hostname. Commands labelled **Ubuntu** run inside the EC2 gateway, not Windows PowerShell and not Render. Commands labelled **PowerShell** run on your computer.

The previous gateway address was `13.228.25.121`; verify the current address in AWS instead of assuming it is unchanged. This procedure assumes host-installed Nginx proxies Guacamole at `127.0.0.1:8080`. Check that assumption before editing anything. If another proxy or Docker container owns ports 80/443, adapt that existing proxy rather than installing a competing server.

## 1. Verify the disabled flags

**Render → API Web Service → Environment**:

```dotenv
WINDOWS_SIMULATIONS_ENABLED=false
```

**Vercel → Project → Settings → Environment Variables**:

```dotenv
VITE_WINDOWS_SIMULATIONS_ENABLED=false
VITE_API_URL=/
```

Save/deploy if changed. Disabled launches do not stop already-running EC2 instances or their charges; inspect those separately.

## 2. Confirm the gateway public address

**AWS Console**, choose **Asia Pacific (Singapore), ap-southeast-1**:

1. Open EC2 → Instances.
2. Select the existing Ubuntu Guacamole gateway, not the Windows master image or a temporary student lab.
3. Verify its instance ID/name, Running state, public IPv4, VPC and security group.
4. Open the current `http://PUBLIC-IP/guacamole/` in your browser. Do not enter credentials over HTTP; this is only a reachability check.

For a stable address, EC2 → Elastic IP addresses → Allocate Elastic IP address → associate it with this gateway. This is optional for a short demonstration and has AWS public IPv4 charges. Associating it changes the public address; use the new address for DNS and SSH. Without a stable address, update DNS after a gateway stop/start. Do not stop the gateway just to test this.

## 3. Create a free DuckDNS hostname

**Browser**:

1. Open [DuckDNS](https://www.duckdns.org/), sign in and choose an available subdomain, for example `helpdesk-lab-yourname`.
2. Add it. Your full name becomes `helpdesk-lab-yourname.duckdns.org`.
3. Set its current IP to the gateway's verified public IPv4 and select the update control.
4. Do not set an IPv6/AAAA address unless IPv6 actually reaches this gateway. An incorrect AAAA record can break certificate validation.
5. Keep the DuckDNS account token private. Manual IP updates are enough with a stable gateway address; automatic updates are optional.

**PowerShell**:

```powershell
Resolve-DnsName YOUR-HOST.duckdns.org -Type A
```

Expected: the returned A record matches the gateway's current public IPv4. Wait for DNS propagation before requesting a certificate. If it stays wrong, correct DuckDNS; do not repeatedly request certificates.

## 4. Check gateway and Windows network rules

**AWS → EC2 → gateway → Security → attached security group → Edit inbound rules**:

| Type | Port | Source |
| --- | --- | --- |
| HTTP | TCP 80 | `0.0.0.0/0`, used for certificate validation and redirect |
| HTTPS | TCP 443 | `0.0.0.0/0`, used by browsers |
| SSH | TCP 22 | Your current public IP `/32`, if using SSH |

Retain any intentional management access method. Do not expose Guacamole/Tomcat 8080 or guacd 4822 to the internet. Windows TCP 3389 must accept the **gateway security group** as source, not the public internet. Verify routing, network ACLs and outbound gateway access permit DNS/HTTPS and private RDP.

Do not remove management access before verifying your replacement access works. If Ubuntu UFW is active, inspect its rules and allow the existing management connection plus HTTP/HTTPS; do not enable/reset a firewall blindly.

## 5. Connect to Ubuntu and inspect the existing services

Use AWS EC2 → gateway → Connect with your configured connection method, or use your existing private key from **PowerShell**:

```powershell
ssh -i "C:\path\to\your-key.pem" ubuntu@YOUR-GATEWAY-PUBLIC-IP
```

Then run on **Ubuntu**:

```bash
cat /etc/os-release
sudo systemctl status nginx --no-pager
sudo ss -ltnp
sudo docker ps --format 'table {{.Names}}\t{{.Ports}}'
curl -I http://127.0.0.1:8080/guacamole/
sudo ls -l /etc/nginx/sites-enabled /etc/nginx/conf.d
sudo nginx -t
```

Expected: Nginx is the intended frontend proxy and local Guacamole returns a normal HTTP response such as 200/302. If Docker is not installed, skip that inspection command and identify the existing native Tomcat service. If local Guacamole returns connection refused, fix its actual listening address/port before continuing.

Inspect the existing Nginx site locally to find the active `server` block and launcher path. Avoid sharing `nginx -T` or Docker inspect output unredacted because configuration may contain secrets. If a different server owns port 80, stop here and adapt the procedure to it.

## 6. Back up the current Nginx configuration

**Ubuntu**:

```bash
sudo cp -a /etc/nginx /etc/nginx.before-helpdesk-https
sudo test -f /var/www/html/guac-launch.html
```

Use a different backup directory if that backup already exists; preserve the original. Confirm where your existing launcher is stored if the `test` exits unsuccessfully. Never replace working Docker/Guacamole configuration just to add HTTPS.

If Nginx is absent and no other service owns 80/443, install it on Ubuntu:

```bash
sudo apt update
sudo apt install nginx
```

## 7. Prepare an HTTP site for certificate validation

Edit the **existing gateway Nginx site** using `sudo nano /etc/nginx/sites-available/YOUR-ACTUAL-SITE`. If no site exists, create `/etc/nginx/sites-available/helpdesk-guacamole` and enable it with a symlink in `sites-enabled`. Do not create duplicate `server_name` entries for the same hostname.

Set the port-80 site's hostname and retain the working Guacamole proxy and launcher. A minimal site, assuming the checked paths/ports match, is:

```nginx
server {
    listen 80;
    server_name YOUR-HOST.duckdns.org;
    root /var/www/html;

    location /guacamole/ {
        proxy_pass http://127.0.0.1:8080/guacamole/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
    location = /guac-launch.html {
        try_files $uri =404;
    }
}
```

Only if you created a new, not-yet-enabled site:

```bash
sudo ln -s /etc/nginx/sites-available/helpdesk-guacamole /etc/nginx/sites-enabled/helpdesk-guacamole
```

Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Only reload after the test succeeds. From your browser, verify `http://YOUR-HOST.duckdns.org/guacamole/` reaches the intended gateway. Do not sign in over HTTP.

## 8. Install Certbot and obtain the certificate

These commands follow the Certbot **Nginx/Linux snap** installation route. If Certbot is already installed by apt or another method, use that installation's matching instructions rather than mixing package managers. [Official Certbot instructions](https://certbot.eff.org/instructions?ws=nginx&os=snap)

**Ubuntu**, for an installation without existing Certbot:

```bash
sudo snap install --classic certbot
sudo /snap/bin/certbot --nginx -d YOUR-HOST.duckdns.org
```

Enter your email, review the terms, and accept HTTP→HTTPS redirection if prompted. Certbot needs the hostname to resolve correctly and public TCP 80 reachable for this validation route.

After success:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo /snap/bin/certbot renew --dry-run
sudo systemctl list-timers --all
```

Verify an automated renewal mechanism exists and the dry run succeeds. Keep required challenge access available. If snap is unavailable, use the appropriate official Certbot route for the detected Ubuntu version.

## 9. Finish the TLS proxy, frame policy and launcher

The repository provides `infrastructure/guacamole/nginx-tls.conf.example`. It requires an existing certificate and the correct upstream. Adapt the already-working site; do not paste a second duplicate site alongside Certbot's configuration.

Required final behavior:

- Port 80 redirects to HTTPS; port 443 uses the issued certificate.
- `/guacamole/` proxies to the verified local upstream with WebSocket upgrade support, buffering off and adequate read timeout.
- `/guac-launch.html` serves the repository's current launcher from the same HTTPS origin.
- Gateway access logs omit query strings because launch URLs contain bearer data.
- Gateway frame policy permits the Vercel origin **and the gateway itself**. The launcher contains a same-origin nested iframe, so every ancestor must be allowed.

Inside the HTTPS server block, use:

```nginx
add_header Referrer-Policy no-referrer always;
add_header X-Content-Type-Options nosniff always;
add_header Content-Security-Policy "frame-ancestors 'self' https://helpdesks-ai.vercel.app" always;
```

Inspect response headers for conflicting upstream CSP or `X-Frame-Options: DENY/SAMEORIGIN`. They can still block cross-origin embedding even when another header allows it. If upstream framing headers need replacement, replace them narrowly with the explicit policy above; do not globally remove all security headers.

For no-query logging, define this in Nginx's `http` context, outside `server` blocks, and use it in both gateway server blocks:

```nginx
log_format guac_no_args '$remote_addr [$time_local] "$request_method $uri $server_protocol" $status $body_bytes_sent';
```

```nginx
access_log /var/log/nginx/guacamole-access.log guac_no_args;
```

Review upstream/Tomcat logs too; the Nginx format does not sanitize other logs. Avoid authenticating launch URLs through HTTP.

If the launcher is missing/outdated, copy the repository file from your computer. **PowerShell, repository root**:

```powershell
scp -i "C:\path\to\your-key.pem" .\helpdesk-ai\infrastructure\guacamole\guac-launch.html ubuntu@YOUR-GATEWAY-PUBLIC-IP:/tmp/guac-launch.html
```

**Ubuntu**, after verifying the destination matches your Nginx root:

```bash
sudo install -m 644 /tmp/guac-launch.html /var/www/html/guac-launch.html
sudo nginx -t
sudo systemctl reload nginx
```

Browser checks:

```text
https://YOUR-HOST.duckdns.org/guacamole/
https://YOUR-HOST.duckdns.org/guac-launch.html
```

No certificate warning should appear. Opening the launcher without a generated token should say a secure connection link was not provided; that is expected. It does not prove RDP works yet. Do not paste a real signed token into screenshots or public test tools.

## 10. Configure Render while launches remain disabled

**Render → existing API Web Service → Environment → Edit**:

| Key | Value |
| --- | --- |
| `GUACAMOLE_BASE_URL` | `https://YOUR-HOST.duckdns.org/guacamole` |
| `GUACAMOLE_LAUNCH_URL` | `https://YOUR-HOST.duckdns.org/guac-launch.html` |
| `GUAC_JSON_SECRET` | New private 32-hex-character value matching the gateway JSON extension |
| `WINDOWS_LAB_USERNAME` | Actual account in the Windows AMI |
| `WINDOWS_LAB_PASSWORD` | New private password matching that AMI/account |
| `AWS_REGION` | `ap-southeast-1` |
| `AWS_SIMULATION_LAUNCH_TEMPLATE_ID` | Verified existing Windows launch template ID |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Current least-privilege backend credentials if using static IAM keys |
| `SIMULATION_TTL_MINUTES` | `20` |
| `SIMULATION_MAX_PER_USER` | `1` |
| `SIMULATION_GLOBAL_MAX` | `3` |
| `GUAC_URL_TTL_SECONDS` | `300` |
| `WINDOWS_SIMULATIONS_ENABLED` | Keep `false` |

The JSON extension must be installed/enabled on the gateway and share exactly the same secret (`JSON_SECRET_KEY` for the relevant Docker configuration or `json-secret-key` natively). Updating Docker environment configuration generally requires recreating the affected container; restarting alone does not apply changed container environment variables. Preserve your actual Compose service names, volumes and working configuration.

Never put these secrets into Vercel. An AWS instance IAM role on the gateway does not automatically provide credentials to the Render backend. Do not give Render AWS administrator credentials. Review `WINDOWS_LAB_SECURITY` and `WINDOWS_LAB_IGNORE_CERT` deliberately rather than copying permissive local values without checking RDP behavior.

Save and deploy Render. Keep `DATABASE_URL` as the restricted runtime URL and preserve the working AI settings.

## 11. Verify the Windows image and independent cleanup

The actual operating system comes from the launch template's AMI, not the words in an AI prompt. Existing project documentation describes Windows Server 2025; verify the real AMI before advertising the experience as Windows 11.

Check the template default version, subnet, encrypted storage, security group, account credentials and private RDP path. Do not expose student instances directly to the internet for troubleshooting.

The repository contains `infrastructure/aws/cleanup-watchdog.js` and `watchdog-template.yaml`. Their presence does not mean cleanup is deployed. The template's local `Code: ./` needs packaging for deployment; it cannot be uploaded unchanged as a ready-to-run Lambda code definition.

To configure the existing watchdog through AWS Console:

1. Create/review a Lambda execution role with CloudWatch logging, `ec2:DescribeInstances`, and `ec2:TerminateInstances` restricted to instances with both `Project=HelpDeskAI` and `Purpose=UserSimulation`. The template shows the intended policy; adapt the account/region ARN.
2. Create a Node.js 22 Lambda in Singapore using that role and a 60-second timeout. Upload the watchdog as `cleanup-watchdog.js` at the deployment zip root; set handler `cleanup-watchdog.handler`. Package its AWS SDK dependency explicitly for reproducible deployment, or verify the runtime-provided SDK is compatible.
3. Add an EventBridge scheduled rule running every five minutes and targeting the function, with permission for EventBridge to invoke it. Review the template's schedule and invocation permission resources.
4. Add monitoring/notification for function failures. A CloudWatch alarm without an action/recipient alone does not notify the team.
5. Inspect the targeted instance tags. The script requires `SessionId` and a valid ISO `AutoTerminateAt`; missing tags are logged for manual review, not automatically terminated.
6. Test with a disposable, explicitly tagged lab. Verify it terminates after its expiry even with the application inactive. Do not tag the gateway or Windows master image as a disposable student lab.

This creates AWS resources and may incur charges. Verify the scope before the test; the watchdog is intended to terminate expired tagged instances. If this setup has not been verified, keep launches disabled and finish this infrastructure step before enabling for users.

## 12. Enable and test the application

Only after the preceding gates pass:

**Render**, change `WINDOWS_SIMULATIONS_ENABLED=true` and deploy.

**Vercel**, set Config variables for Production:

```dotenv
VITE_WINDOWS_SIMULATIONS_ENABLED=true
VITE_GUACAMOLE_ORIGIN=https://YOUR-HOST.duckdns.org
VITE_API_URL=/
```

Use the origin only for `VITE_GUACAMOLE_ORIGIN`: no `/guacamole` path. Redeploy Vercel; frontend environment values are consumed at build time. Render's `CLIENT_URL` remains `https://helpdesks-ai.vercel.app`.

Test one lab first:

1. Sign in with a test account and start a published Windows module.
2. Watch provisioning through the application; verify the EC2 instance is private and has the expected ownership/expiry tags.
3. Wait for the configured boot/preparation interval. An immediate Windows desktop is not expected.
4. Verify the browser shows HTTPS and WebSocket connection succeeds without CSP/frame or mixed-content errors.
5. Verify the correct Windows account/desktop appears and no admin/shared production data is present.
6. Select End Simulation. Verify EC2 reaches **terminated**, not just that the modal closes.
7. Run a separate bounded expiry test, then verify the independent watchdog works with the API inactive. Check both AWS state and subsequent application reconciliation.
8. Verify another user cannot access this lab's status/connect/end routes and repeated launches obey quotas.

If a connection fails, end the test instance and inspect logs. Do not create repeated replacement labs while an earlier instance is still running.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| DNS resolves to an old IP | Current EC2 public IPv4 versus DuckDNS record; remove incorrect AAAA records |
| Certbot validation fails | Correct DNS, public TCP 80, active Nginx hostname, OS firewall and challenge routing |
| HTTPS 502 | Local Guacamole service/upstream port; test `127.0.0.1:8080/guacamole/` |
| Browser refuses iframe | Vercel frame-src, gateway frame-ancestors including self and app origin, conflicting CSP/X-Frame-Options |
| Guacamole loads but no desktop | JSON extension/secret, expired token, private RDP route, Windows account and launch-template image |
| Connection drops | WebSocket upgrade/proxy buffering/timeouts, actual lab expiry and instance state |
| Still says Windows unavailable | Backend flag and latest Render deployment; check frontend build flag separately |
| Costs continue after ending | EC2 termination status, gateway costs, orphan labs and watchdog logs |

## Rollback and completion record

If rollout fails, set both Windows flags back to `false` and redeploy. Terminate any disposable test lab through the authorized app/AWS procedure and verify its final state. Do not terminate the gateway or master image by mistake. Restore only the necessary Nginx site from the backup if needed; run `nginx -t` before reloading.

- [ ] Actual hostname: ____________________
- [ ] Gateway current IP verified, DNS correct
- [ ] HTTPS and renewal dry run pass
- [ ] Launcher and nested frame/WebSocket behavior verified
- [ ] Private RDP and current credentials verified
- [ ] Render settings applied, Vercel rebuilt
- [ ] Independent watchdog tested and alerts delivered
- [ ] Launch, manual end, expiry and account isolation verified
- [ ] Disposable instances terminated; remaining AWS costs reviewed

References: [DuckDNS setup](https://www.duckdns.org/install.jsp), [Certbot Nginx instructions](https://certbot.eff.org/instructions?ws=nginx&os=snap), [Apache Guacamole reverse proxy](https://guacamole.apache.org/doc/gug/reverse-proxy.html), [AWS Elastic IP behavior/charges](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html).
