#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$root"
chart=deploy/helm/api-portal
release=portal-smoke
helm lint "$chart" --kube-version 1.37.0
helm template "$release" "$chart" --kube-version 1.37.0 >/dev/null
helm template external "$chart" --kube-version 1.37.0 --set externalDatabase.url=postgres://portal:password@postgres:5432/portal >/dev/null
if helm template invalid "$chart" --kube-version 1.37.0 --set ingress.enabled=true --set ingress.host=portal.example.com >/dev/null 2>&1; then
  echo 'ingress without publicUrl unexpectedly rendered' >&2
  exit 1
fi
docker build -f apps/server/Dockerfile -t local/api-portal-server:smoke .
docker build -f apps/portal/Dockerfile -t local/api-portal-portal:smoke .
kind load docker-image local/api-portal-server:smoke local/api-portal-portal:smoke
helm upgrade --install "$release" "$chart" --set image.registry=local --set image.tag=smoke --set image.pullPolicy=Never --set server.replicas=2 --wait --timeout 10m
kubectl rollout status deployment/"$release"-api-portal-server --timeout=2m
kubectl rollout status deployment/"$release"-api-portal-portal --timeout=2m
kubectl scale statefulset/"$release"-api-portal-postgres --replicas=0
kubectl wait --for=delete pod/"$release"-api-portal-postgres-0 --timeout=2m
kubectl scale statefulset/"$release"-api-portal-postgres --replicas=1
kubectl rollout status statefulset/"$release"-api-portal-postgres --timeout=2m
kubectl wait --for=condition=available deployment/"$release"-api-portal-server --timeout=5m
helm get manifest "$release" | grep -Eiq 'kong|cert-manager|ingress-controller' && { echo 'chart unexpectedly installs infrastructure dependencies' >&2; exit 1; }
