{{/*
Expand the name of the chart.
*/}}
{{- define "woocommerce-store.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "woocommerce-store.fullname" -}}
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
{{- define "woocommerce-store.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "woocommerce-store.labels" -}}
helm.sh/chart: {{ include "woocommerce-store.chart" . }}
{{ include "woocommerce-store.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "woocommerce-store.selectorLabels" -}}
app.kubernetes.io/name: {{ include "woocommerce-store.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Store ID - defaults to release name if not provided
*/}}
{{- define "woocommerce-store.storeId" -}}
{{- default .Release.Name .Values.store.id }}
{{- end }}

{{/*
MariaDB hostname
*/}}
{{- define "woocommerce-store.mariadbHost" -}}
{{- printf "%s-mariadb" (include "woocommerce-store.fullname" .) }}
{{- end }}

{{/*
Ingress hostname
*/}}
{{- define "woocommerce-store.ingressHost" -}}
{{- printf "store-%s.%s" (include "woocommerce-store.storeId" .) .Values.ingress.baseDomain }}
{{- end }}
