# --- Etapa 1: construir el sitio -------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Se copian primero los manifiestos para que la capa de dependencias
# se reutilice mientras no cambien.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# El dominio se inyecta en el build: de ahí salen el sitemap, las URL
# canónicas y las etiquetas Open Graph. Ver README > Despliegue.
ARG SITE_URL
ARG BASE_PATH
# Webhook de n8n que recibe las postulaciones de negocios. Si no se pasa, la
# página /registrar se construye con el formulario deshabilitado y el correo
# de contacto a la vista, en vez de fallar al enviar.
ARG N8N_REGISTRO_URL
ENV SITE_URL=$SITE_URL
ENV BASE_PATH=$BASE_PATH
ENV N8N_REGISTRO_URL=$N8N_REGISTRO_URL

RUN npm run build

# --- Etapa 2: servir estático ----------------------------------------------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
