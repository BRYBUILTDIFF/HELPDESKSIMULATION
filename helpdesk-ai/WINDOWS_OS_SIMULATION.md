# Windows OS simulation

## Implemented in this repository

- Simulation modules persist `simulation.surface` independently of `terminalType`.
- `windows-os` modules launch an isolated EC2 instance through the backend only.
- Each session is recorded in PostgreSQL and is owned by one authenticated user.
- The browser polls `/api/simulation-sessions/:id` and receives only a short-lived, encrypted Guacamole URL.
- The frontend never receives EC2 identifiers, private IP addresses, AWS credentials, Windows credentials, or the Guacamole secret.
- Expired sessions are terminated by a five-minute server cleanup pass. Configure an AWS EventBridge/Lambda backstop separately.

## Required server environment variables

```env
AWS_REGION=ap-southeast-1
AWS_SIMULATION_LAUNCH_TEMPLATE_ID=
SIMULATION_TTL_MINUTES=20
SIMULATION_MAX_PER_USER=1
SIMULATION_GLOBAL_MAX=1
WINDOWS_LAB_USERNAME=
WINDOWS_LAB_PASSWORD=
GUACAMOLE_BASE_URL=https://guacamole.example.com/guacamole
GUAC_JSON_SECRET=
```

`GUAC_JSON_SECRET` must be exactly 32 hexadecimal characters (128 bits) and must match Guacamole's `JSON_SECRET_KEY` / `json-secret-key`. Keep all of these values only in the server environment or a secrets manager.

## Manual AWS setup required

1. Create a private Windows Server 2022 AMI for the labs. Do not include production data or credentials.
2. Create an EC2 Launch Template with `t3.small`, 30 GB encrypted gp3, CPU credits set to Standard, IMDSv2 required, a private subnet, **no public IPv4**, and `helpdesk-windows-sg`. The application only supplies this template ID; it cannot override these settings.
3. The Windows security group must allow inbound TCP 3389 only from the Guacamole security group. Never allow public RDP. With no NAT Gateway, do not depend on unrestricted Windows internet access for the lab workflow.
4. Run Guacamole on a separate Ubuntu 24.04 `t3.micro` in a public subnet, behind Nginx and HTTPS, using Docker and `guacd`. It reaches Windows through VPC private IPv4 only.
5. Give the backend runtime IAM role least-privilege permission to run, describe, tag, and terminate only your simulation Launch Template/instances.
6. Configure a budget, global instance quota, and AWS-side EventBridge/Lambda cleanup for instances tagged `Project=HelpDeskAI` and `Purpose=UserSimulation`. Do not add a NAT Gateway, ALB, ECS/Fargate, or RDS for this proof of concept.

## Manual Guacamole setup required

1. Deploy Guacamole and `guacd` in the same VPC/network path as the private Windows instances, behind HTTPS.
2. Install/enable the matching `guacamole-auth-json` extension.
3. Configure `JSON_ENABLED=true` and `JSON_SECRET_KEY` for Docker, or `json-secret-key` for a native deployment.
4. Ensure Guacamole can reach only the Windows lab security group on TCP 3389.
5. Set `GUACAMOLE_BASE_URL` to the HTTPS Guacamole application URL. It must permit browser iframe use from the Help Desk application; configure CSP/frame ancestors deliberately.

## Database deployment

Review and apply the checked-in migration in a safe environment:

```bash
cd server
npx prisma migrate deploy
npm run generate
```

For local development only, use `npx prisma migrate dev` after reviewing the generated migration. Do not use destructive reset commands against production.

## Verification

```bash
cd server
npx prisma validate
npm run generate
node src/server.js

cd ../client
npm run build
```

Create an admin module with `simulation.surface` set to `windows-os`, publish it, then open it in `/simulations` as a normal user. The user should see a provisioning screen while the backend creates the private EC2 session.
