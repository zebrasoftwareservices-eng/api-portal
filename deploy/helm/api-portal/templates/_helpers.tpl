{{- define "api-portal.name" -}}api-portal{{- end }}
{{- define "api-portal.fullname" -}}{{ printf "%s-%s" .Release.Name (include "api-portal.name" .) | trunc 63 | trimSuffix "-" }}{{- end }}
{{- define "api-portal.labels" -}}
app.kubernetes.io/name: {{ include "api-portal.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
{{- define "api-portal.tag" -}}{{ default .Chart.AppVersion .Values.image.tag }}{{- end }}
{{- define "api-portal.secret" -}}{{ default (printf "%s-secrets" (include "api-portal.fullname" .)) .Values.secrets.existingSecret }}{{- end }}
{{- define "api-portal.publicUrl" -}}
{{- if and .Values.ingress.enabled (not .Values.publicUrl) -}}{{ fail "publicUrl is required when ingress.enabled is true" }}{{- end -}}
{{- default "http://localhost:3000" .Values.publicUrl -}}
{{- end }}
