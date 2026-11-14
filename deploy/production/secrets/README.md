# Production secrets

Create these files before starting Compose. Keep them out of source control and readable only by the owner:

```sh
mkdir -p secrets
openssl rand -hex 32 > secrets/db_password
openssl rand -base64 48 > secrets/auth_secret
openssl rand -base64 32 > secrets/encryption_key
: > secrets/kong_admin_token
: > secrets/smtp_password
chmod 600 secrets/*
```

Put the Kong Admin token and SMTP password in their files only when those integrations need them. Back up `encryption_key` separately; database backups cannot recover encrypted credentials without it.
