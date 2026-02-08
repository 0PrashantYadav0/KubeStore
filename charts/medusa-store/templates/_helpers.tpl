{{/*
Expand the name of the chart.
*/}}
{{- define "medusa-store.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "medusa-store.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "medusa-store.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "medusa-store.labels" -}}
helm.sh/chart: {{ include "medusa-store.chart" . }}
{{ include "medusa-store.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "medusa-store.selectorLabels" -}}
app.kubernetes.io/name: {{ include "medusa-store.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Store ID - defaults to release name if not provided
*/}}
{{- define "medusa-store.storeId" -}}
{{- default .Release.Name .Values.store.id }}
{{- end }}

{{/*
PostgreSQL hostname
*/}}
{{- define "medusa-store.postgresHost" -}}
{{- printf "%s-postgresql" (include "medusa-store.fullname" .) }}
{{- end }}

{{/*
Redis hostname
*/}}
{{- define "medusa-store.redisHost" -}}
{{- printf "%s-redis" (include "medusa-store.fullname" .) }}
{{- end }}

{{/*
Ingress hostname
*/}}
{{- define "medusa-store.ingressHost" -}}
{{- printf "store-%s.%s" (include "medusa-store.storeId" .) .Values.ingress.baseDomain }}
{{- end }}
