#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$root"
chart=deploy/helm/api-portal
release=portal-smoke
external_release=external
portal_deployment="$release-api-portal-portal"
portal_service="$release-api-portal-portal"
postgres_statefulset="$release-api-portal-postgres"
cleanup() {
  [ -z "${forward_pid:-}" ] || kill "$forward_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
fail() { echo "FAIL: $*" >&2; exit 1; }
restart_counts() {
  kubectl get pods -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=server" \
    -o jsonpath='{range .items[*]}{.metadata.name}={.status.containerStatuses[0].restartCount}{"\n"}{end}' | sort
}
post_setup() {
  pod=$1 port=$2 expected=$3
  kubectl port-forward "pod/$pod" "$port:4000" >"/tmp/$release-port-forward.log" 2>&1 &
  forward_pid=$!
  i=0
  until curl -fsS "http://127.0.0.1:$port/api/v1/health/live" >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -lt 30 ] || fail "port-forward to $pod did not become ready"
    sleep 1
  done
  status=$(curl -sS -o "/tmp/$release-setup-response.json" -w '%{http_code}' \
    -H 'content-type: application/json' -X POST "http://127.0.0.1:$port/api/v1/setup/admin" \
    --data "{\"email\":\"helm-admin@example.com\",\"password\":\"helm-smoke-password\",\"setupToken\":\"$setup_token\"}")
  kill "$forward_pid" 2>/dev/null || true
  wait "$forward_pid" 2>/dev/null || true
  forward_pid=
  [ "$status" = "$expected" ] || fail "setup through $pod returned $status, expected $expected: $(cat "/tmp/$release-setup-response.json")"
}
helm lint "$chart" --kube-version 1.37.0
helm template "$release" "$chart" --kube-version 1.37.0 >/dev/null
helm template external "$chart" --kube-version 1.37.0 --set externalDatabase.url=postgres://portal:password@postgres:5432/portal >/dev/null
invalid_output=$(mktemp)
if helm template invalid "$chart" --kube-version 1.37.0 --set ingress.enabled=true --set ingress.host=portal.example.com >"$invalid_output" 2>&1; then
  echo 'ingress without publicUrl unexpectedly rendered' >&2
  exit 1
fi
grep -q publicUrl "$invalid_output" || fail 'invalid ingress error does not name publicUrl'
rm -f "$invalid_output"
docker build -f apps/server/Dockerfile -t local/api-portal-server:smoke .
docker build -f apps/portal/Dockerfile -t local/api-portal-portal:smoke .
kind load docker-image local/api-portal-server:smoke local/api-portal-portal:smoke
helm upgrade --install "$release" "$chart" --set image.registry=local --set image.tag=smoke --set image.pullPolicy=Never --set server.replicas=2 --wait --timeout 10m
kubectl rollout status deployment/"$release"-api-portal-server --timeout=2m
kubectl rollout status deployment/"$release"-api-portal-portal --timeout=2m
kubectl exec deployment/"$portal_deployment" -- node -e \
  "fetch('http://$portal_service:3000').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
  || fail 'portal did not answer through its Service'
for pod in $(kubectl get pods -l "app.kubernetes.io/instance=$release" -o name); do
  for container in $(kubectl get "$pod" -o jsonpath='{.spec.containers[*].name}'); do
    uid=$(kubectl exec "$pod" -c "$container" -- id -u)
    [ "$uid" != 0 ] || fail "$pod/$container runs as root"
  done
done
helm get manifest "$release" | grep -Eiq 'kong|cert-manager|ingress-controller' && fail 'chart unexpectedly installs infrastructure dependencies'

server_pods=$(kubectl get pods -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=server" -o jsonpath='{.items[*].metadata.name}')
[ "$(printf '%s\n' "$server_pods" | wc -w | tr -d ' ')" = 2 ] || fail 'expected two server pods'
tokens=
for pod in $server_pods; do
  token=$(kubectl logs "$pod" | sed -n 's/.*Setup token for the first admin: \([0-9a-f]\{64\}\).*/\1/p' | tail -n 1)
  [ -n "$token" ] || fail "$pod did not log a setup token"
  tokens="$tokens$token\n"
done
[ "$(printf '%b' "$tokens" | sed '/^$/d' | sort -u | wc -l | tr -d ' ')" = 1 ] || fail 'server replicas logged different setup tokens'
setup_token=$(printf '%b' "$tokens" | sed '/^$/d' | head -n 1)
set -- $server_pods
post_setup "$2" 14002 201
[ "$(kubectl exec "$release-api-portal-postgres-0" -- psql -U portal -d portal -Atqc 'select count(*) from setup_tokens')" = 0 ] \
  || fail 'setup token row remains after claim'
post_setup "$1" 14001 409
post_setup "$2" 14002 409

before_restarts=$(restart_counts)
kubectl scale statefulset/"$postgres_statefulset" --replicas=0
kubectl wait --for=delete pod/"$postgres_statefulset-0" --timeout=2m
kubectl wait --for=condition=ready=false pod -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=server" --timeout=2m
[ -z "$(kubectl get endpoints "$release-api-portal-server" -o jsonpath='{.subsets[*].addresses[*].ip}')" ] \
  || fail 'NotReady servers remain in the Service Endpoints'
for pod in $server_pods; do
  kubectl exec "$pod" -- node -e "fetch('http://127.0.0.1:4000/api/v1/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
    || fail "$pod liveness failed during the database outage"
done
[ "$(restart_counts)" = "$before_restarts" ] || fail 'server restarted during the database outage'
kubectl scale statefulset/"$postgres_statefulset" --replicas=1
kubectl rollout status statefulset/"$postgres_statefulset" --timeout=2m
kubectl wait --for=condition=ready pod -l "app.kubernetes.io/instance=$release,app.kubernetes.io/component=server" --timeout=5m
[ "$(restart_counts)" = "$before_restarts" ] || fail 'server restarted while database recovered'

db_password=$(kubectl get secret "$release-api-portal-secrets" -o jsonpath='{.data.db-password}' | base64 -d)
helm upgrade --install "$external_release" "$chart" \
  --set image.registry=local --set image.tag=smoke --set image.pullPolicy=Never \
  --set-string "externalDatabase.url=postgres://portal:$db_password@$release-api-portal-postgres:5432/portal" \
  --wait --timeout 5m
[ -z "$(kubectl get pods -l "app.kubernetes.io/instance=$external_release,app.kubernetes.io/component=postgres" -o name)" ] \
  || fail 'externalDatabase release created a Postgres pod'
kubectl wait --for=condition=available deployment/"$external_release-api-portal-server" --timeout=2m
echo 'PASS: AC 7-10 runtime assertions (Service, non-root, dependencies, outage, shared token, external database and ingress validation)'
