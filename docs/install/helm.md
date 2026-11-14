# Install with Helm

The chart supports Kubernetes 1.37 and Helm 3. It installs only the portal, server, and—by default—a small bundled PostgreSQL StatefulSet. It does not install Kong, an ingress controller, cert-manager, or any other cluster infrastructure.

```sh
helm upgrade --install portal deploy/helm/api-portal \
  --namespace portal --create-namespace \
  --set image.tag=0.8.0
```

Without ingress, follow `NOTES.txt` to port-forward the portal. With ingress, both a host and public URL are required:

```sh
helm upgrade --install portal deploy/helm/api-portal \
  --namespace portal --create-namespace \
  --set image.tag=0.8.0 \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.host=portal.example.com \
  --set publicUrl=https://portal.example.com
```

The generated authentication, encryption, and database secrets are retained across upgrades and uninstall. For controlled secret management, set `secrets.existingSecret` to a Secret containing `auth-secret`, `encryption-key`, and `db-password`.

For an external database, set `externalDatabase.url`, or set `externalDatabase.existingSecret` and `externalDatabase.key`. Either choice disables the bundled PostgreSQL resources. Configure Kong and SMTP with their values and Secret references; do not put credentials in values files.

## Back up and upgrade

For the bundled database, run `pg_dump -Fc` and `pg_restore` inside the `<release>-api-portal-postgres-0` pod. Back up an external database with the operator's normal tooling. Always retain the encryption key with the database backup.

Upgrade with `helm upgrade --set image.tag=<exact-version>`. To roll back, scale the server deployment to zero, restore the pre-upgrade database dump, then run `helm upgrade` using the previous image tag. Do not use `helm rollback` without restoring the database first because migrations are forward-only.
